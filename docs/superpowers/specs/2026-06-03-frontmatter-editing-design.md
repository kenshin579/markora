# YAML Frontmatter 편집 기능 설계

- 날짜: 2026-06-03
- 대상: `markora/` (JetBrains 플러그인 — frontend React/BlockNote 부분)

## 문제

markdown 파일 맨 위에 YAML frontmatter(`---`로 감싼 메타데이터 블록)가 있을 때, markora 에디터에서 **렌더링도 편집도 되지 않는다.**

근본 원인은 손실이 아니라 **의도적 우회 설계**다:

- `frontend/src/bridge/transform.ts`의 `splitFrontmatter()`가 파일 맨 위 `---...---`를 떼어내 모듈 전역 변수 `storedFrontmatter`에 보관한다.
- BlockNote 에디터에는 **본문(body)만** 전달된다.
- 저장 시 `joinFrontmatter()`로 frontmatter를 본문 앞에 그대로 다시 붙인다.

이 우회는 BlockNote v0.49의 `blocksToMarkdownLossy`가 YAML frontmatter를 깨뜨리는 문제(`---` → `***` 등)를 피하기 위한 것이다. 그 결과 frontmatter는 **보존되지만 화면에 보이지 않고 편집할 수 없다.**

## 목표

frontmatter를 **raw YAML 텍스트**로 편집할 수 있게 한다. 단, frontmatter가 BlockNote 직렬화를 거치지 않는다는 기존 안전장치는 그대로 유지한다.

### 결정된 요구사항

- 편집 형태: **Raw YAML 텍스트** (구조화 폼 아님).
- 위치: BlockNote **바깥의 별도 패널** (BlockNote 우회 유지).
- frontmatter 없는 파일: **추가 가능**.
- 패널을 전부 비우면: frontmatter **삭제**로 처리.
- 저장 시점: 본문과 **동일한 debounce 자동저장 흐름에 합류**.

### 비목표 (YAGNI)

- YAML 문법 검증·하이라이팅 없음. markora는 frontmatter를 의미 단위로 파싱하지 않고 순수 텍스트로만 다룬다.
- 구조화된 key-value 폼 없음.
- frontmatter 안의 인라인 편집(BlockNote 통합) 없음.

## 설계

### 1. 데이터 흐름 변경 — `bridge/markora.ts`, `bridge/transform.ts`

숨은 모듈 전역 `storedFrontmatter`를 제거하고 명시적 데이터 흐름으로 끌어올린다.

- `loadFile()` 반환을 `body: string` → `{ body, frontmatter }`로 변경.
- `saveFile(body, frontmatter)` — frontmatter를 인자로 받아 합친다.
- 패널은 **`---` 펜스 안쪽의 YAML 원문만** 다룬다 (예: `title: ...\ntags: [...]`). 펜스(`---`)는 사용자에게 노출하지 않고 직렬화 시 자동으로 감싼다 → 펜스를 실수로 깨뜨릴 여지를 없앤다.
- 직렬화 규칙:
  - YAML 내용이 있으면 → `---\n<yaml>\n---\n` + body
  - YAML이 비어있거나 공백뿐이면 → 펜스 없이 body만 (= frontmatter 삭제)
- `splitFrontmatter()`는 펜스를 벗긴 **inner YAML**을 패널용으로 돌려주고, 직렬화 헬퍼가 다시 펜스로 감싼다. round-trip 시 닫는 `---` 뒤의 본문은 기존 body를 그대로 이어 붙인다.

frontmatter가 여전히 BlockNote를 거치지 않으므로 `blocksToMarkdownLossy`의 YAML 파손 문제를 그대로 회피한다.

### 2. UI 컴포넌트 — `editor/FrontmatterPanel.tsx` (신규)

- 위치: BlockNote 에디터 바로 위, 본문과 같은 컬럼 폭에 정렬.
- 형태: 접이식(collapsible) 영역. 헤더에 "Frontmatter" 라벨 + 펼침/접힘 토글(▸/▾).
- 편집기: 펜스 안쪽 YAML을 보여주는 `<textarea>` (monospace, 최소 스타일).
- 빈 상태(frontmatter 없는 파일): 패널은 항상 렌더링하되 접힌 채로 "+ Add frontmatter" 형태로 노출. 펼쳐 입력하면 저장 흐름을 통해 파일 맨 위에 `---` 블록 생성.
- 삭제: textarea를 전부 비우면 직렬화 규칙에 따라 frontmatter 제거.
- 컨트롤드 컴포넌트: `value`/`onChange` props만 받고 자체 상태 없음. 상태는 부모(`Editor.tsx`)가 소유.
- 접힘 기본값: frontmatter 있으면 펼침 / 없으면 접힘.
- 테마: 기존 에디터처럼 다크/라이트 클래스만 따른다.

