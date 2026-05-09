# Tag-Triggered Release Automation 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `make release VERSION=x.y.z` 한 줄로 version bump → main 커밋/푸시 → 태그 푸시 → GitHub Release 생성 + 빌드 zip 첨부까지 자동화한다.

**Architecture:** `gradle.properties`를 version 단일 진실의 원천(SoT)으로 만들고, `build.gradle.kts`가 거기서 값을 읽도록 변경. `Makefile`이 사전 검증과 git/gh 작업을 처리하며, 기존 `release.yml` 워크플로는 태그 푸시 트리거로 zip을 빌드해 release에 첨부하는 책임만 유지.

**Tech Stack:** GNU Make · bash · git · GitHub CLI (`gh`) · GitHub Actions · Gradle 8 · Kotlin DSL

**Spec:** `docs/superpowers/specs/2026-05-09-tag-release-automation-design.md`

---

## File Structure

### Created

```
markora/
└── Makefile                                preflight + bump-version, tag, release 타겟
```

### Modified

```
markora/
├── build.gradle.kts                        version 리터럴 → providers.gradleProperty()
├── gradle.properties                       (값 변경 없음, SoT 역할로 격상)
└── .github/workflows/release.yml           concurrency 그룹 추가
```

### Untouched

- `.github/workflows/build.yml` (변경 없음)
- `CHANGELOG.md` (수동 관리 유지, 자동화 안 함)

---

## Branch Strategy

이 작업은 main 직접 커밋 금지 정책에 따라 **`chore/tag-release-automation`** feature branch에서 진행하고 PR로 머지한다.

```bash
cd /Users/user/src/workspace_markora/markora
git checkout main && git pull origin main
git checkout -b chore/tag-release-automation
```

---

## Task 1: build.gradle.kts가 gradle.properties의 pluginVersion을 읽도록 변경

**Files:**
- Modify: `build.gradle.kts:9`
- Reference (no change): `gradle.properties:4`

- [ ] **Step 1: 현재 상태 확인**

```bash
grep -n 'version' build.gradle.kts | head -5
grep -n 'pluginVersion' gradle.properties
```

Expected:
```
build.gradle.kts:9:version = "0.1.0"
build.gradle.kts:41:        version = project.version.toString()
gradle.properties:4:pluginVersion = 0.1.0
```

- [ ] **Step 2: build.gradle.kts:9의 하드코딩된 version을 gradle.properties에서 읽도록 수정**

`build.gradle.kts` line 9의 `version = "0.1.0"`을 다음으로 교체:

```kotlin
version = providers.gradleProperty("pluginVersion").get()
```

- [ ] **Step 3: Gradle이 정확히 같은 버전을 인식하는지 확인**

```bash
./gradlew properties -q | grep '^version:'
```

Expected:
```
version: 0.1.0
```

값이 0.1.0이면 build.gradle.kts가 gradle.properties를 올바르게 읽고 있다는 증거.

- [ ] **Step 4: 빌드가 깨지지 않는지 확인**

```bash
./gradlew build -x test
```

Expected: `BUILD SUCCESSFUL`. (시간 단축을 위해 테스트 제외, 빌드만 검증)

- [ ] **Step 5: 커밋**

```bash
git add build.gradle.kts
git commit -m "refactor: read pluginVersion from gradle.properties as SoT"
```

---

## Task 2: Makefile 골격 + 공용 preflight 타겟 작성

**Files:**
- Create: `Makefile`

이 task는 Makefile의 변수 정의와 모든 preflight 타겟(`check-*`)만 만들고, 실제 동작 타겟(`bump-version` 등)은 다음 task에서 추가한다. 이 단계의 검증은 preflight들이 의도대로 실패/성공하는지 수동으로 확인.

- [ ] **Step 1: Makefile 신규 생성**

`markora/Makefile`을 다음 내용으로 생성:

