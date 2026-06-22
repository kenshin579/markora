# Strikethrough 렌더링 개선 — 단일 틸드 오탐 수정

- **작성일**: 2026-06-22
- **브랜치**: `fix/strikethrough-single-tilde`
- **상태**: 설계 승인 대기

## 문제

markora에서 `(0.4~1.0)`, `(30~300s)`, `(0~2)` 같은 **범위 표현이 strikethrough(취소선)로 잘못 렌더링**된다. 한 표 셀/줄 안에 단일 틸드 `~`가 짝수 개 있으면 그 사이 텍스트 전체가 취소선 처리된다.

## 근본 원인

markora는 BlockNote(`@blocknote/core ^0.49`)로 마크다운을 파싱한다. BlockNote 내부 파이프라인은
`unified → remark-parse → remark-gfm → remark-rehype` 이며, **`remark-gfm`을 옵션 없이** 사용한다
(`node_modules/@blocknote/core/dist/src-DQfz4zLM.js:651`).

`remark-gfm`은 `singleTilde` 옵션 기본값이 **`true`** 라서 **단일 틸드 `~text~` 도 strikethrough로 인식**한다.
GFM 표준은 사실 `~~text~~`(이중 틸드)만 strikethrough로 규정하지만, remark-gfm의 기본값이 관대해 생긴 문제다.

검증 결과:
- 파싱: 기본값(`singleTilde:true`)은 `(0.4~1.0)`에서 `delete`(strike) 노드를 생성. `singleTilde:false`면 생성 안 함. `~~취소선~~`은 양쪽 모두 정상.
- 직렬화: `remark-stringify`는 텍스트 내 단일 `~`를 **항상 `\~`로 이스케이프**한다(`singleTilde` 옵션과 무관). 따라서 파싱만 고치면 저장 시 `(0.4~1.0)` → `(0.4\~1.0)`로 파일이 오염된다.

BlockNote 0.49의 `tryParseMarkdownToBlocks` / `blocksToMarkdownLossy`는 `singleTilde` 옵션을 외부로 노출하지 않는다.

## 목표 / 비목표

**목표**
- (A) **GFM 표준 준수**: 단일 `~`는 일반 텍스트, `~~text~~`(이중 틸드)만 strikethrough.
- (B) **왕복(round-trip) 보존**: 파일을 열고 다시 저장해도 사용자의 단일 `~`가 그대로 보존(저장 파일에 `\~` 오염 없음). `~~text~~` 취소선은 양방향 모두 정상.

**비목표 (YAGNI)**
- `singleTilde` 토글 설정 옵션 — 만들지 않음(항상 GFM 표준).
- subscript(`~x~`) 등 다른 틸드 용법 지원.

## 접근법

BlockNote 내부를 수정하지 않고, markora가 이미 BlockNote 파싱/직렬화를 감싸고 있는
래퍼 레이어(`frontend/src/markdown/`)에서 **문자열 전처리/후처리**로 해결한다.
이는 기존 inline-math 전/후처리(`customParse.ts`)와 동일한 패턴이며 BlockNote 버전 업그레이드에 강하다.

(대안으로 BlockNote 빌드 산출물 patch-package, 파싱 후 AST에서 strike 되돌리기를 검토했으나
각각 버전마다 깨짐/직렬화 미해결, 의도된 `~~strike~~`와 구분 불가의 이유로 기각.)

## 모듈 구조

신규 모듈 `frontend/src/markdown/strikethrough.ts` — 순수 함수 2개를 export:

- `escapeSingleTildes(md: string): string` — **파싱 전** 단계
- `unescapeTildes(md: string): string` — **직렬화 후** 단계

호출 지점 (`frontend/src/markdown/blockquote.ts`, 최소 침습):

- `parseMarkdownWithBlockquotes`: `normalized` 생성 직후 `escapeSingleTildes(normalized)` 적용
  (splitRuns 이전, 전체 1회).
- `serializeBlocksWithBlockquotes`: 최종 `return` 직전 결과 문자열 전체에 `unescapeTildes(...)` 적용.

## 핵심 알고리즘

**규칙**: "연속된 `~` 런의 길이가 정확히 1일 때만 이스케이프한다. 길이 2 이상은 그대로 둔다."

이 한 규칙이 모든 케이스를 정리한다:
- `~~strike~~` → 길이 2 런 → 보존(정상 취소선)
- `(0.4~1.0)` → 단일 `~` → `(0.4\~1.0)` 이스케이프
- `~~~` 코드펜스 마커 → 길이 3 런 → 보존

### `escapeSingleTildes` (파싱 전) — 코드 인지

1. 줄 단위 순회하며 펜스 상태 추적 (기존 `FENCE_RE = /^ {0,3}(```|~~~)/` 재사용).
   펜스 블록 **내부 줄은 변형 안 함**(코드 verbatim 보존).
2. 펜스 밖 줄은 인라인 코드스팬(백틱 런으로 구분)을 분리해, **코드스팬이 아닌 텍스트 구간에만**
   정규식 적용:
   - `/(?<!\\)(?<!~)~(?!~)/g` → `\~`
   - 앞에 `\`/`~`가 없고 뒤에 `~`가 없는 "고립된 단일 틸드"만 치환. 이미 이스케이프된 `\~`나 `~~` 쌍은 건드리지 않음.

### `unescapeTildes` (직렬화 후)

- BlockNote(remark-stringify)는 리터럴 단일 `~`를 항상 `\~`로 내보냄. 이를 전역 치환 `/\\~/g → ~`로 복원.
- `~~strike~~`는 백슬래시 없이 출력되므로 영향 없음. 코드 블록 내부에는 remark가 `\~`를 만들지 않아 안전.

### inline-math 상호작용 (확인됨)

`$a~b$` 같은 수식 내 단일 틸드는 파싱 전 `$a\~b$`가 되지만, remark가 텍스트 노드 값을 `$a~b$`로
언이스케이프 → markora의 `splitInlineMath`가 정상 추출. 왕복도 보존된다.

## 엣지 케이스

| 입력 | 기대 동작 |
|---|---|
| `(0.4~1.0)` 범위 | 리터럴 텍스트, strike 안 됨 |
| `~~취소선~~` | 정상 strike 유지(양방향) |
| 표 셀 내 다중 단일틸드 `(30~300s)` | 모두 리터럴 |
| 인라인 코드 `` `a~b` `` | 변형 안 함(코드 verbatim) |
| 펜스 코드블록 내 `a~b` | 변형 안 함 |
| `~~~` 펜스 마커 | 보존(런 길이 3) |
| 이미 이스케이프된 `\~` | 이중 이스케이프 안 함 |
| 단일틸드 round-trip(열기→저장) | 파일에 `\~` 오염 없음, `~` 그대로 |

## 테스트 전략

기존 vitest 셋업(`frontend/src/markdown/__tests__/`) 활용:

1. `strikethrough.test.ts`(신규): `escapeSingleTildes` / `unescapeTildes` 단위 테스트 — 위 표의 문자열 변환을 직접 검증.
2. `roundtrip.test.ts` 또는 `integration.test.ts`에 케이스 추가: 실제 BlockNote 에디터로
   `parseMarkdownWithBlockquotes` → `serializeBlocksWithBlockquotes` 왕복 시 단일틸드 텍스트가 보존되고
   `~~strike~~`가 유지되는지 검증.

**검증 명령**
- `cd frontend && npm test`
- `./gradlew build`(번들 재빌드) → `./gradlew runIde` 샌드박스에서 표 렌더링 육안 확인.