### 3. Editor 통합 & 자동저장 — `editor/Editor.tsx`

- 상태 추가: `const [frontmatter, setFrontmatter] = useState('')`.
- 로드: `loadFile()`의 `{ body, frontmatter }`로 body는 BlockNote에, frontmatter는 state에 세팅.
- 렌더: BlockNote 위에 `<FrontmatterPanel value={frontmatter} onChange={setFrontmatter} />`.
- 자동저장 합류(A안): 현재 본문 변경에만 걸린 debounce 자동저장 effect의 의존성에 `frontmatter`를 추가. YAML 타이핑도 본문 편집과 동일하게 잠시 후 자동저장.
- 저장 호출: `saveFile(body, frontmatter)`. body는 기존대로 `blocksToMarkdownLossy` + `preSerialize` + 이미지 경로 복원을 거치고, frontmatter는 그 위에 펜스로 합쳐진다.
- `lastKnownContentRef` 동기화: 저장 가드가 비교 기준으로 쓰는 "마지막 알려진 전체 내용"이 frontmatter까지 포함하도록 갱신. (안 그러면 frontmatter만 바꿨을 때 가드가 오작동)

본문 편집 경험은 그대로 두고 frontmatter만 같은 흐름에 얹는다.

### 4. 저장 가드 조정 — `markdown/saveGuard.ts` (+테스트)

현재 `checkSaveSafety()`의 레이어 1은 "이전엔 frontmatter가 있었는데 다음엔 없으면 → 저장 차단"이다. 이는 BlockNote가 frontmatter를 몰래 삼키는 사고를 막기 위한 것이었다.

이번 변경으로 frontmatter는 BlockNote를 거치지 않고 **패널의 명시적 사용자 입력으로만** 사라진다. 즉 "frontmatter 없어짐 = 사용자가 의도적으로 비움".

- 레이어 1(frontmatter 소실 차단) **제거**. frontmatter 삭제는 정당한 사용자 행위(비우면 삭제).
- 레이어 2(외부 편집 클로버 감지)·레이어 3(본문 대량 손실 감지)은 **유지** — 본문 보호 목적이라 여전히 유효.
- 레이어 2/3의 비교 대상을 **body끼리만** 비교하도록 한정. frontmatter를 포함한 전체 텍스트를 비교하면 frontmatter만 크게 바꿔도 레이어 3(50%+ 손실)이 오발동할 수 있음.

#### 테스트 (Vitest)

- frontmatter를 비우면 저장 허용.
- 본문만 대량 삭제는 여전히 차단.
- frontmatter 추가/수정 round-trip 정확성 (펜스 감싸기, 빈값=삭제, body 보존).

## 변경 파일 요약

| # | 파일 | 내용 |
|---|------|------|
| 1 | `bridge/markora.ts`, `bridge/transform.ts` | `storedFrontmatter` 전역 제거, `loadFile()→{body,frontmatter}`, `saveFile(body,frontmatter)`, 펜스 직렬화 / 빈값=삭제 규칙 |
| 2 | `editor/FrontmatterPanel.tsx` (신규) | 접이식 raw YAML textarea, 컨트롤드, 빈 파일엔 "+ Add frontmatter" |
| 3 | `editor/Editor.tsx` | frontmatter state, 패널 렌더, 자동저장 의존성 합류, `lastKnownContentRef` 동기화 |
| 4 | `markdown/saveGuard.ts` (+테스트) | 레이어1 제거, 레이어2/3는 body 기준 비교로 한정 |

## 위험 요소

- **round-trip 충실도**: 닫는 `---` 뒤 빈 줄, BOM, CRLF 보존. `splitFrontmatter`/직렬화 헬퍼에서 일관되게 처리하고 테스트로 고정한다.
- **저장 가드 회귀**: 레이어 1 제거가 본문 보호를 약화시키지 않도록, 비교 대상을 body로 명확히 분리하고 회귀 테스트를 추가한다.
