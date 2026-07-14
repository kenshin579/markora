# 테이블 셀 개행(`<br>`) 무손실 라운드트립 설계

- 날짜: 2026-07-14
- 상태: 구현 완료 (자동 테스트 통과 · runIde 수동 검증 대기)
- 대상 저장소: `markora/` (frontend)

## 배경 / 문제

markora 에디터에서 마크다운 테이블 셀 안의 개행(`| line1<br>line2 |`)이 양방향 모두 유실된다. 다른 마크다운 렌더러(GitHub 등)는 셀 안 `<br>`을 줄바꿈으로 표시하지만, markora는 그렇지 않다.

### 근본 원인 (실제 BlockNote 에디터로 실측)

markora 에디터는 BlockNote 기반이며, 마크다운 변환은 `blocksToMarkdownLossy` / `tryParseMarkdownToBlocks`(remark 파이프라인)에 위임되어 있다. 프로젝트 schema 를 사용한 `BlockNoteEditor.create({ schema })` 로 실측한 결과:

| 방향 | 입력 | 결과 |
|------|------|------|
| MD 파싱 | `\| line1<br>line2 \|` | 텍스트 `"line1line2"` — `<br>`이 통째로 삭제(공백도 없이 단어가 붙음) |
| MD 직렬화 | 셀 텍스트에 `\n` 포함(`line1\nline2`) | `\| line1 line2 \|` — 개행이 공백으로 치환 |
| 라운드트립 | `line1<br>line2` | `line1line2` — 원문 손상 |
| HTML 파싱 | `<td>line1<br>line2</td>` | 텍스트 `"line1\nline2"` — 모델 자체는 `\n` 보존 가능 |
| 블록 → HTML | 셀 텍스트 `line1\nline2` | `<td><p>line1<br>line2</p></td>` — `\n`을 `<br>`로 렌더 |
| ProseMirror 왕복 | 셀 텍스트 `line1\nline2` | `\n` 보존 |

핵심: **BlockNote 모델(ProseMirror)은 셀 텍스트의 `\n`(soft/hard break)을 담을 수 있고 화면에 `<br>`로 렌더링하며 왕복에서 보존한다.** 손실은 오직 **Markdown 파싱/직렬화 경계**에서만 발생한다. 파싱 시엔 remark 가 `<br>`을 inline HTML 노드로 파싱하는데 BlockNote 가 이를 버려 단어가 붙어버리고(데이터 손상), 직렬화 시엔 `\n`이 공백으로 뭉개진다.

부작용: markora 는 자동 저장 에디터이므로, 외부에서 `<br>`로 작성된 문서를 열었다 저장하면 셀 개행이 영구 소실된다.

## 목표 / 스코프

- **무손실 라운드트립**: 테이블 셀의 `<br>` 개행이 로드 → (편집) → 저장 과정에서 유실되지 않는다.
- **저장 형식 정규화**: 원문이 `<br>`, `<br/>`, `<br />`(대소문자 무관) 무엇이든 저장 시 `<br>`로 통일한다(원문 형식 보존은 범위 밖).
- **에디터 입력**: 셀 안 Shift+Enter 로 개행 입력은 BlockNote 기본 동작에 위임(별도 코드 없음, 수동 검증 대상).
- 테이블 **셀로 한정**. 테이블 밖 일반 문단/리스트/인용의 `<br>` 지원은 범위 밖(표준 개행 문법으로 대체 가능, 필요 시 후속 작업).

## 접근법

### 선택: 토큰 마스킹 + 블록트리 변환 (`tableImage.ts` 패턴 재사용)

셀 이미지 지원(`tableImage.ts`)이 이미 동일한 문제를 푼 두 계층 패턴을 그대로 답습한다:
- 문자열 계층: 파싱 전 테이블 라인의 `<br>`을 마크다운 무해 토큰으로 마스킹, 저장 후 복원.
- 블록트리 계층: `customParse.ts`의 `preSerialize`/`postParse`에서 셀 인라인 배열의 토큰 텍스트 ↔ `\n` 변환.

이미 검증된 패턴이며 테이블 스캐너·훅 지점·테스트 하네스를 재사용한다. BlockNote 내부를 건드리지 않아 라이브러리 업그레이드에 안전하다.

### 기각: remark 파이프라인 확장

`blocksToMarkdownLossy`/`tryParseMarkdownToBlocks`의 remark 변환에 `<br>` HTML 노드 ↔ hardBreak 매핑을 끼워 넣는 방법. BlockNote 가 이 파이프라인을 공개 API 로 노출하지 않아 내부 API 의존/포크가 필요하고 업그레이드에 취약하며 기존 코드베이스 패턴과 이질적이다.

