# 테이블 셀 이미지 렌더링 설계

- 날짜: 2026-07-12
- 상태: 설계 승인 대기
- 대상 저장소: `markora/` (frontend)

## 배경 / 문제

markora 에디터에서 마크다운 테이블 셀 안의 이미지(`| ![alt](img.png) |`)가 렌더링되지 않고 셀이 비어 보인다. 다른 마크다운 에디터(예: JetBrains 기본 Markdown Split Editor)는 마크다운을 그대로 HTML로 렌더링하므로 `<td><img></td>`가 정상 표시되지만, markora는 그렇지 않다.

### 근본 원인 (코드로 확인)

markora 에디터는 BlockNote(0.49) 기반이며, 마크다운 파싱은 `markdown → HTML → ProseMirror 블록` 파이프라인을 거친다 (`@blocknote/core` 내부 `pn(e,t) = U(W(e), t)`).

- 테이블 셀 내부 노드 `tableParagraph`의 스키마는 `content: "inline*"` — **인라인 콘텐츠만** 허용한다 (`blocks-CSfJen16.js`).
- 반면 이미지 노드는 `group: "blockContent"` — **블록 레벨** 노드다 (`blocks-CSfJen16.js`).

따라서 remark가 셀 안 이미지를 `<td><img>`로 변환해도, HTML→ProseMirror 파싱 단계에서 셀(`inline*`)이 블록 이미지를 자식으로 받을 수 없어 **이미지가 조용히 버려진다(drop)**. 이는 markora 로직의 버그가 아니라 BlockNote 데이터 모델의 구조적 제약이다.

부작용: markora는 자동 저장 에디터이므로, 셀 이미지가 있는 파일을 열면 이미지가 사라진 블록트리가 되고, 그대로 직렬화·저장되면 **원문의 셀 이미지가 영구 손실**될 위험이 있다.

## 목표 / 스코프

- **표시 전용(display-only)**: 파일에 이미 존재하는 테이블 셀 이미지를 markora에서 렌더링한다.
- **무손실 라운드트립**: 로드 → (편집) → 저장 과정에서 셀 이미지가 유실되지 않는다.
- 셀 안에서 이미지를 새로 추가/교체/삭제하는 WYSIWYG 인라인 편집은 **범위 밖**이다(그런 편집은 Split Editor의 raw 마크다운으로 수행). 필요 시 후속 작업으로 확장 가능.

## 접근법

### 선택: 마크다운 문자열 마스킹 + 블록트리 복원

기존 코드베이스의 두 계층 패턴을 그대로 답습한다:
- 문자열 계층: `imageMap.ts`가 이미 로드 시 이미지 src를 재작성하고 저장 시 복원한다.
- 블록트리 계층: `customParse.ts`가 `preSerialize`/`postParse`로 블록트리를 pre/post 변환한다(예: `katex`↔codeBlock, 인라인 수식 split/join).

셀 이미지도 동일하게 문자열 마스킹(mask/unmask) + 블록트리 split/join으로 처리한다.

### 기각: BlockNote remark/rehype 핸들러 오버라이드

파싱 파이프라인 내부(`W` 함수의 mdast→hast 핸들러)를 후킹해 셀 이미지를 인라인으로 유지하는 방법. BlockNote가 이 파이프라인을 공개 API로 노출하지 않아 몽키패치/포크가 필요하고, 버전 업그레이드에 취약하다.

## 데이터 흐름

### 로드 (파일 → 화면)

1. `bridge.loadFile()` — `markora.ts`가 이미 수행: HTML `<img>` → `![alt](url)` 변환, 상대경로 src → `api/local-image` 절대 URL 재작성, (url→원본) 매핑을 `imageMap`/`htmlImageMap`에 등록. 반환 `body`는 셀 이미지도 `![alt](apiurl)` 형태다.
2. **(신규)** `maskTableImages(body)` — GFM 테이블 블록 내부의 `![alt](url)`만 마크다운 무해 토큰 텍스트로 치환.
3. `parseMarkdownWithBlockquotes(editor, masked)` — BlockNote가 토큰을 셀 안 **텍스트**로 보존.
4. `postParse(blocks)` — **(신규)** `tableContent` 분기에서 각 셀 인라인 배열의 토큰 텍스트를 `inlineImage` 인라인 콘텐츠로 복원(split).
5. `editor.replaceBlocks(...)`.

### 저장 (화면 → 파일)

1. `preSerialize(editor.document)` — **(신규)** `tableContent` 분기에서 각 셀의 `inlineImage`를 토큰 텍스트로 되돌림(join).
2. `serializeBlocksWithBlockquotes(editor, ...)` — 토큰이 셀 안 **텍스트**로 직렬화됨.
3. **(신규)** `unmaskTableImages(md)` — 토큰 → `![alt](url)`(title 보존).
4. `bridge.saveFile(body)` — `restoreImagePaths`가 `![alt](apiurl)`의 URL을 원본 상대경로/원본 `<img>` 태그로 복원.

> 순서 불변식: `unmaskTableImages`는 반드시 `restoreImagePaths`(= `bridge.saveFile` 내부)보다 **먼저** 실행되어야 한다. 그래야 `restoreImagePaths`가 정상 마크다운 이미지 문법을 보고 URL을 복원할 수 있다.

## 컴포넌트

### 신규: `src/inline/InlineImage.tsx`

`createReactInlineContentSpec`로 `inlineImage` 인라인 콘텐츠 정의(`KatexInline.tsx` 패턴 참고).

- `type: 'inlineImage'`
- `propSchema: { url: { default: '' }, alt: { default: '' }, title: { default: '' } }`
- `content: 'none'`
- `render`: `<img src={url} alt={alt} title={title} style={{ maxWidth: '100%', verticalAlign: 'middle' }} />`. 표시 전용 — 클릭 편집 UI 없음.