```makefile
# Markora release automation
#
# Targets:
#   make help                         show this message
#   make bump-version VERSION=x.y.z   edit gradle.properties + commit + push to main
#   make tag VERSION=x.y.z            bump-version + git tag v$(VERSION) + push tag
#   make release VERSION=x.y.z        tag + gh release create v$(VERSION) --generate-notes

.PHONY: help bump-version tag release \
        check-version check-main check-clean check-tag-unique check-gh

VERSION ?=
SEMVER_REGEX := ^[0-9]+\.[0-9]+\.[0-9]+$$

help:
	@echo "Markora release automation"
	@echo ""
	@echo "Usage:"
	@echo "  make bump-version VERSION=x.y.z   # edit gradle.properties + commit + push to main"
	@echo "  make tag VERSION=x.y.z            # bump-version + git tag + push tag"
	@echo "  make release VERSION=x.y.z        # tag + gh release create"

check-version:
	@if [ -z "$(VERSION)" ]; then \
		echo "ERROR: VERSION is required (e.g. make release VERSION=0.2.0)"; exit 1; \
	fi
	@echo "$(VERSION)" | grep -Eq '$(SEMVER_REGEX)' || { \
		echo "ERROR: VERSION must match MAJOR.MINOR.PATCH (got '$(VERSION)')"; exit 1; \
	}

check-main:
	@branch=$$(git rev-parse --abbrev-ref HEAD); \
	if [ "$$branch" != "main" ]; then \
		echo "ERROR: must be on 'main' branch (currently on '$$branch')"; exit 1; \
	fi

check-clean:
	@git diff --quiet && git diff --cached --quiet || { \
		echo "ERROR: working tree has uncommitted changes"; exit 1; \
	}

check-tag-unique: check-version
	@if git rev-parse --verify "v$(VERSION)" >/dev/null 2>&1; then \
		echo "ERROR: tag v$(VERSION) already exists locally"; exit 1; \
	fi
	@git fetch --tags --quiet
	@if git ls-remote --exit-code --tags origin "refs/tags/v$(VERSION)" >/dev/null 2>&1; then \
		echo "ERROR: tag v$(VERSION) already exists on origin"; exit 1; \
	fi

check-gh:
	@command -v gh >/dev/null 2>&1 || { \
		echo "ERROR: gh CLI not found (install: https://cli.github.com)"; exit 1; \
	}
	@gh auth status >/dev/null 2>&1 || { \
		echo "ERROR: gh CLI is not authenticated (run 'gh auth login')"; exit 1; \
	}
```

- [ ] **Step 2: help 타겟 동작 확인**

```bash
make help
```

Expected: 위 makefile에 작성된 사용법이 그대로 출력.

- [ ] **Step 3: preflight 음성 테스트 — VERSION 누락**

```bash
make check-version
```

Expected: 종료 코드 비-0, 출력 `ERROR: VERSION is required ...`. 명령 종료 후 다음 확인:

```bash
make check-version; echo "exit=$?"
```

Expected: `exit=1`로 끝남.

- [ ] **Step 4: preflight 음성 테스트 — VERSION 형식 오류**

```bash
make check-version VERSION=0.2; echo "exit=$?"
make check-version VERSION=foo; echo "exit=$?"
make check-version VERSION=v0.2.0; echo "exit=$?"
```

Expected: 세 명령 모두 `ERROR: VERSION must match MAJOR.MINOR.PATCH ...` 출력 후 `exit=1`.

- [ ] **Step 5: preflight 양성 테스트 — VERSION 정상**

```bash
make check-version VERSION=0.2.0; echo "exit=$?"
```

Expected: 출력 없음, `exit=0`.

- [ ] **Step 6: preflight 음성 테스트 — main 브랜치 아님**

(현재 chore/tag-release-automation 브랜치에서 작업 중이므로 자동으로 음성 케이스)

```bash
make check-main; echo "exit=$?"
```

Expected: `ERROR: must be on 'main' branch (currently on 'chore/tag-release-automation')`, `exit=1`.

- [ ] **Step 7: preflight 음성 테스트 — clean 트리 아님**

(Makefile 자체가 untracked이므로 working tree는 dirty 상태일 가능성)

```bash
make check-clean; echo "exit=$?"
```

Expected: untracked 파일은 `git diff` 결과에 안 잡히므로 통과(exit=0). 만약 stage된 변경이 있으면 `ERROR: working tree has uncommitted changes`. 정확한 동작 확인을 위해 한 번 dirty로 만들어 테스트:

