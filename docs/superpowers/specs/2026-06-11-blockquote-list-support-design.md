# Blockquote 내부 리스트 지원 설계

날짜: 2026-06-11
대상 저장소: `markora/`
브랜치: `feature/blockquote-list-support`

## 배경 / 문제

다른 마크다운 에디터는 blockquote 안에 리스트를 넣는 형태(`> - item`)를 지원하지만, markora는 이를 평문으로 뭉개버린다.

원인은 markora 코드가 아니라 **BlockNote 내장 마크다운 파서/직렬화기의 한계**다 (0.49.0, 0.51.4 모두 동일하게 재현 확인됨):

1. **파싱** (`tryParseMarkdownToBlocks`): `> - item` 입력 시 리스트 구조를 버리고 단일 `quote` 블록의 flat inline 텍스트로 합친다. `- ` 마커 소실, `children: []`.
2. **직렬화** (`blocksToMarkdownLossy`): `quote` + list children 구조를 만들어줘도 list가 `> ` 접두사 없이 출력되어 blockquote 밖으로 탈출한다.

BlockNote 업그레이드로는 해결되지 않으므로 markora 측에서 커스텀 파싱/직렬화 레이어를 둔다.

## 핵심 통찰

BlockNote는 **top-level에서는 리스트(중첩 포함)를 완벽히 파싱/직렬화**한다. 망가지는 건 오직 `>` 안에 있을 때다. 따라서 "`>` 껍데기를 벗기고 BlockNote에게 맡긴 뒤 다시 씌우는" 전략으로, BlockNote의 검증된 리스트 처리를 양방향 모두 재활용한다. markora는 `>` 껍데기 레이어만 책임진다.

## 범위

| 항목 | 결정 |
|------|------|
| 리스트 종류 | bullet + numbered list |
| blockquote 내부 구성 | 선행 단락(1개) + 리스트 |
| 리스트 중첩 | 중첩 리스트까지 재귀 지원 |
| 중첩 blockquote(`>>`) | 범위 외 — 1단계만 처리, 나머지는 기존처럼 평탄화 (의도적) |
| 리스트 뒤 후행 단락 / 임의 블록 시퀀스 | 범위 외 |

## 아키텍처 / 통합 지점

새 모듈 **`frontend/src/markdown/blockquote.ts`** 를 추가한다. export 2개:

- `parseMarkdownWithBlockquotes(editor, body): Promise<Block[]>` — 원문 마크다운에서 blockquote 구간을 직접 처리하며 블록 트리 반환
- `serializeBlocksWithBlockquotes(editor, blocks): Promise<string>` — 블록 트리에서 quote+children를 `>` 접두사로 복원하며 마크다운 반환

두 함수 모두 내부적으로 `editor.tryParseMarkdownToBlocks` / `editor.blocksToMarkdownLossy`를 재사용한다. 직접 구현하는 것은 `>` 껍데기 레이어뿐이다.

`customParse.ts`의 `postParse` / `preSerialize`(KaTeX·Mermaid)는 그대로 유지하고 기존 위치에서 합성한다. blockquote는 별개 관심사이므로 customParse.ts에 합치지 않고 모듈을 분리한다.

### `Editor.tsx` 변경 (3곳)

- L63, L176 (로드 / 외부변경 리로드):
  `editor.tryParseMarkdownToBlocks(body)` → `parseMarkdownWithBlockquotes(editor, body)`
  (이후 `postParse(...)` 적용은 그대로)
- L92 (저장):
  `editor.blocksToMarkdownLossy(preSerialize(editor.document))` → `serializeBlocksWithBlockquotes(editor, preSerialize(editor.document))`

합성 순서:
- 파싱: `postParse(await parseMarkdownWithBlockquotes(editor, body))`
- 저장: `await serializeBlocksWithBlockquotes(editor, preSerialize(editor.document))`

`postParse`가 children까지 재귀하므로 quote 내부 리스트 항목의 인라인 수식도 자연스럽게 처리된다.

## 파싱 알고리즘

`parseMarkdownWithBlockquotes(editor, body)`:

### 1단계 — 구간 분할 (라인 스캐너)

원문을 줄 단위로 훑으며 두 종류의 연속 구간(run)으로 나눈다:
- **blockquote run**: 앞 공백(≤3) 다음 `>`로 시작하는 줄들의 연속 구간
- **일반 run**: 그 외

