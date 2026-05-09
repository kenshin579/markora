# Code Block Syntax Highlighting

**Date**: 2026-05-09
**Status**: Approved (design)

## Background / Problem

Markora의 코드 블록(```` ``` ````)은 현재 plain text로 렌더링되어 syntax highlighting이 동작하지 않는다.

원인: `frontend/src/editor/schema.ts`가 `defaultBlockSpecs.codeBlock`(=`createCodeBlockSpec()` with no options)을 그대로 사용한다. BlockNote 0.49의 `createCodeBlockSpec`은 `createHighlighter` / `supportedLanguages` / `defaultLanguage` 옵션을 받아야 내부의 `lazyShikiPlugin`(prosemirror-highlight + shiki)이 활성화되는데, 이 옵션들이 모두 비어 있어 하이라이터 플러그인이 attach 되지 않는다.

부수적으로 코드 블록 toolbar의 언어 선택 UI도 `supportedLanguages`가 비어 있어 표시되지 않으며, 코드 복사 버튼 또한 BlockNote 기본 codeBlock에는 존재하지 않는다.

## Goals

- 모든 fenced code block(```` ```lang ````)에 syntax highlighting 적용
- IDE 다크/라이트 테마와 코드 블록 컬러 즉시 동기
- 큐레이션된 23개 언어 지원, 코드 블록 toolbar에 언어 픽커 노출
- 코드 블록 호버 시 한 번에 복사 가능한 copy 버튼
- 기존 `.md` 파일에 대한 round-trip 보존(저장↔로드 시 fenced language 손실 없음)

## Non-Goals

- 라인 번호 렌더링
- shiki 전체 언어 사전(150+) 지원
- diff/git-blame 등 IDE 통합 하이라이팅
- 인라인 ` `code` ` 스타일 변경 (BlockNote 기본 inline code 마크업 유지)

## Approach

BlockNote가 이미 코어에 내장한 `lazyShikiPlugin` 경로를 그대로 살려 옵션만 채우는 최소 침습 방식. shiki는 dynamic import로 lazy-load하고, 듀얼 테마(`github-light` / `github-dark`)를 CSS 변수로 토글한다. 언어 픽커는 BlockNote가 `supportedLanguages` 기반으로 자동 렌더한다. 코드 복사 버튼은 BlockNote 외부에서 MutationObserver + portal로 오버레이한다.

대안인 "Prism.js / highlight.js 교체"는 BlockNote의 `createHighlighter` API를 우회하기 위해 커스텀 codeBlock spec을 직접 만들어야 해서 BlockNote 업그레이드 추적 부담이 크고, 대안인 "shiki 전체 번들"은 초기 로드 비용이 과다하다.

## Architecture

```
frontend/src/editor/
├── codeBlock.ts          (신규) shiki 옵션, 언어 맵, lazy createHighlighter
├── schema.ts             (수정) defaultBlockSpecs에서 codeBlock만 우리 spec으로 교체
└── Editor.tsx            (수정) editor root ref 노출 + CodeBlockCopy 마운트

frontend/src/blocks/
└── CodeBlockCopy.tsx     (신규) <pre> 호버 시 copy 버튼 (외부 DOM observer)

frontend/src/editor/__tests__/codeBlock.test.ts   (신규) 옵션/언어 맵 단위 테스트
frontend/src/markdown/__tests__/roundtrip.test.ts (확장) 다양한 언어 round-trip

frontend/src/styles.css   (수정) shiki 듀얼 테마 CSS 변수 토글 규칙
frontend/package.json     (수정) shiki 의존성 추가
```

## Components

### `frontend/src/editor/codeBlock.ts` (신규)

큐레이션된 23개 언어 맵과 BlockNote `CodeBlockOptions` 객체 export.

```ts
import type { CodeBlockOptions } from '@blocknote/core';

export const SUPPORTED_LANGUAGES = {
  text:        { name: 'Plain Text', aliases: ['plain', 'plaintext'] },
  javascript:  { name: 'JavaScript', aliases: ['js'] },
  typescript:  { name: 'TypeScript', aliases: ['ts'] },
  jsx:         { name: 'JSX',        aliases: [] },
  tsx:         { name: 'TSX',        aliases: [] },
  java:        { name: 'Java',       aliases: [] },
  kotlin:      { name: 'Kotlin',     aliases: ['kt', 'kts'] },
  python:      { name: 'Python',     aliases: ['py'] },
  go:          { name: 'Go',         aliases: ['golang'] },
  rust:        { name: 'Rust',       aliases: ['rs'] },
  c:           { name: 'C',          aliases: [] },
  cpp:         { name: 'C++',        aliases: ['c++'] },
  shellscript: { name: 'Shell',      aliases: ['sh', 'bash', 'zsh'] },
  json:        { name: 'JSON',       aliases: [] },
  yaml:        { name: 'YAML',       aliases: ['yml'] },
  html:        { name: 'HTML',       aliases: [] },
  css:         { name: 'CSS',        aliases: [] },
  scss:        { name: 'SCSS',       aliases: ['sass'] },
  sql:         { name: 'SQL',        aliases: [] },
  xml:         { name: 'XML',        aliases: [] },
  markdown:    { name: 'Markdown',   aliases: ['md'] },
  dockerfile:  { name: 'Dockerfile', aliases: ['docker'] },
  properties:  { name: 'Properties', aliases: [] },
} as const;

export const codeBlockOptions: CodeBlockOptions = {
  defaultLanguage: 'text',
  indentLineWithTab: true,
  supportedLanguages: SUPPORTED_LANGUAGES,
  createHighlighter: async () => {
    const { createHighlighter } = await import('shiki');
    return createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: Object.keys(SUPPORTED_LANGUAGES),
    });
  },
};
```