### 기각: 직렬화 후처리만

저장 쪽만 `\n`→`<br>`로 고치고 로드는 방치하는 방법. 외부 `<br>` 문서를 열면 여전히 개행이 사라지고(`line1line2`) 저장 시 영구 유실 — 문제의 절반만 해결.

## 데이터 흐름

마스킹 순서 불변식: **로드 시 이미지 마스킹 → 개행 마스킹**, **저장 시 개행 언마스킹 → 이미지 언마스킹**(역순). 이미지 alt 안에 `<br>`이 있어도 base64 페이로드에 원문 그대로 캡슐화되므로 개행 마스킹의 간섭을 받지 않는다.

### 로드 (파일 → 화면)

1. `bridge.loadFile()` — 기존. `body` 반환.
2. `maskTableImages(body)` — 기존. 테이블 셀 이미지를 토큰화.
3. **(신규)** `maskTableBreaks(...)` — 테이블 라인 안의 `<br>` 변형을 토큰 `.MKRABR.`으로 치환.
4. `parseMarkdownWithBlockquotes(editor, masked)` — BlockNote 가 토큰을 셀 안 **텍스트**로 보존.
5. `postParse(blocks)` — **(신규)** `tableContent` 분기에서 셀 인라인 텍스트의 `.MKRABR.` 토큰을 `\n`으로 복원(기존 `tokenTextToInline` 이미지 복원과 합성).
6. `editor.replaceBlocks(...)` — `\n`이 BlockNote 에서 `<br>`로 렌더(실측 확인).

### 저장 (화면 → 파일)

1. `preSerialize(editor.document)` — **(신규)** `tableContent` 분기에서 셀 텍스트의 `\n`을 `.MKRABR.` 토큰으로 되돌림(기존 `inlineToTokenText` 이미지 직렬화와 합성).
2. `serializeBlocksWithBlockquotes(editor, ...)` — 토큰이 셀 안 **텍스트**로 직렬화됨.
3. **(신규)** `unmaskBreakTokens(md)` — `.MKRABR.` → `<br>`.
4. `unmaskTableImages(md)` — 기존. 이미지 토큰 → 마크다운 이미지.
5. `bridge.saveFile(body, ...)` — 기존.

## 컴포넌트

### 신규: `src/markdown/tableScan.ts`

`tableImage.ts`에 있는 GFM 테이블 라인 스캐너를 공용 유틸로 추출한다(기존 코드 개선 겸함 — `tableImage.ts`와 `tableLineBreak.ts`가 스캔 로직을 중복하지 않도록).