### 신규: `src/markdown/tableImage.ts`

토큰 코덱과 문자열/트리 변환 함수.

- 토큰 형식: `.MKRAIMG.<payload>.`
  - `payload = base64url(JSON.stringify({ url, alt, title }))`, padding(`=`) 제거.
  - base64url 알파벳(`A-Za-z0-9-_`)은 마크다운 특수문자·`|`(셀 구분자)·emphasis(`_`는 intraword라 무해)를 포함하지 않는다. 구분자 `.`은 base64url에 등장하지 않아 정규식 경계가 모호하지 않다.
  - 토큰 정규식: `/\.MKRAIMG\.([A-Za-z0-9_-]+)\./g`.
- `encodeToken({url, alt, title}): string`, `decodeToken(payload): {url, alt, title}`.
- `maskTableImages(md: string): string`
  - 라인 스캔으로 GFM 테이블 블록을 식별: (헤더행) + (구분행 `| --- | :--: |` 등, `-` 포함) + 이후 연속된 파이프 포함 본문행, 빈 줄에서 종료.
  - 코드펜스(```` ``` ````/`~~~`) 내부 라인은 테이블로 오인하지 않는다(`blockquote.ts`의 `splitRuns` fence 처리 방식 참고).
  - 식별된 테이블 라인 안에서만 마크다운 이미지 `![alt](url "title"?)`를 토큰으로 치환.
- `unmaskTableImages(md: string): string`
  - 토큰 정규식으로 매칭 → `decodeToken` → `![alt](url)` 또는 title 있으면 `![alt](url "title")`.
- `tokenTextToInline(nodes: InlineNode[]): InlineNode[]`
  - 셀 인라인 배열에서 텍스트 노드의 토큰을 찾아 `text | inlineImage | text`로 분리(splitInlineMath 대칭).
- `inlineToTokenText(nodes: InlineNode[]): InlineNode[]`
  - `inlineImage` 노드를 토큰 텍스트로 직렬화하고 인접 텍스트와 병합(joinInlineMath 대칭).

### 수정: `src/editor/schema.ts`

`inlineContentSpecs`에 `inlineImage: InlineImage` 추가.

### 수정: `src/markdown/customParse.ts`

`postParse`/`preSerialize`에 테이블 분기 추가. 테이블 블록은 `content`가 배열이 아니라 `{ type: 'tableContent', rows: [{ cells: [{ type: 'tableCell', content: InlineNode[], props }] }] }` 객체이므로 기존 재귀가 도달하지 못한다. 명시적으로 처리한다:

- `postParse`: `b.content?.type === 'tableContent'`이면 `rows[].cells[].content`에 `tokenTextToInline` 적용한 새 블록 반환.
- `preSerialize`: 동일 위치에 `inlineToTokenText` 적용.
- `tableImage.ts`의 변환 함수를 import해서 사용(코덱/변환 로직은 `tableImage.ts`에 응집, customParse는 트리 순회 위치만 담당).

### 수정: `src/editor/Editor.tsx`

- 로드 2곳(초기 로드 line ~64, 리로드 line ~177): `parseMarkdownWithBlockquotes(editor, maskTableImages(body))`.
- 저장 1곳(line ~93): 직렬화 결과를 `unmaskTableImages(...)`로 감싼 뒤 가드/`saveFile`로 전달.

## 엣지 케이스 / 라운드트립

- **HTML `<img>` 셀 이미지**: `rewriteImagePathsForDisplay`가 로드 시 `<img>`→`![](url)` 변환 + `htmlMap` 등록 → `maskTableImages`가 토큰화 → 표시. 저장 시 `unmask`→`![](url)`→`restoreImagePaths`가 원본 `<img>` 태그(width 등 속성 포함)로 무손실 복원. **단 표시 렌더는 `width` 등 속성을 반영하지 않음**(표시 전용 한계).
- **셀 안 이미지+텍스트, 다중 이미지**: `tokenTextToInline`이 텍스트/`inlineImage`로 분리(splitInlineMath와 동일 로직).
- **테이블 밖 일반 이미지**: 손대지 않음 → 기존 블록 `image`로 유지.
- **일반 단락에 `|`가 우연히 포함**: GFM 테이블 블록 식별(헤더+구분행 필수)로 오탐 방지 — 파이프만 있는 단락은 테이블로 인식하지 않는다.
- **리로드(외부 편집) 경로**: 동일한 `parseMarkdownWithBlockquotes`+`postParse` 쌍을 사용하므로 자동 커버.

## 테스트 (Vitest)

- 토큰 코덱: `encodeToken`/`decodeToken` 라운드트립(특수문자 포함 alt/title/url).
- `maskTableImages`: 테이블 셀 이미지 토큰화, 코드펜스 내부·파이프만 있는 일반 단락 오탐 없음, 다중 이미지·이미지+텍스트 셀.
- `unmaskTableImages`: 토큰 → 마크다운 이미지(title 유무).
- `tokenTextToInline`/`inlineToTokenText`: split/join 대칭성.
- 전체 라운드트립: 마크다운(테이블 이미지) → mask → (블록트리 시뮬레이션) → unmask → 원문 동등.
- HTML `<img>` 셀 이미지 라운드트립(`imageMap`과 결합).

## 미결 사항 / 향후

- 표시 전용이므로 셀 이미지의 리사이즈/캡션/URL 교체는 미지원. 향후 필요 시 `InlineImage`에 편집 UI를 붙여 확장.
- HTML `<img>` 셀 이미지의 표시 렌더에 `width` 반영은 후속 개선 여지.