```bash
echo "test" >> README.md
make check-clean; echo "exit=$?"
git checkout README.md
```

Expected (중간 명령): `ERROR: working tree has uncommitted changes`, `exit=1`. 마지막 git checkout으로 복구.

- [ ] **Step 8: 커밋**

```bash
git add Makefile
git commit -m "chore: add Makefile skeleton with release preflight checks"
```

---

## Task 3: bump-version 타겟 추가

**Files:**
- Modify: `Makefile` (append target)

- [ ] **Step 1: bump-version 타겟을 Makefile에 추가**

`Makefile` 끝에 다음 추가:

```makefile

bump-version: check-version check-main check-clean
	@current=$$(grep '^pluginVersion = ' gradle.properties | sed 's/^pluginVersion = //'); \
	if [ "$$current" = "$(VERSION)" ]; then \
		echo "ERROR: pluginVersion is already $(VERSION) in gradle.properties"; exit 1; \
	fi
	@git fetch origin main --quiet
	@local_main=$$(git rev-parse main); \
	remote_main=$$(git rev-parse origin/main); \
	if [ "$$local_main" != "$$remote_main" ]; then \
		echo "ERROR: local main is not in sync with origin/main (run: git pull --ff-only)"; exit 1; \
	fi
	@# Portable in-place sed (works on both GNU and BSD sed via -i.bak)
	@sed -i.bak -E 's/^pluginVersion = .*/pluginVersion = $(VERSION)/' gradle.properties
	@rm -f gradle.properties.bak
	@grep -q '^pluginVersion = $(VERSION)$$' gradle.properties || { \
		echo "ERROR: gradle.properties update failed"; exit 1; \
	}
	@echo "Updated gradle.properties: pluginVersion = $(VERSION)"
	@git add gradle.properties
	@git commit -m "chore: bump version to $(VERSION)"
	@git push origin main
	@echo "Pushed bump commit to origin/main"
```

- [ ] **Step 2: 동작 확인 — chore/tag-release-automation 브랜치에서 음성 테스트**

```bash
make bump-version VERSION=0.0.99; echo "exit=$?"
```

Expected: `ERROR: must be on 'main' branch ...`, `exit=1` (branch 검증으로 차단됨, 실제 사이드 이펙트 없음).

- [ ] **Step 3: sed 명령어 단위 검증 — 임시 파일에 적용**

이 단계는 main 브랜치에서 실제 실행하기 전, sed 변환 로직만 검증하기 위해 임시 파일로 dry-run.

```bash
cp gradle.properties /tmp/gradle.properties.test
sed -i.bak -E 's/^pluginVersion = .*/pluginVersion = 0.2.0/' /tmp/gradle.properties.test
diff <(grep '^pluginVersion' gradle.properties) <(grep '^pluginVersion' /tmp/gradle.properties.test)
rm -f /tmp/gradle.properties.test /tmp/gradle.properties.test.bak
```

Expected diff:
```
< pluginVersion = 0.1.0
---
> pluginVersion = 0.2.0
```

- [ ] **Step 4: 커밋**

```bash
git add Makefile
git commit -m "chore: add Makefile bump-version target"
```

---

## Task 4: tag 타겟 추가

**Files:**
- Modify: `Makefile` (append target)

- [ ] **Step 1: tag 타겟을 Makefile에 추가**

`Makefile` 끝에 추가:

```makefile

tag: check-version check-main check-clean check-tag-unique bump-version
	@git tag "v$(VERSION)"
	@git push origin "v$(VERSION)"
	@echo "Pushed tag v$(VERSION) to origin"
```

순서 중요: 모든 preflight가 먼저 실행되고, 통과한 뒤에야 `bump-version`이 실행되어 사이드 이펙트 시작. Make는 한 번 실행한 prereq를 다시 실행하지 않으므로 `bump-version`의 자체 prereq(`check-version` 등)는 중복 실행되지 않는다.

- [ ] **Step 2: 음성 테스트 — feature 브랜치에서 차단되는지 확인**

```bash
make tag VERSION=0.0.99; echo "exit=$?"
```

