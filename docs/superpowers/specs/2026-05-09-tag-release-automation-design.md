# Tag-Triggered Release Automation — Design

- **Date**: 2026-05-09
- **Status**: Approved (pending implementation)
- **Owner**: kenshin579

## 1. Background

Today the Markora plugin uses two GitHub Actions workflows:

- `.github/workflows/build.yml` — runs on every push/PR to `main` and uploads a build artifact
- `.github/workflows/release.yml` — runs on `push: tags: v*`, executes `./gradlew buildPlugin`, and creates a GitHub Release with the built `.zip` attached

The version is hard-coded in two places:

- `build.gradle.kts:9` — `version = "0.1.0"` (the value actually used)
- `gradle.properties:4` — `pluginVersion = 0.1.0` (currently unused by the build)

The build artifact is already attached to releases automatically. The remaining gap is **version management**: bumping the version is fully manual, the two version locations can drift, and there is no convention for who/when triggers a release.

## 2. Goals

1. A single command (`make release VERSION=x.y.z`) that bumps the version, commits, tags, pushes, and creates a GitHub Release with the built plugin attached.
2. Compatibility with the GitHub Release UI as an alternative trigger path.
3. A single source of truth (SoT) for the plugin version.
4. The git tag points exactly to the commit whose source code matches the released version.

## 3. Non-Goals

- Automatic CHANGELOG generation. `CHANGELOG.md` remains manually maintained; GitHub Release notes are auto-generated from PRs/commits via `generate_release_notes`.
- Pre-release / SNAPSHOT version conventions. Only stable `vMAJOR.MINOR.PATCH` tags are supported in this iteration.
- Automatic publishing to the JetBrains Marketplace. Out of scope.

## 4. Design

### 4.1 Version Single Source of Truth

Adopt the JetBrains plugin template convention: **`gradle.properties` is the SoT.**

`gradle.properties` (no schema change, value identical):

```properties
pluginVersion = 0.1.0
```

`build.gradle.kts` reads it via the Gradle providers API, replacing the hard-coded literal at line 9:

```kotlin
version = providers.gradleProperty("pluginVersion").get()
```

The bump tooling now only has to edit one file with one well-defined regex target.

### 4.2 End-to-End Release Flow

```
[local]                                          [GitHub]
$ make release VERSION=0.2.0
   1. preflight: VERSION format, on main, clean tree
   2. git pull --ff-only origin main
   3. sed-edit gradle.properties → pluginVersion = 0.2.0
   4. git commit -m "chore: bump version to 0.2.0"
   5. git push origin main
   6. git tag v0.2.0 && git push origin v0.2.0  ─▶ release.yml triggered
   7. gh release create v0.2.0                       ├─ checkout v0.2.0
       --generate-notes                              ├─ ./gradlew buildPlugin
                                                     └─ softprops/action-gh-release@v2
                                                        attaches zip to existing release
```

Step 7 creates the release page with auto-generated notes immediately, while the workflow takes a few minutes to build. The workflow's `softprops/action-gh-release@v2` is idempotent: if a release already exists for the tag, it attaches assets to that release rather than creating a new one. So the local `gh release create` and the workflow do not collide.

GitHub Release UI alternative path:

```
$ make bump-version VERSION=0.2.0   # steps 1–5 above only
(then on GitHub web UI)
  Releases → Draft a new release → tag v0.2.0 → Publish
   ├─ GitHub creates the v0.2.0 tag pointing at HEAD of main
   └─ push:tags fires release.yml ─▶ workflow builds + attaches zip
```

Both paths leave the repository in the same final state: the v0.2.0 tag points to the bump commit on main, and the release page contains the matching plugin zip.

### 4.3 Makefile Targets

Three targets, each a strict superset of the previous:

| Target | Side effects |
|---|---|
| `make bump-version VERSION=x.y.z` | preflight + edit `gradle.properties` + commit + push to `main` |
| `make tag VERSION=x.y.z` | `bump-version` + `git tag v$(VERSION)` + `git push origin v$(VERSION)` |
| `make release VERSION=x.y.z` | `tag` + `gh release create v$(VERSION) --generate-notes` |