### `frontend/src/editor/schema.ts` (수정)

`defaultBlockSpecs.codeBlock`만 `createCodeBlockSpec(codeBlockOptions)`으로 교체. 기타 default spec은 그대로 유지.

```ts
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, createCodeBlockSpec } from '@blocknote/core';
import { KatexBlock } from '../blocks/KatexBlock';
import { MermaidBlock } from '../blocks/MermaidBlock';
import { KatexInline } from '../inline/KatexInline';
import { codeBlockOptions } from './codeBlock';

const { codeBlock: _ignore, ...restDefaultBlockSpecs } = defaultBlockSpecs;

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...restDefaultBlockSpecs,
    codeBlock: createCodeBlockSpec(codeBlockOptions),
    katex: KatexBlock(),
    mermaid: MermaidBlock(),
  },
  inlineContentSpecs: { ...defaultInlineContentSpecs, katexInline: KatexInline },
});
```

### `frontend/src/blocks/CodeBlockCopy.tsx` (신규)

BlockNote 외부에서 동작하는 React 컴포넌트. 책임:

- `editorRoot` ref(또는 selector)로 받은 컨테이너에서 MutationObserver attach
- `pre[data-content-type="codeBlock"]` 셀렉터로 코드 블록 DOM 등장 감지
- 마우스가 코드 블록 위에 있을 때만 우상단 absolute-positioned `Copy` 버튼 노출
- 클릭 시 `pre` 내부 텍스트 추출 → `navigator.clipboard.writeText`
- 듀얼 테마 CSS 변수(`--markora-copy-bg`, `--markora-copy-fg`)로 색 자동 전환
- 셀렉터 상수는 `CODE_BLOCK_SELECTOR = 'pre[data-content-type="codeBlock"]'`로 한 곳에 둠

`Editor.tsx`는 `<BlockNoteView>`를 감싸는 `markora-shell` div에 ref를 걸고 `<CodeBlockCopy editorRoot={shellRef}/>`를 형제로 마운트한다. 그 외 변경 없음.

## Data Flow

```
Markdown(.md)
  └─ tryParseMarkdownToBlocks()
      └─ codeBlock { language: 'kotlin', content: 'fun main() {...}' }
          └─ lazyShikiPlugin: 첫 렌더 시 createHighlighter() 호출
              └─ Promise resolve 후 토큰화 → <pre data-content-type="codeBlock"><code>
                  └─ <span class="line"><span style="--shiki-light:#xxx;--shiki-dark:#yyy">...

편집: prosemirror doc 변경 → lazyShikiPlugin이 변경된 codeBlock만 재토큰화

저장: blocksToMarkdownLossy()가 codeBlock { language } → ```language\n...\n```
      기존 customParse는 math/mermaid만 변환하고 일반 codeBlock은 그대로 통과
```

## Theme Sync

shiki 듀얼 테마 모드에서 토큰은 `style="--shiki-light:#xxx;--shiki-dark:#yyy"`로 렌더된다. CSS 변수만 토글하면 즉시 전환되므로 IDE 테마 변경 시 shiki 재초기화가 불필요하다.

`frontend/src/styles.css`:

```css
.markora-shell pre code span { color: var(--shiki-light); }
.markora-shell pre { background-color: var(--shiki-light-bg); }

[data-mantine-color-scheme="dark"] .markora-shell pre code span { color: var(--shiki-dark); }
[data-mantine-color-scheme="dark"] .markora-shell pre { background-color: var(--shiki-dark-bg); }
```

`Editor.tsx`의 테마 동기 로직(`bridge.onThemeChange`)은 변경 없음 — Mantine이 root에 `data-mantine-color-scheme`을 자동 세팅한다.

## Round-trip / 미지원 언어 처리