Expected: `ERROR: must be on 'main' branch ...`, `exit=1`. 사이드 이펙트 없음 (gradle.properties 수정·태그 생성 없음).

- [ ] **Step 3: 음성 테스트 — 이미 존재하는 태그**

```bash
# 기존 태그가 있다면 그 버전으로 시도
git tag --list 'v*' | head -5
# 만약 v0.1.0이 있다면:
make tag VERSION=0.1.0; echo "exit=$?"
```

Expected: `ERROR: tag v0.1.0 already exists locally` (또는 origin), `exit=1`.

기존 태그가 없다면 임시로 만들어 테스트:
```bash
git tag v0.0.99-test
make tag VERSION=0.0.99 2>&1 | head -3   # check-tag-unique은 v0.0.99를 보지 v0.0.99-test은 안 봄
git tag -d v0.0.99-test
```

이 경우는 검증 못 함. 그냥 v0.1.0 케이스만 확인.

- [ ] **Step 4: 커밋**

```bash
git add Makefile
git commit -m "chore: add Makefile tag target"
```

---

## Task 5: release 타겟 추가

**Files:**
- Modify: `Makefile` (append target)

- [ ] **Step 1: release 타겟을 Makefile에 추가**

`Makefile` 끝에 추가:

```makefile

release: check-version check-main check-clean check-tag-unique check-gh tag
	@gh release create "v$(VERSION)" \
		--title "v$(VERSION)" \
		--generate-notes
	@echo "Created GitHub release v$(VERSION) (workflow will attach the plugin zip)"
```

`gh release create`는 release 페이지를 즉시 생성하고 자동 노트를 채운다. 워크플로의 `softprops/action-gh-release@v2`는 이미 존재하는 release에 zip을 첨부하는 idempotent 동작을 한다.

- [ ] **Step 2: gh 인증 확인 (음성 테스트는 따로 필요 없음)**

```bash
gh auth status
```

Expected: `Logged in to github.com as kenshin579 ...` 같은 출력. 인증 안 되어 있으면 `make release`가 `check-gh`에서 차단된다.

- [ ] **Step 3: feature 브랜치에서 음성 테스트**

```bash
make release VERSION=0.0.99; echo "exit=$?"
```

Expected: `ERROR: must be on 'main' branch ...`, `exit=1`.

- [ ] **Step 4: 커밋**

```bash
git add Makefile
git commit -m "chore: add Makefile release target"
```

---

## Task 6: release.yml에 concurrency 그룹 추가

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: 현재 release.yml 확인**

```bash
cat .github/workflows/release.yml
```

확인 포인트: `on: push: tags: ['v*']` 트리거가 있고, jobs/release/steps에 `softprops/action-gh-release@v2`가 있어야 한다.

- [ ] **Step 2: concurrency 블록 추가**

`.github/workflows/release.yml`을 다음 형태로 만든다 (기존 내용에 concurrency 블록만 추가):

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