**Preflight checks** (run before any side effect):

1. `VERSION` is set and matches `^[0-9]+\.[0-9]+\.[0-9]+$`
2. Current branch is `main` (`git rev-parse --abbrev-ref HEAD` == `main`)
3. Working tree is clean (`git diff --quiet && git diff --cached --quiet`)
4. Local `main` is up-to-date with `origin/main` after `git fetch`
5. Tag `v$(VERSION)` does not already exist locally or on origin
6. (For `release` only) `gh` CLI is installed and authenticated

Any failed check exits with a non-zero status and a clear error message before mutating state.

### 4.4 Workflow Changes

`.github/workflows/release.yml` stays minimal and **does not perform any bumping**. The trigger remains as it is today:

```yaml
on:
  push:
    tags: ['v*']
```

This single trigger covers both paths:

- `make release` / `make tag` — pushes the v-prefixed tag, which fires `push: tags`.
- GitHub Release UI — when the user "Publish"es a new release with a new tag, GitHub creates and pushes the tag, which also fires `push: tags`.

A concurrency group is added to serialize runs for the same tag (defensive — current paths produce only one run per tag, but this protects against accidental re-pushes of the same tag during development):

```yaml
concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false
```

`softprops/action-gh-release@v2` continues to attach the built zip; its existing `generate_release_notes: true` flag is kept so that the GitHub UI path also gets auto notes. In the `make release` path the release page already exists with notes from `gh release create`, and the action just appends the zip asset.

`build.yml` is unchanged.

### 4.5 Files Touched

| Path | Change |
|---|---|
| `gradle.properties` | (no value change; becomes SoT) |
| `build.gradle.kts` | `version = "0.1.0"` → `version = providers.gradleProperty("pluginVersion").get()` |
| `Makefile` | New file with `bump-version`, `tag`, `release` targets and shared preflight |
| `.github/workflows/release.yml` | Add `concurrency` group; trigger unchanged |
| `CHANGELOG.md` | Convention only (no tooling change): manually move items from `[Unreleased]` to a new `[x.y.z] - YYYY-MM-DD` section before running `make release` |

## 5. Verification Plan

End-to-end smoke test, performed once on a throwaway version:

1. `make bump-version VERSION=0.0.99` — assert: `gradle.properties` has `pluginVersion = 0.0.99`, a single bump commit on `main`, pushed to origin
2. `make tag VERSION=0.0.99` from a clean state (no double-bump) — assert: tag `v0.0.99` exists on origin, points at the bump commit, `release.yml` run starts on GitHub
3. After workflow finishes — assert: GitHub Release `v0.0.99` exists with one `.zip` asset, and the version inside `META-INF/plugin.xml` of the zip matches `0.0.99`
4. Cleanup: delete the `v0.0.99` tag/release, revert the bump commit

Negative checks (each must fail with a clear error before any state change):

- `make release` (no `VERSION`)
- `make release VERSION=0.2` (malformed)
- `make release VERSION=0.2.0` from a non-main branch
- `make release VERSION=0.2.0` with uncommitted changes
- `make release VERSION=0.1.0` (tag already exists)

## 6. Risks and Mitigations

- **Tag/main divergence in the GitHub UI path** — if a user creates a release in the UI without first running `make bump-version`, the released zip will carry the previous version. Mitigation: document the UI path as "run `make bump-version` first, then publish in UI." A future improvement could add a workflow guard that fails the build when the tag name does not match `pluginVersion` in the checked-out tree.
- **`gh` CLI unavailable** — `make release` fails fast in preflight; users can fall back to `make tag` plus the GitHub UI.
- **Force-push protection on `main`** — branch protection rules may block direct pushes from the developer's account. Mitigation: document the requirement that the user can push to `main` directly (or relax the bump-version flow to PR-based in a future iteration).

## 7. Open Questions

None at design time. Implementation may surface details (e.g., exact `sed` invocation portability between GNU and BSD), to be resolved in the implementation plan.