코드펜스 인지: ` ``` ` 또는 `~~~` 토글 상태를 추적해 **펜스 내부의 `>` 줄은 blockquote로 오인하지 않는다**. 펜스 안은 무조건 일반 run에 귀속.

### 2단계 — run별 파싱

- **일반 run**: `editor.tryParseMarkdownToBlocks(runText)` 그대로
- **blockquote run**:
  1. 각 줄에서 `>` 접두사 1단계 제거 (`> x` → `x`, `>` → 빈 줄). 들여쓰기는 보존 → 중첩 list 유지
  2. 벗긴 내부 텍스트를 `editor.tryParseMarkdownToBlocks(inner)`로 재파싱 → 정상 블록 배열
  3. **조립 규칙**: 첫 블록이 `paragraph`면 그 인라인 content를 `quote.content`(선행 단락)로 쓰고 나머지 블록을 `quote.children`로. 첫 블록이 paragraph가 아니면(예: 바로 list 시작) `quote.content`는 빈 배열, 전부 children으로.
  4. 결과: `{ type: 'quote', props, content, children }` 단일 블록

### 3단계 — 이어붙이기

모든 run의 블록을 원래 순서대로 concat.

## 직렬화 알고리즘

`serializeBlocksWithBlockquotes(editor, blocks)`:

최상위 블록을 순회하며 **quote 블록만 특별 처리**하고 나머지는 BlockNote에 위임한다. 인접한 비-quote 블록들은 묶어서 한 번에 직렬화해 블록 간 간격을 BlockNote 기본값대로 유지한다.

**quote 블록 직렬화** (children 유무 무관하게 일관 처리):
1. **lead**: `editor.blocksToMarkdownLossy([{...quote, children: []}])` → `> 링크` (BlockNote가 `>` 부착)
2. **children**: children이 있으면 `editor.blocksToMarkdownLossy(children)` → `* 항목 1\n* 항목 2` (중첩 들여쓰기 보존)
3. **`>` 재적용**: children 마크다운의 모든 줄 앞에 `> ` 부착 (빈 줄은 `>`로). 중첩 들여쓰기는 텍스트로 보존 → `>   * 하위항목`
4. **결합**: `lead` + `\n>\n` + `prefixed-children`. children이 없으면 lead만 출력.

결과 예:
```
> 링크
>
> * 항목 1
> * 항목 2
```

이 출력을 다시 `parseMarkdownWithBlockquotes`로 읽으면 `>` 벗겨 → `* 항목` → list 재파싱 → 동일 구조 복원. **라운드트립 성립.**

구현은 별도 임시 에디터 없이 현재 `editor` 인스턴스의 `blocksToMarkdownLossy`를 부분 호출(서브트리/단일 블록 단위). 동작 검증은 테스트로 한다.

## 엣지케이스

- **코드펜스 안 `>`**: fence 토글 추적으로 blockquote 오인 방지
- **`>` 없는 일반 문서**: blockquote run 0개 → 전부 일반 run → 기존과 100% 동일 동작 (무회귀)
- **`> 단락`만 있고 list 없음**: children 없는 quote → 기존 동작 유지
- **빈 quote 줄(`>`)**: 선행/내부 빈 줄로 보존
- **중첩 blockquote(`>>`)**: 1단계만 처리, 나머지 평탄화 (범위 외, 의도적)

## 라운드트립 안전성 (saveGuard)

기존 `saveGuard.ts`의 `checkSaveSafety`는 직렬화 결과의 손실을 검출한다. 새 직렬화 경로가 이 검사를 통과해야 하므로 **"파싱→직렬화→재파싱이 동일 블록 트리를 내는지"를 테스트로 명시 검증**한다. quote+list가 saveGuard에 손실로 오탐되지 않는지도 확인한다.

## 테스트

신규 `src/markdown/__tests__/blockquote.test.ts` (Vitest):

1. 파싱: `> - a\n> - b` → quote(children=[bullet, bullet]), 마커 보존
2. 파싱: 선행 단락 + list (이미지 케이스) → quote.content=링크, children=4개 항목
3. 파싱: numbered list (`> 1. a`) → numberedListItem children
4. 파싱: 중첩 list (`> - a\n>   - a1`) → 중첩 children
5. 직렬화: quote+children → `> * a\n> * b` 형태, `>` 접두사 유지
6. 라운드트립: 위 케이스 md→blocks→md→blocks 동일성
7. 코드펜스 안 `>` 줄이 quote로 안 변하는지
8. blockquote 없는 일반 문서 무회귀
9. 기존 `integration.test.ts` / `roundtrip.test.ts` 전부 통과 유지

## 완료 기준

- 위 테스트 통과
- `./gradlew buildFrontend` 성공
- (가능하면) `runIde`로 이미지 케이스 육안 확인