- SUPPORTED_LANGUAGES 키와 일치하는 언어(`kotlin`, `python` 등): 그대로 보존
- alias(`kt`, `js`, `bash`): BlockNote의 `getLanguageId(options, alias)`가 정규 id로 매핑. 직렬화 시 정규 id가 사용될 수 있으나, fenced code block의 의미는 보존됨
- 미지원 언어(`elixir` 등): `getLanguageId`가 `undefined` 반환 → schema 진입 전에 `text`로 강제하는 보호 로직을 `codeBlockOptions`에 추가. 구체적으로는 lazy createHighlighter 내에서 try/catch로 로드 실패한 언어를 캐치하고 plain text로 폴백. 사용자에게 보이는 동작은 "색 없이 정상 렌더 + 저장 시 원본 language 문자열 보존"

기존 `customParse.ts`의 `language === 'math'` / `language === 'mermaid'` 변환 로직은 변경 없음.

## Testing

### 단위 테스트 (Vitest)

`frontend/src/editor/__tests__/codeBlock.test.ts` (신규):

- SUPPORTED_LANGUAGES에 핵심 언어(javascript, typescript, kotlin, python, java, go) 포함 검증
- alias 충돌 없음 (모든 alias는 단일 언어 id로만 매핑)
- `codeBlockOptions.defaultLanguage === 'text'`
- `codeBlockOptions.indentLineWithTab === true`
- `codeBlockOptions.createHighlighter`가 호출 시 shiki를 dynamic import (shiki를 vi.mock으로 스텁)
- createHighlighter가 `themes: ['github-light', 'github-dark']`와 23개 lang을 shiki에 전달

### Round-trip 테스트 (기존 확장)

`frontend/src/markdown/__tests__/roundtrip.test.ts` 확장:

- ```` ```kotlin\nfun main() {}\n``` ```` round-trip 보존
- ```` ```kt\n...\n``` ```` (alias) → 의미 동일성 보존
- ```` ```\n...\n``` ```` (no language) → defaultLanguage 'text' 적용 후 round-trip
- math/mermaid 변환 로직이 일반 codeBlock에 영향을 주지 않음을 회귀 테스트로 보장

### 수동 검증 (`./gradlew runIde`)

- 새 .md 파일에 ```` ```javascript ```` 입력 후 코드 작성 → 토큰 컬러 확인
- 다크/라이트 IDE 테마 토글 시 코드 컬러 즉시 전환(재로드 없이)
- 슬래시 메뉴에서 Code Block 삽입 → toolbar 언어 픽커에 23개 항목 노출
- 코드 블록 호버 → copy 버튼 노출 → 클릭 시 클립보드 복사 + 상태바 "Copied" 표시
- 이미 작성된 사용자 .md 파일 열기 → 기존 코드 블록 색상 정상

## Risks / Tradeoffs

| 위험 | 완화 |
|---|---|
| shiki 첫 로드 시 lazy chunk 다운로드로 첫 코드블록 깜빡임 | Vite가 shiki를 별도 chunk로 자동 분리. JCEF는 로컬 파일 서빙(`PreviewStaticServer`)이라 네트워크 지연 없음. BlockNote의 prosemirror-highlight가 plain → 컬러 전환을 부드럽게 처리 |
| `npm run build` 산출물 크기 증가 → IDE 플러그인 zip 크기 증가 | shiki 메인 청크는 lazy chunk로 분리되어 초기 로드 미포함. 총 크기 증가는 수MB 수준이며 수용 가능 |
| 미지원 언어 로드 실패 시 콘솔 에러/렌더 깨짐 | `getLanguageId(options, lang) ?? 'text'` 사전 정규화 + lazy createHighlighter 내부 try/catch |
| copy 버튼이 BlockNote 내부 DOM 구조 변경에 취약 | `pre[data-content-type="codeBlock"]` 셀렉터를 한 상수에 두고, BlockNote 업그레이드 시 단위 테스트로 회귀 감지 |
| shiki 파일이 production에서 IDE 플러그인 sandboxed JCEF에 로드되지 않을 가능성 | `PreviewStaticServer`가 `src/main/resources/blocknote/dist/` 하위 모든 파일을 서빙하므로 Vite가 분리한 lazy chunk(.js)도 자동 노출됨. 추가 처리 불필요 |

## Migration / Compatibility

- 기존 `.md` 파일 변경 없음 — round-trip 보존
- 사용자 설정/프로젝트 설정 영향 없음
- 신규 의존성: `shiki` (npm). `gradle-node-plugin`이 자동 다운로드하므로 사용자 액션 불필요
- BlockNote 0.49 API에 의존 — major upgrade 시 `createCodeBlockSpec` / `lazyShikiPlugin` 시그니처 변경 가능성. Round-trip + 단위 테스트로 회귀 감지