jobs:
  release:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup JDK 21
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'

      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v4

      - name: Build plugin
        run: ./gradlew buildPlugin

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: build/distributions/*.zip
          generate_release_notes: true
```

`concurrency` 블록(8-10번 줄)만 신규 추가, 나머지는 기존과 동일.

- [ ] **Step 3: YAML 문법 검증**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"
echo "exit=$?"
```

Expected: 출력 없음, `exit=0`.

- [ ] **Step 4: 커밋**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add concurrency group to release workflow"
```

---

## Task 7: README와 CLAUDE.md에 릴리스 절차 문서화

**Files:**
- Modify: `README.md` (append "Release" section)
- Modify: `CLAUDE.md` (append "Release Process" line under Build Commands)

- [ ] **Step 1: README.md에 Release 섹션 추가**

`README.md` 파일의 적절한 위치(보통 Build/Development 섹션 다음)에 다음 추가:

```markdown
## Release

This project uses tag-triggered automated releases. The `gradle.properties` `pluginVersion` is the single source of truth for the plugin version.

```bash
# One-shot: bump version, push, tag, push tag, create GitHub release
make release VERSION=0.2.0

# Stepwise alternatives
make bump-version VERSION=0.2.0   # edit gradle.properties + commit + push to main
make tag VERSION=0.2.0            # bump-version + git tag v0.2.0 + push tag
```

The `release.yml` GitHub Actions workflow is triggered by the `v*` tag push, builds the plugin, and attaches the resulting `.zip` to the GitHub Release page.

`make release` requires the [GitHub CLI (`gh`)](https://cli.github.com) to be installed and authenticated. Before running it: ensure `CHANGELOG.md` has the unreleased changes documented (the file is manually maintained; auto-generated GitHub Release notes are added separately).
```

- [ ] **Step 2: CLAUDE.md의 Build Commands 섹션 아래에 Release 절차 한 줄 추가**

`CLAUDE.md`의 `## Build Commands` 코드 블록 뒤에 추가:

```markdown
## Release Process

Versioned via `gradle.properties` `pluginVersion`. Use `make release VERSION=x.y.z` (or `make tag` / `make bump-version` for partial steps). See README.md "Release" section for details.
```

- [ ] **Step 3: 커밋**

```bash
git add README.md CLAUDE.md
git commit -m "docs: document tag-triggered release process"
```

---

## Task 8: PR 생성 및 사용자 검증 안내

이 task는 코드 변경 없이 PR 생성과 머지 후 smoke test 안내만 담당한다.

- [ ] **Step 1: 브랜치 푸시**

```bash
git push -u origin chore/tag-release-automation
```

- [ ] **Step 2: PR 생성** (HEREDOC 필수, MCP github 도구 사용 금지)

```bash
gh pr create --title "chore: tag-triggered release automation" --body "$(cat <<'EOF'
## Summary
- `gradle.properties` `pluginVersion`을 version SoT로 격상하고 `build.gradle.kts`가 거기서 읽도록 변경
- `Makefile` 신규: `bump-version` / `tag` / `release` 3단계 타겟, semver/main/clean/tag-unique/gh 사전 검증
- `.github/workflows/release.yml`에 `concurrency` 그룹 추가 (같은 태그 중복 푸시 보호)
- README/CLAUDE.md에 릴리스 절차 문서화

CHANGELOG는 수동 관리 유지. 워크플로 트리거는 기존 `push: tags: v*` 그대로.

Spec: `docs/superpowers/specs/2026-05-09-tag-release-automation-design.md`
Plan: `docs/superpowers/plans/2026-05-09-tag-release-automation.md`

## Test plan
- [ ] `./gradlew properties` 결과의 `version:`이 `gradle.properties`의 `pluginVersion`과 일치
- [ ] `./gradlew build -x test` 통과
- [ ] Makefile 음성 테스트 (VERSION 누락/형식 오류/main 아님/dirty tree) 모두 사전 차단
- [ ] YAML 파싱 통과
- [ ] (머지 후) Smoke test: `make release VERSION=0.0.99` → 워크플로 성공 → release에 zip 첨부 확인 → cleanup
EOF
)"
```

리뷰어로 kenshin579 지정.

- [ ] **Step 3: 사용자에게 머지 후 smoke test 안내 출력**

다음 메시지를 사용자에게 전달:

> PR이 생성되었습니다. 머지 후 다음 smoke test를 한 번 수행해서 end-to-end 동작을 확인하세요:
>
> ```bash
> cd markora
> git checkout main && git pull origin main
> make release VERSION=0.0.99
> # → GitHub Actions 탭에서 release.yml run이 성공하는지 확인
> # → Releases 페이지에 v0.0.99가 생기고 plugin zip이 첨부되는지 확인
> # → zip 안의 META-INF/plugin.xml에 0.0.99가 박혔는지 확인
> #     unzip -p build/distributions/Markora-0.0.99.zip Markora/lib/Markora-0.0.99.jar | unzip -p - META-INF/plugin.xml | grep version
> ```
>
> 검증 후 cleanup:
>
> ```bash
> gh release delete v0.0.99 --yes
> git push --delete origin v0.0.99
> git tag -d v0.0.99
> # 그리고 main의 마지막 bump 커밋을 revert (또는 다음 실제 릴리스 때 덮어쓰기)
> git revert HEAD --no-edit && git push origin main
> ```