- `mapTableLines(md: string, mapLine: (line: string) => string): string`
  - CRLF/CR → LF 정규화 후 라인 스캔. 코드펜스(```` ``` ````/`~~~`) 내부 제외.
  - GFM 테이블 블록 식별: (헤더행) + (구분행 `| --- | :--: |`, `-` 포함) + 이후 연속 파이프 본문행, 빈 줄/비-행에서 종료.
  - 식별된 테이블 라인에만 `mapLine` 적용. 그 외 라인은 그대로.
  - 한계(기존 유지): blockquote 중첩 테이블(`> | --- |`)은 구분행이 매칭되지 않아 감지하지 않음.
- `tableImage.ts`의 `maskTableImages`를 이 유틸 위에 재구현하고, 기존 `tableImage` 테스트가 전부 통과함을 확인한다(리팩터링 안전망).

### 신규: `src/markdown/tableLineBreak.ts`

토큰 코덱과 문자열/트리 변환 함수. `tableImage.ts`와 대칭 구조.

- 토큰 형식: `.MKRABR.` (고정 문자열, 페이로드 없음 — 개행은 캡슐화할 데이터가 없다).
  - `.`으로 감싸 base64url/일반 텍스트와 경계가 모호하지 않게 한다(`tableImage.ts` 토큰 규약과 동일 철학).
  - 토큰 정규식: `/\.MKRABR\./g`.
- `BR_TAG_RE = /<br[ \t]*\/?>/gi` — `<br>`, `<br/>`, `<br />`, 대소문자 무관.
- `maskTableBreaks(md: string): string`
  - `mapTableLines(md, line => line.replace(BR_TAG_RE, '.MKRABR.'))`.
- `unmaskBreakTokens(md: string): string`
  - `md.replace(/\.MKRABR\./g, '<br>')` — 저장 형식 정규화.
- `breakTokensToNewlines(nodes: InlineNode[]): InlineNode[]`
  - 셀 인라인 텍스트 노드에서 `.MKRABR.` 토큰을 `\n`으로 치환(스타일 보존). 텍스트 노드 내 문자열 치환이라 노드 분리 불필요.
- `newlinesToBreakTokens(nodes: InlineNode[]): InlineNode[]`
  - 역방향: 셀 텍스트 노드의 `\n`을 `.MKRABR.` 토큰으로 치환.

### 수정: `src/markdown/customParse.ts`

`preSerialize`/`postParse`의 기존 테이블 분기(`mapTableCells`)에 개행 변환을 합성한다. 순서가 중요하다:

- `postParse`(라인 53 인근): `mapTableCells(b, nodes => tokenTextToInline(breakTokensToNewlines(nodes)))`.
  - 이미지 토큰 복원 전에 개행 토큰을 `\n`으로 바꾼다(둘은 서로 다른 토큰이라 순서 무관하나 명확성을 위해 개행 먼저).
- `preSerialize`(라인 54 인근): `mapTableCells(b, nodes => newlinesToBreakTokens(inlineToTokenText(nodes)))`.
  - `inlineToTokenText`가 인접 텍스트를 병합한 뒤 `\n`을 토큰화.

### 수정: `src/editor/Editor.tsx`

- 로드 2곳(초기 로드 `:65`, 리로드 `:180`): `maskTableImages(body)` → `maskTableBreaks(maskTableImages(body))`.
- 저장 1곳(`:94`): 직렬화 결과를 `unmaskBreakTokens(...)`로 먼저 감싼 뒤 `unmaskTableImages(...)`로 감싼다(역순 불변식).

## 엣지 케이스 / 라운드트립

- **연속 개행** `<br><br>` → `\n\n` → 왕복 보존.
- **`saveGuard`(라인 수 기반)**: 영향 없음 — 토큰/`<br>`/`\n` 모두 인라인이라 본문 라인 수 불변.
- **이미지+개행 혼합 셀** `\| ![a](x)<br>텍스트 \|`: 이미지 먼저 토큰화되어 개행 마스킹과 간섭 없음.
- **리로드(외부 편집) 경로**: 동일한 `maskTableBreaks`+`postParse` 쌍을 사용하므로 자동 커버.
- **손상/비정상 입력**: 순수 문자열/배열 변환이라 예외 발생 지점이 없다. 매칭 안 되면 원문 그대로 통과.

### 수용하는 한계 (모두 기존 셀 이미지 기능과 동일 수준)

- 셀 안 인라인 코드 스팬 내부의 `<br>`(`` `a<br>b` ``)도 치환된다.
- 사용자가 리터럴 `.MKRABR.` 텍스트를 셀에 입력하면 저장 시 `<br>`로 변환된다.
- blockquote 중첩 테이블은 스캐너가 감지하지 않는다(기존 동작 유지).

## 테스트 (Vitest)

- **단위**:
  - `maskTableBreaks`: `<br>`/`<br/>`/`<br />`/`<BR>` 변형 토큰화, 코드펜스 내부·비테이블 라인 제외.
  - `unmaskBreakTokens`: 토큰 → `<br>`, 변형 입력의 `<br>` 정규화.
  - `breakTokensToNewlines`/`newlinesToBreakTokens`: 대칭성, 스타일 보존, 연속 개행.
  - `tableScan` 추출 후 기존 `tableImage` 테스트 전부 통과(리팩터링 안전망).
- **통합**(실제 `BlockNoteEditor.create({ schema })`, 기존 `integration.test.ts` 패턴):
  - `\| line1<br>line2 \|` 라운드트립 무손실.
  - `<br/>`·`<BR />` → `<br>` 정규화.
  - 이미지+개행 혼합 셀.
  - 셀 텍스트 `\n`(Shift+Enter 상당) → `<br>` 직렬화.
- **수동 검증**(`runIde` 샌드박스): 셀 내 Shift+Enter 가 실제 hard break 를 만드는지 실측(BlockNote 기본 키맵 동작 예상, 코드 변경 없이 되는지 확인).

## 미결 사항 / 향후

- 테이블 밖 일반 문단/리스트의 `<br>` 지원은 범위 밖. 필요 시 후속 작업으로 분리.
- 원문 `<br/>` 형식 보존은 범위 밖(저장 시 `<br>`로 정규화).
