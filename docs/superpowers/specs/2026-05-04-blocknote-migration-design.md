# BlockNote 마이그레이션 설계

- **작성일**: 2026-05-04
- **대상 릴리스**: Markora v1 (BlockNote 기반)
- **상태**: 작성 완료, 사용자 리뷰 대기
- **선행 산출물**: `docs/superpowers/poc/editor-comparison/` (Vditor / Toast UI / Tiptap / BlockNote 비교 PoC)

## 배경

Markora는 JetBrains IDE용 WYSIWYG 마크다운 에디터 플러그인이다. 현재 JCEF 위에서 [Vditor 3.11.2](https://github.com/Vanessa219/vditor)를 임베드해 동작한다. PoC 비교 결과 사용자는 **Notion 스타일의 즉각적인 편집 경험**(드래그 핸들, 슬래시 메뉴, 블록 변환, `+` 버튼)을 v1의 핵심 가치로 결정했고, 이에 따라 에디터를 [BlockNote](https://www.blocknotejs.org/) 0.49.0로 교체한다.

## 목표

- 현재 Vditor 기반 에디터를 BlockNote로 원샷 교체한다.
- BlockNote가 기본 제공하지 않는 **KaTeX 수식**(블록 + 인라인)과 **Mermaid 다이어그램**을 커스텀 블록으로 추가한다.
- 마크다운 라운드트립을 best-effort로 보장한다(표준 블록은 무손실, KaTeX/Mermaid는 fenced 코드블록으로 보존).
- Kotlin 측 인프라(파일 I/O, 이미지 업로드, 정적 서버, 테마)는 재사용한다.

## 비목표 (v1 범위 외)

- README 기존 feature 중 다음은 v1에서 제거한다.
  - Dual Mode (WYSIWYG/Source 토글) — BlockNote 기본 UX 사용
  - Slash Commands 13종 고정 목록 — BlockNote 기본 슬래시 메뉴 + KaTeX/Mermaid 항목만 추가
  - `:emoji:` shortcode
  - Code 라인 번호
  - 커스텀 슬래시 메뉴 한글 별칭
- HTML/PDF Export — `ExportController`는 코드만 유지하고 호출 제거
- 외부 변경 충돌 다이얼로그 — focus 시 자동 reload 정책만 유지(dirty 아닐 때)

## 결정 요약

| 결정 항목 | 선택 | 근거 |
|---|---|---|
| 1차 동기 | Notion 스타일 UX | 사용자 명시 우선순위 |
| 마크다운 호환성 | best-effort (옵션 2) | KaTeX/Mermaid 보존하면서 외부 호환성도 합리적으로 유지 |
| v1 기능 범위 | BlockNote 기본 + KaTeX(블록+인라인) + Mermaid | 기존 feature는 무시 가능 |
| 빌드 파이프라인 | Vite 서브프로젝트 + gradle-node-plugin | 표준 React 생태계, CI 친화 |
| 마이그레이션 전략 | 원샷 교체, 단일 PR | 호환성 헷지 불필요 (마켓플레이스 미배포 상태) |
| 에러 처리 | 경고 박스 + source 보존 + Edit/Convert 액션 | 타이핑 중 일시적 invalid 상태 친화적 |

---

## 1. 전체 아키텍처

```
[ JetBrains IDE ]
        │
[ MarkdownFileEditor (Kotlin) ]            JCEF 패널 호스트
        │                                  Kotlin ↔ JS 메시지 브릿지
[ MarkdownHtmlPanel (Kotlin) ]             JCEF 브라우저 인스턴스
        │                                  blocknote/dist/index.html 로드
[ PreviewStaticServer (Kotlin, 기존) ]     /resources/blocknote/dist/* 서빙
        │                                  /api/* (file/upload/local-image)
[ src/main/resources/blocknote/dist/ ]     Vite 빌드 산출물
   - index.html, assets/index-*.js, assets/index-*.css
   - assets/mermaid-*.js (lazy chunk), assets/katex-*.js (lazy chunk)

[ frontend/ ]                              Vite 서브프로젝트 (소스만)
   - package.json, vite.config.ts, tsconfig.json, index.html
   - src/main.tsx                          React 부트스트랩
   - src/editor/Editor.tsx                 useCreateBlockNote + BlockNoteView
   - src/editor/schema.ts                  defaultBlockSpecs + KaTeX + Mermaid
   - src/blocks/KatexBlock.tsx             블록 수식 (커스텀 블록)
   - src/blocks/MermaidBlock.tsx           Mermaid 다이어그램
   - src/inline/KatexInline.tsx            인라인 수식 (커스텀 inline content)
   - src/markdown/customParse.ts           ```math/```mermaid 변환 훅
   - src/bridge/markora.ts                 Kotlin API 래퍼 (load/save/upload/theme)
```

### 핵심 변경

- **신규**: `frontend/` 디렉토리, `gradle-node-plugin` 적용, `src/main/resources/blocknote/dist/`(빌드 시 생성, gitignore)
- **삭제**: `src/main/resources/vditor/dist/`, `src/main/resources/template/editor.html`
- **Kotlin 측 조정만**: `MarkdownHtmlPanel`이 새 진입점 로드, `PreviewStaticServer` 라우팅 베이스 교체. 컨트롤러 5종은 그대로 유지.

---

## 2. 컴포넌트 책임

| 모듈 | 역할 | 주요 의존성 |
|---|---|---|
| `main.tsx` | React 부트스트랩, `window.markora` 브릿지 초기화, `<Editor>` 마운트 | React 18, MantineProvider |
| `editor/Editor.tsx` | `useCreateBlockNote()` + `<BlockNoteView>`, onChange 디바운스 저장, 외부 변경 reload | @blocknote/react, @blocknote/mantine |
| `editor/schema.ts` | 기본 스펙 + KaTeX + Mermaid 합친 커스텀 schema | @blocknote/core |
| `blocks/KatexBlock.tsx` | 커스텀 블록 정의 + 편집 UI + 마크다운 직렬화 훅 | katex |
| `blocks/MermaidBlock.tsx` | 동일 패턴 + 테마 동기화 | mermaid |
| `inline/KatexInline.tsx` | 인라인 수식 (createReactInlineContentSpec) | katex |
| `markdown/customParse.ts` | preSerialize / postParse — 표준 코드블록 ↔ 커스텀 블록 변환 | — |
| `bridge/markora.ts` | Kotlin API 호출 래퍼 + dev 모드 mock | fetch |

---

## 3. 데이터 흐름

### 파일 열기

1. JCEF가 `index.html` 로드
2. `main.tsx` → `bridge.loadFile()` → `GET /api/file/read?path=<filePath>`
3. 받은 markdown → `editor.tryParseMarkdownToBlocks()`
4. `customParse.postParse(blocks)`로 ```math/```mermaid 코드블록을 커스텀 블록으로 치환
5. paragraph inline content를 walk하면서 `$...$` 패턴을 인라인 KaTeX 노드로 분리
6. `useCreateBlockNote({ initialContent: blocks })` → 첫 렌더

### 편집 → 저장 (1초 디바운스)

1. BlockNote `onChange` → `editor.document` 추출
2. `customParse.preSerialize(blocks)` — KaTeX/Mermaid 블록을 ```math/```mermaid 코드블록으로 역치환
3. 인라인 KaTeX 노드를 `$source$` 텍스트로 직렬화
4. `editor.blocksToMarkdownLossy(blocks)` → markdown 문자열
5. 1초 debounce 후 `bridge.saveFile(markdown)` → `POST /api/file/save`
6. 상태바: "Saving..." → "Saved" → 2초 후 "Ready"

### 외부 변경 감지 (focus 이벤트)

```
focus → GET /api/file/read
content == lastKnownContent ? 무시
isDirty == false ? editor.replaceBlocks(parse(content)); lastKnownContent 갱신
isDirty == true ? 무시 (v1 한계: 명시적 충돌 다이얼로그 없음)
```

### 이미지 업로드

1. BlockNote `uploadFile` 콜백 (drag/drop, paste, 메뉴)
2. `bridge.uploadImage(File)` → `POST /api/upload` (multipart)
3. 응답 상대 경로 → `/api/local-image?path=<abs>` URL로 변환해 반환
4. BlockNote 이미지 블록의 `src`로 사용

### 테마 동기화

- 초기: `bridge.getTheme()` → React 초기 상태
- 변경: Kotlin 측이 `cefBrowser.executeJavaScript("window.markora.applyTheme('dark')")` 호출
- 반영: `<BlockNoteView theme>`, MantineProvider colorScheme, `mermaid.initialize({ theme })` + 모든 Mermaid 블록 강제 리렌더
- `prefers-color-scheme` 미디어 쿼리는 사용하지 않음 (IDE 테마가 진리값)

---

## 4. 커스텀 블록

### 공통 패턴

```
PropSchema  : { source: { default: "" } }
Content     : "none" (자체 source prop이 진리)
Render      : 편집 중 → <textarea>로 source 직접 편집
              비편집 → KaTeX/Mermaid 렌더 결과
ToolbarSlot : ✏️ Edit, ↓ Convert (강등) 액션
디바운스    : onChange 후 300ms 동안 추가 입력 없을 때만 렌더 시도
```

### KaTeX 블록 (`blocks/KatexBlock.tsx`)

- 라이브러리: `katex`
- 렌더: `katex.renderToString(source, { throwOnError: false, displayMode: true })`
- 슬래시 메뉴 항목: `/math` (블록), aliases: `["math","latex","equation","수식"]`

### KaTeX 인라인 (`inline/KatexInline.tsx`)

- `createReactInlineContentSpec`로 정의
- 클릭 시 popover에 source 입력 → Enter/blur로 렌더 복귀
- 마크다운 변환: paragraph inline content 배열을 walk, `$...$` 패턴을 인라인 노드로 split. 직렬화 시 역으로 `$source$` 복원
- 슬래시 메뉴 항목: `/equation` (인라인 — 현재 커서 위치에 삽입)

### Mermaid 블록 (`blocks/MermaidBlock.tsx`)

- 라이브러리: `mermaid` (lazy chunk)
- 렌더: `mermaid.render(id, source)` → SVG
- 첫 렌더: `mermaid.initialize({ startOnLoad: false, theme })`
- 다크 전환 시: reinitialize + 모든 Mermaid 블록 강제 리렌더 (짧은 깜빡임 허용)
- 슬래시 메뉴 항목: `/mermaid`

### 마크다운 라운드트립 변환 훅

**저장 시 (BlockNote → markdown)**
```ts
function preSerialize(blocks: Block[]): Block[] {
  return blocks.map(b => {
    if (b.type === "katex")   return codeBlock("math",    b.props.source);
    if (b.type === "mermaid") return codeBlock("mermaid", b.props.source);
    if (b.children?.length)   return { ...b, children: preSerialize(b.children) };
    return b;
  });
}
```

**로드 시 (markdown → BlockNote)**
```ts
function postParse(bs: Block[]): Block[] {
  return bs.map(b => {
    if (b.type === "codeBlock" && b.props.language === "math")
      return { type: "katex",   props: { source: codeContent(b) } };
    if (b.type === "codeBlock" && b.props.language === "mermaid")
      return { type: "mermaid", props: { source: codeContent(b) } };
    if (b.children?.length) return { ...b, children: postParse(b.children) };
    return b;
  });
}
```

---

## 5. 에러 처리

### 정책

| 상황 | 동작 |
|---|---|
| KaTeX/Mermaid 파싱 에러 | 노란 경고 박스로 에러 메시지 표시, source는 props에 보존, 액션 버튼 2개 노출 |
| 마크다운 → 블록 변환 실패 | console.error + 상태바 "Load failed", `editor.replaceBlocks([emptyParagraph])` |
| 블록 → 마크다운 변환 실패 | 직전 성공 저장본 유지, 상태바 "Save failed (kept previous)" |
| 이미지 업로드 실패 | toast 메시지, 이미지 블록은 placeholder 유지 |
| 정적 서버 다운 등 첫 로드 실패 | React ErrorBoundary가 "Reload" 버튼 풀백 UI 노출 |

### 경고 박스 UX

```
┌─────────────────────────────────────────┐
│ ⚠ LaTeX 파싱 에러                       │
│ Undefined control sequence: \alfa       │
│ 코드를 수정하거나 일반 코드블록으로 변환 │
│                  [Edit] [↓ Plain]        │
└─────────────────────────────────────────┘
```

- `[Edit]` — textarea로 source 즉시 편집 모드 진입
- `[↓ Plain]` — 사용자가 명시적으로 `codeBlock` 타입(language=math/mermaid)으로 강등
- 색상은 빨강 대신 노란/주황 톤 (덜 위협적)
- onChange 후 300ms 동안 입력 없을 때만 렌더 시도 → 타이핑 중 깜빡임 방지

### 원칙

에러로 사용자 입력이 손실되지 않는다. 마지막 성공 저장본을 메모리에 항상 보유하고, 변환 실패는 알리되 에디터 상태는 유지한다.

---

## 6. 빌드 파이프라인

### 디렉토리 레이아웃

```
intellij-plugin-markdown-editor/
├── frontend/                          ← 신규 Vite 서브프로젝트
│   ├── package.json
│   ├── package-lock.json              ← 커밋 (재현 빌드)
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html                     ← Vite 진입점
│   ├── src/                           ← TypeScript/React 소스
│   └── .gitignore                     ← node_modules/, dist/
├── src/main/resources/blocknote/dist/ ← Vite 산출물 (gitignore!)
├── build.gradle.kts                   ← gradle-node-plugin 적용
└── .gitignore                         ← 추가 항목
```

### Gradle 통합 (`build.gradle.kts`)

```kotlin
plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.25"
    id("org.jetbrains.intellij.platform")
    id("com.github.node-gradle.node") version "7.0.2"
}

node {
    version.set("20.18.0")
    npmVersion.set("10.8.2")
    download.set(true)
    workDir.set(file("${project.projectDir}/.gradle/nodejs"))
    nodeProjectDir.set(file("${project.projectDir}/frontend"))
}

tasks.register<com.github.gradle.node.npm.task.NpmTask>("buildFrontend") {
    description = "Bundle BlockNote editor with Vite"
    dependsOn("npmInstall")
    args.set(listOf("run", "build"))
    inputs.dir("frontend/src")
    inputs.file("frontend/package.json")
    inputs.file("frontend/package-lock.json")
    inputs.file("frontend/vite.config.ts")
    outputs.dir("src/main/resources/blocknote/dist")
}

tasks.named("processResources") { dependsOn("buildFrontend") }
tasks.named("clean") {
    doLast { delete("src/main/resources/blocknote/dist") }
}
```

### `frontend/package.json` 핵심 의존성

```
@blocknote/core         ^0.49.0
@blocknote/react        ^0.49.0
@blocknote/mantine      ^0.49.0
@mantine/core           ^8.3.11
@mantine/hooks          ^8.3.11
react                   ^18.3.1
react-dom               ^18.3.1
katex                   ^0.16.11
mermaid                 ^11.4.0

devDeps:
@vitejs/plugin-react    ^4.3.4
typescript              ^5.7.2
vite                    ^5.4.11
vitest                  ^2.1.8
@testing-library/react  ^16.1.0
@types/react            ^18.3.12
@types/react-dom        ^18.3.1
```

### `frontend/vite.config.ts` 핵심

```ts
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '../src/main/resources/blocknote/dist'),
    emptyOutDir: true,
    rollupOptions: {
      output: { manualChunks: { mermaid: ['mermaid'], katex: ['katex'] } }
    }
  },
  base: './',  // 정적 서버 친화 (상대 경로)
});
```

### 개발 워크플로

| 시나리오 | 명령 | 비고 |
|---|---|---|
| 일반 빌드 | `./gradlew build` | Gradle이 buildFrontend 자동 실행 |
| IDE 샌드박스 실행 | `./gradlew runIde` | 처음만 npm install (~30~90초) |
| Frontend HMR 단독 | `cd frontend && npm run dev` | http://localhost:5173, bridge mock 사용 |
| 클린 빌드 | `./gradlew clean build` | dist 폴더 삭제 후 재빌드 |

### `.gitignore` 추가 항목

```
src/main/resources/blocknote/dist/
frontend/node_modules/
frontend/.vite/
frontend/dist/
.gradle/nodejs/
```

### 산출물 검증

```
src/main/resources/blocknote/dist/
├── index.html
├── assets/index-*.js
├── assets/index-*.css
├── assets/mermaid-*.js   (lazy 청크)
└── assets/katex-*.js     (lazy 청크)
```

---

## 7. 테스트 전략

### Frontend (Vitest + Testing Library)

| 영역 | 위치 | 핵심 케이스 |
|---|---|---|
| 마크다운 라운드트립 | `frontend/src/markdown/__tests__/roundtrip.test.ts` | 표준 블록만 / KaTeX만 / Mermaid만 / 혼합 / 인라인 수식 / 빈 문서 / 깊은 중첩 |
| KaTeX 블록 직렬화 | `frontend/src/blocks/__tests__/katex.test.ts` | KaTeX 블록 ↔ ```math 코드블록 |
| Mermaid 직렬화 | `frontend/src/blocks/__tests__/mermaid.test.ts` | Mermaid 블록 ↔ ```mermaid 코드블록 |
| 인라인 수식 | `frontend/src/inline/__tests__/katex-inline.test.ts` | "x = $a^2$ y" → 분리/병합 |
| 에러 박스 | `frontend/src/blocks/__tests__/error-state.test.tsx` | 잘못된 LaTeX 시 박스 + Edit/Convert 버튼 |
| Bridge | `frontend/src/bridge/__tests__/markora.test.ts` | mock 구현 검증 |

실행: `cd frontend && npm test`. Gradle `check` 태스크에 frontend 테스트 자동 실행을 연결한다.

```kotlin
tasks.register<com.github.gradle.node.npm.task.NpmTask>("frontendTest") {
    dependsOn("npmInstall")
    args.set(listOf("run", "test", "--", "--run"))
    inputs.dir("frontend/src")
    inputs.file("frontend/package.json")
    inputs.file("frontend/package-lock.json")
}
tasks.named("check") { dependsOn("frontendTest") }
```

### Kotlin (기존 JUnit + IntelliJ Test Framework)

| 영역 | 변경 |
|---|---|
| `PreviewStaticServer` 라우팅 | `/resources/blocknote/dist/index.html` 200 검증 |
| `MarkdownFileController` | 변경 없음 |
| `ImageUploadController` | 변경 없음 |
| `MarkdownHtmlPanel` | 신규 진입점 URL 로드 |
| `EditorSettingsService` | 필드 제거 후 직렬화 호환성 |

### 통합 검증 체크리스트 (수동, runIde)

- [ ] .md 파일 열면 BlockNote 에디터 진입
- [ ] 표준 블록(헤딩/리스트/표/코드/이미지/링크) 동작
- [ ] 슬래시 메뉴에서 `/math`, `/mermaid`, `/equation` 노출
- [ ] KaTeX 블록 정상 렌더, invalid 입력 시 경고 박스 + 버튼
- [ ] Mermaid 블록 렌더, 다크/라이트 전환 시 색 동기화
- [ ] 이미지 drag/drop → 파일 옆 `images/`에 저장
- [ ] 1초 디바운스 후 .md 파일 반영, 재로드 시 라운드트립
- [ ] 외부 .md 변경 후 IDE focus 시 reload (dirty 아닐 때)
- [ ] IDE 다크 ↔ 라이트 전환 시 에디터 즉시 반응

---

## 8. 마이그레이션 (단일 PR)

### 커밋 순서

```
PR: feature/blocknote-migration

 1. chore: gradle-node-plugin 추가
 2. feat(frontend): Vite 스캐폴딩 + 빈 React 앱
 3. feat(frontend): bridge/markora.ts (Kotlin API 래퍼 + dev mock)
 4. feat(frontend): BlockNote 기본 에디터 + Editor.tsx 라이프사이클
 5. feat(frontend): 마크다운 라운드트립 (preSerialize/postParse)
 6. feat(frontend): KaTeX 블록 + 인라인 수식
 7. feat(frontend): Mermaid 블록
 8. feat(frontend): 에러 박스 + Edit/Convert 액션
 9. feat(frontend): 테마 동기화
10. test(frontend): 라운드트립/블록/에러/브릿지 단위 테스트
11. feat(kotlin): MarkdownHtmlPanel 진입점 변경
12. feat(kotlin): EditorSettingsService 필드 정리
13. chore: Vditor 잔재 삭제 (vditor/dist, editor.html, 슬래시 로직)
14. chore: ExportController 비활성화 (코드 유지, 호출 제거)
15. docs: README 업데이트 (BlockNote, KaTeX/Mermaid만 언급)
16. docs: poc/editor-comparison/을 docs/superpowers/poc/editor-comparison/으로 이동 (결정 근거 보존)
```

각 커밋이 빌드 가능 상태일 필요는 없으나(마지막 커밋에서 통합 빌드 통과), frontend → Kotlin 순서로 작업해 frontend 단독 검증 단계를 거친다.

### 삭제 대상

- `src/main/resources/vditor/dist/` 전체 (~8MB)
- `src/main/resources/template/editor.html`
- `EditorSettingsService.kt`의 `defaultMode`, `showLineNumbers` 필드 + 관련 UI
- README의 Slash Commands 13종 표, Source 모드 안내, "Code Blocks 라인번호" 항목
- `MarkdownEditorConfigurable.kt`의 무의미해진 항목

`ExportController.kt`는 삭제하지 않고 비활성화만(호출 제거). v1 이후 BlockNote의 HTML export 도입 시 재활용.

---

## 9. v1.1+ 백로그

설계 범위 외이지만 향후 후보:

- HTML/PDF Export (`blocksToHTMLLossy` 활용)
- 외부 변경 충돌 다이얼로그 ("Reload from disk" / "Keep my changes")
- emoji shortcode (`:smile:` 인라인 변환)
- 슬래시 메뉴 한국어 검색어 가중치
- BlockNote AI 확장 검토

---

## 10. 위험 & 완화

| 위험 | 완화 |
|---|---|
| Vite 산출물 크기(~700KB+)로 JCEF 첫 로드 지연 | manualChunks로 mermaid/katex lazy 청크화 |
| BlockNote 마크다운 변환의 GFM 일부 손실 | 라운드트립 테스트로 회귀 캐치, 알려진 한계는 README 명시 |
| node 다운로드 실패 (오프라인) | 첫 빌드만 온라인 필요, 이후 캐시. `frontend/.npmrc`로 사내 미러 설정 가능 |
| BlockNote v0.x → v1.x 호환성 변동 | `^0.49.0` 캐럿 핀 + package-lock.json 커밋. 메이저 업데이트는 별도 PR |

---

## 부록: PoC 결정 근거

`docs/superpowers/poc/editor-comparison/` 폴더에 Vditor / Toast UI / Tiptap / BlockNote 비교 PoC가 있다. 사용자는 `04-blocknote.html`(공식 데모 iframe)을 통해 BlockNote의 실제 UX를 확인했고, Notion 스타일 UX(드래그 핸들, `+` 버튼, 슬래시 메뉴, 블록 변환)가 핵심 가치라고 결정했다. README의 기존 feature 약속은 v1에서는 BlockNote 기본 동작으로 대체하기로 합의했다.
