# 테이블 셀 개행(`<br>`) 무손실 라운드트립 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** markora 테이블 셀 안의 개행(`| line1<br>line2 |`)을 로드 → 편집 → 저장 전 과정에서 유실 없이 라운드트립하고, 저장 시 `<br>`로 정규화한다.

**Architecture:** 셀 이미지 기능(`tableImage.ts`)과 동일한 토큰 마스킹 패턴을 답습한다. 파싱 전 테이블 라인의 `<br>` 변형을 무해 토큰 `.MKRABR.`으로 치환해 BlockNote가 텍스트로 보존하게 하고, 파싱 후 셀 인라인 텍스트의 토큰을 `\n`으로 복원한다(BlockNote가 `\n`을 `<br>`로 렌더). 저장은 역방향. 테이블 라인 스캐너는 `tableImage.ts`에서 공용 유틸 `tableScan.ts`로 추출해 두 기능이 공유한다.

**Tech Stack:** TypeScript, BlockNote(`@blocknote/core`), Vitest. 작업 디렉터리는 `markora/frontend/`. 테스트는 `npm test`(vitest 일회성) 또는 `npx vitest run <path>`.

> **작업 브랜치:** `feature/table-cell-linebreak` (이미 생성됨). 모든 커밋은 이 브랜치에.

---

## File Structure

- **Create** `frontend/src/markdown/tableScan.ts` — GFM 테이블 라인 스캐너(`mapTableLines`). `tableImage.ts`에서 추출한 공용 유틸.
- **Create** `frontend/src/markdown/tableLineBreak.ts` — 개행 토큰 코덱과 문자열/트리 변환 4함수.
- **Modify** `frontend/src/markdown/tableImage.ts` — 스캐너를 `tableScan.ts`에서 import 하도록 리팩터링(동작 불변).
- **Modify** `frontend/src/markdown/customParse.ts` — 기존 셀 이미지 변환에 개행 변환을 합성.
- **Modify** `frontend/src/editor/Editor.tsx` — 로드 2곳·저장 1곳에 개행 마스킹/언마스킹을 감싼다.
- **Create** `frontend/src/markdown/__tests__/tableScan.test.ts` — 스캐너 단위 테스트.
- **Create** `frontend/src/markdown/__tests__/tableLineBreak.test.ts` — 개행 변환 단위 테스트.
- **Create** `frontend/src/markdown/__tests__/tableLineBreak-roundtrip.test.ts` — 실제 BlockNote 에디터 전체 파이프라인 통합 테스트.

---

## Task 1: 테이블 라인 스캐너를 `tableScan.ts`로 추출

`tableImage.ts`의 라인 스캔 로직(펜스 판정 + GFM 구분행 감지 + 테이블 블록 추적)을 공용 `mapTableLines(md, mapLine)`로 추출한다. 개행 마스킹과 이미지 마스킹이 이 스캐너를 공유해 중복을 없앤다. **리팩터링 — 기존 `tableImage` 테스트가 안전망이다.**

**Files:**
- Create: `frontend/src/markdown/tableScan.ts`
- Create: `frontend/src/markdown/__tests__/tableScan.test.ts`
- Modify: `frontend/src/markdown/tableImage.ts:43-88`

- [ ] **Step 1: `tableScan.ts` 생성 (구현 먼저 — `tableImage.ts`에서 그대로 이관)**

`frontend/src/markdown/tableScan.ts`:

```ts
// GFM 테이블 라인 스캐너 (tableImage.ts / tableLineBreak.ts 공용)
//
// GFM 테이블 블록(헤더행 + 구분행 + 본문행) 내부의 라인에만 mapLine 을 적용한다.
// 코드펜스 내부는 제외하고, 그 외 라인은 원문 그대로 통과시킨다.

// blockquote.ts / strikethrough.ts 와 동일한 펜스 판정.
const FENCE_RE = /^ {0,3}(```|~~~)/;
// GFM 구분행: 셀마다 optional colon + 하이픈. 최소 한 개의 '-' 포함.
const DELIM_ROW_RE = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

function isTableRow(line: string): boolean {
  return line.includes('|') && line.trim() !== '';
}

// CRLF/CR → LF 정규화 후 스캔한다. 이 함수는 RAW 본문에 먼저 도는데(하위 파이프라인의
// CRLF 정규화보다 앞섬), 정규화하지 않으면 DELIM_ROW_RE 의 `$`(m 플래그 없음)가 trailing
// `\r` 앞에서 매칭에 실패해 CRLF 테이블을 놓친다. 하위 파이프라인이 어차피 동일하게
// 정규화하므로 LF 입력은 무변화.
// 한계: blockquote 안에 중첩된 테이블(`> | --- |`)은 구분행이 매칭되지 않아 감지하지 않는다.
export function mapTableLines(md: string, mapLine: (line: string) => string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  let inFence = false;
  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE_RE.test(line)) { inFence = !inFence; inTable = false; continue; }
    if (inFence) continue;
    if (!inTable) {
      // 헤더행 조건: 현재 줄이 파이프 행이고 다음 줄이 구분행.
      if (isTableRow(line) && i + 1 < lines.length && DELIM_ROW_RE.test(lines[i + 1])) {
        inTable = true;
      }
    } else if (!isTableRow(line)) {
      // 빈 줄/비-행에서 테이블 종료.
      inTable = false;
      continue;
    }
    if (inTable) lines[i] = mapLine(line);
  }
  return lines.join('\n');
}
```

- [ ] **Step 2: `tableScan.test.ts` 작성 (실패 확인용)**

`frontend/src/markdown/__tests__/tableScan.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mapTableLines } from '../tableScan';

describe('mapTableLines', () => {
  it('테이블 본문행에만 mapLine 을 적용하고 테이블 밖은 원문 유지', () => {
    const md = ['before x', '| A | B |', '| --- | --- |', '| x | y |', '', 'after x'].join('\n');
    const out = mapTableLines(md, (line) => line.replace(/x/g, 'X'));
    const lines = out.split('\n');
    expect(lines[0]).toBe('before x');   // 테이블 밖
    expect(lines[3]).toBe('| X | y |');  // 본문행 — 적용됨
    expect(lines[5]).toBe('after x');    // 테이블 밖
  });

  it('코드펜스 내부의 테이블 모양 라인은 건드리지 않는다', () => {
    const md = ['```', '| A |', '| --- |', '| x |', '```'].join('\n');
    const out = mapTableLines(md, (line) => line.replace(/x/g, 'X'));
    expect(out).toContain('| x |');
  });

  it('파이프만 있고 구분행이 없는 단락은 테이블로 오인하지 않는다', () => {
    const md = 'a | b x c | d';
    expect(mapTableLines(md, (line) => line.replace(/x/g, 'X'))).toBe('a | b x c | d');
  });

  it('CRLF 테이블도 본문행에 적용된다', () => {
    const md = '| A |\r\n| --- |\r\n| x |';
    const out = mapTableLines(md, (line) => line.replace(/x/g, 'X'));
    expect(out).toContain('| X |');
  });
});
```

- [ ] **Step 3: 테스트 실행 — PASS 확인 (구현이 이미 있으므로 통과)**

Run: `cd frontend && npx vitest run src/markdown/__tests__/tableScan.test.ts`
Expected: 4개 PASS

- [ ] **Step 4: `tableImage.ts`가 `mapTableLines`를 쓰도록 리팩터링**

`frontend/src/markdown/tableImage.ts`의 상단 import에 추가:

```ts
import { mapTableLines } from './tableScan';
```

`tableImage.ts:43-46`의 스캐너 전용 상수/헬퍼를 **삭제**한다(이제 `tableScan.ts`로 이관됨):

```ts
// 삭제 대상 (43-46 및 관련 isTableRow):
const FENCE_RE = /^ {0,3}(```|~~~)/;
const DELIM_ROW_RE = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
```

`IMAGE_RE`(48행)와 `maskImagesInLine`(54-57행)은 **유지**한다. `isTableRow`(50-52행)도 삭제한다(스캐너로 이관됨).

`tableImage.ts:61-88`의 `maskTableImages` 전체를 아래로 교체:

```ts
// GFM 테이블 블록 내부의 마크다운 이미지만 토큰으로 치환한다. 스캔 로직은 tableScan 공용.
export function maskTableImages(md: string): string {
  return mapTableLines(md, maskImagesInLine);
}
```

- [ ] **Step 5: 전체 테스트 실행 — 리팩터링 안전망 확인**

Run: `cd frontend && npx vitest run`
Expected: 기존 `tableImage.test.ts`, `tableImage-roundtrip.test.ts` 포함 전부 PASS. 실패 시 삭제/치환 범위를 재확인.

- [ ] **Step 6: 커밋**

```bash
cd /Users/user/src/workspace_markora/markora
git add frontend/src/markdown/tableScan.ts frontend/src/markdown/__tests__/tableScan.test.ts frontend/src/markdown/tableImage.ts
git commit -m "refactor: 테이블 라인 스캐너를 tableScan.ts 공용 유틸로 추출

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 개행 문자열 마스킹 (`maskTableBreaks` / `unmaskBreakTokens`)

문자열 계층: 파싱 전 테이블 라인의 `<br>` 변형을 토큰으로, 저장 후 토큰을 `<br>`로.

**Files:**
- Create: `frontend/src/markdown/tableLineBreak.ts`
- Create: `frontend/src/markdown/__tests__/tableLineBreak.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/markdown/__tests__/tableLineBreak.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { maskTableBreaks, unmaskBreakTokens } from '../tableLineBreak';

describe('maskTableBreaks', () => {
  it('셀 안 <br> 변형(<br>, <br/>, <br />, <BR>)을 토큰으로 치환', () => {
    const md = [
      '| A |',
      '| --- |',
      '| l1<br>l2 |',
      '| a<br/>b |',
      '| c<br />d |',
      '| e<BR>f |',
    ].join('\n');
    const out = maskTableBreaks(md);
    expect(out).not.toMatch(/<br/i);
    expect((out.match(/\.MKRABR\./g) || []).length).toBe(4);
  });

  it('테이블 밖 <br> 는 건드리지 않는다', () => {
    const md = 'para<br>text\n\n| H |\n| --- |\n| c |';
    expect(maskTableBreaks(md)).toContain('para<br>text');
  });

  it('코드펜스 내부 <br> 는 건드리지 않는다', () => {
    const md = ['```html', '<br>', '```'].join('\n');
    expect(maskTableBreaks(md)).toContain('<br>');
  });
});

describe('unmaskBreakTokens', () => {
  it('토큰을 <br> 로 복원', () => {
    expect(unmaskBreakTokens('l1.MKRABR.l2')).toBe('l1<br>l2');
  });
  it('연속 토큰도 각각 복원', () => {
    expect(unmaskBreakTokens('a.MKRABR..MKRABR.b')).toBe('a<br><br>b');
  });
  it('토큰이 없으면 원문 그대로', () => {
    expect(unmaskBreakTokens('plain text')).toBe('plain text');
  });
});
```

- [ ] **Step 2: 테스트 실행 — FAIL 확인**

Run: `cd frontend && npx vitest run src/markdown/__tests__/tableLineBreak.test.ts`
Expected: FAIL — "Failed to resolve import '../tableLineBreak'" 또는 함수 미정의.

- [ ] **Step 3: `tableLineBreak.ts` 생성 (문자열 계층 함수)**

`frontend/src/markdown/tableLineBreak.ts`:

```ts
// 테이블 셀 개행(<br>) 무손실 라운드트립.
//
// BlockNote 의 markdown 파서는 셀 안 <br> 을 드롭하고(단어가 붙어 데이터 손상),
// 직렬화 시 셀 텍스트의 \n 을 공백으로 뭉갠다. 이를 우회하기 위해 파싱 직전 테이블
// 라인의 <br> 변형을 무해 토큰으로 마스킹하고(파서가 텍스트로 보존), 파싱 후 셀
// 인라인 텍스트의 토큰을 \n 으로 복원한다(BlockNote 가 \n 을 <br> 로 렌더). 저장은 역방향.
// tableImage.ts 와 대칭 구조. 저장 형식은 항상 <br> 로 정규화한다.

import { mapTableLines } from './tableScan';

// 토큰: '.MKRABR.' — 캡슐화할 데이터가 없어 페이로드 없는 고정 문자열. '.'로 감싸
// base64url/일반 텍스트와 경계가 모호하지 않다(tableImage.ts 토큰 규약과 동일 철학).
const BREAK_TOKEN = '.MKRABR.';
const BREAK_TOKEN_RE = /\.MKRABR\./g;
// <br>, <br/>, <br />, 대소문자 무관.
const BR_TAG_RE = /<br[ \t]*\/?>/gi;

export function maskTableBreaks(md: string): string {
  return mapTableLines(md, (line) => line.replace(BR_TAG_RE, BREAK_TOKEN));
}

export function unmaskBreakTokens(md: string): string {
  return md.replace(BREAK_TOKEN_RE, '<br>');
}
```

- [ ] **Step 4: 테스트 실행 — PASS 확인**

Run: `cd frontend && npx vitest run src/markdown/__tests__/tableLineBreak.test.ts`
Expected: `maskTableBreaks` 3개 + `unmaskBreakTokens` 3개 PASS.

- [ ] **Step 5: 커밋**

```bash
cd /Users/user/src/workspace_markora/markora
git add frontend/src/markdown/tableLineBreak.ts frontend/src/markdown/__tests__/tableLineBreak.test.ts
git commit -m "feat: 테이블 셀 <br> 문자열 마스킹(maskTableBreaks/unmaskBreakTokens)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 개행 트리 변환 (`breakTokensToNewlines` / `newlinesToBreakTokens`)

블록트리 계층: 셀 인라인 텍스트 노드의 토큰 ↔ `\n`. 텍스트 노드 내 문자열 치환이라 노드 분리는 불필요하다.

**Files:**
- Modify: `frontend/src/markdown/tableLineBreak.ts` (함수 2개 추가)
- Modify: `frontend/src/markdown/__tests__/tableLineBreak.test.ts` (테스트 추가)

- [ ] **Step 1: 실패하는 테스트 추가**

`frontend/src/markdown/__tests__/tableLineBreak.test.ts` 하단에 append:

```ts
import { breakTokensToNewlines, newlinesToBreakTokens } from '../tableLineBreak';

describe('breakTokensToNewlines', () => {
  it('텍스트 노드의 토큰을 개행으로 (스타일 보존)', () => {
    const nodes = [{ type: 'text', text: 'l1.MKRABR.l2', styles: { bold: true } }];
    expect(breakTokensToNewlines(nodes as any)).toEqual([
      { type: 'text', text: 'l1\nl2', styles: { bold: true } },
    ]);
  });
  it('연속 토큰 → 연속 개행', () => {
    const nodes = [{ type: 'text', text: 'a.MKRABR..MKRABR.b', styles: {} }];
    expect(breakTokensToNewlines(nodes as any)).toEqual([
      { type: 'text', text: 'a\n\nb', styles: {} },
    ]);
  });
  it('비-텍스트 노드(inlineImage)는 그대로 통과', () => {
    const nodes = [{ type: 'inlineImage', props: { url: 'x', alt: '', title: '' } }];
    expect(breakTokensToNewlines(nodes as any)).toEqual(nodes);
  });
});

describe('newlinesToBreakTokens', () => {
  it('개행을 토큰으로', () => {
    const nodes = [{ type: 'text', text: 'l1\nl2', styles: {} }];
    expect(newlinesToBreakTokens(nodes as any)).toEqual([
      { type: 'text', text: 'l1.MKRABR.l2', styles: {} },
    ]);
  });
  it('대칭성: break→newline→break 왕복 동일', () => {
    const start = [{ type: 'text', text: 'a.MKRABR.b.MKRABR.c', styles: {} }];
    const round = newlinesToBreakTokens(breakTokensToNewlines(start as any));
    expect(round).toEqual(start);
  });
});
```

- [ ] **Step 2: 테스트 실행 — FAIL 확인**

Run: `cd frontend && npx vitest run src/markdown/__tests__/tableLineBreak.test.ts`
Expected: FAIL — `breakTokensToNewlines`/`newlinesToBreakTokens` 미정의(import 에러).

- [ ] **Step 3: `tableLineBreak.ts`에 트리 변환 함수 추가**

`frontend/src/markdown/tableLineBreak.ts` 하단에 append:

```ts
type InlineNode =
  | { type: 'text'; text: string; styles: Record<string, any> }
  | { type: string; [k: string]: any };

// 셀 인라인 배열의 텍스트 노드에서 토큰을 \n 으로 치환. 비-텍스트 노드는 통과.
export function breakTokensToNewlines(nodes: InlineNode[]): InlineNode[] {
  return nodes.map((n) => {
    if ((n as any).type === 'text' && typeof (n as any).text === 'string') {
      return { ...(n as any), text: ((n as any).text as string).split(BREAK_TOKEN).join('\n') };
    }
    return n;
  });
}

// 역방향: 텍스트 노드의 \n 을 토큰으로 치환.
export function newlinesToBreakTokens(nodes: InlineNode[]): InlineNode[] {
  return nodes.map((n) => {
    if ((n as any).type === 'text' && typeof (n as any).text === 'string') {
      return { ...(n as any), text: ((n as any).text as string).split('\n').join(BREAK_TOKEN) };
    }
    return n;
  });
}
```

- [ ] **Step 4: 테스트 실행 — PASS 확인**

Run: `cd frontend && npx vitest run src/markdown/__tests__/tableLineBreak.test.ts`
Expected: 기존 6개 + 신규 5개 = 11개 PASS.

- [ ] **Step 5: 커밋**

```bash
cd /Users/user/src/workspace_markora/markora
git add frontend/src/markdown/tableLineBreak.ts frontend/src/markdown/__tests__/tableLineBreak.test.ts
git commit -m "feat: 테이블 셀 개행 트리 변환(breakTokensToNewlines/newlinesToBreakTokens)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `customParse.ts`에 개행 변환 합성

기존 셀 이미지 변환(`mapTableCells`)에 개행 변환을 합성한다. 이미지 토큰(`.MKRAIMG.<b64>.`)과 개행 토큰(`.MKRABR.`)은 서로 겹치지 않아(base64url에 `.` 없음) 순서 무관하나, 로드는 개행 먼저·저장은 이미지 먼저로 명시한다.

**Files:**
- Modify: `frontend/src/markdown/customParse.ts:3` (import), `:54` (preSerialize), `:72` (postParse)
- Create: `frontend/src/markdown/__tests__/tableLineBreak-customParse.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/markdown/__tests__/tableLineBreak-customParse.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { postParse, preSerialize } from '../customParse';

const tableBlock = (cellText: string) => ({
  type: 'table',
  content: {
    type: 'tableContent',
    rows: [{
      cells: [{ type: 'tableCell', content: [{ type: 'text', text: cellText, styles: {} }], props: {} }],
    }],
  },
});

const cellText = (block: any): string =>
  block.content.rows[0].cells[0].content[0].text;

describe('customParse 셀 개행 합성', () => {
  it('postParse: 셀 토큰을 개행으로 복원', () => {
    const out = postParse([tableBlock('l1.MKRABR.l2')] as any);
    expect(cellText(out[0])).toBe('l1\nl2');
  });

  it('preSerialize: 셀 개행을 토큰으로 되돌림', () => {
    const out = preSerialize([tableBlock('l1\nl2')] as any);
    expect(cellText(out[0])).toBe('l1.MKRABR.l2');
  });

  it('라운드트립: postParse → preSerialize 왕복 동일', () => {
    const start = [tableBlock('a.MKRABR.b')];
    const round = preSerialize(postParse(start as any) as any);
    expect(cellText(round[0])).toBe('a.MKRABR.b');
  });
});
```

- [ ] **Step 2: 테스트 실행 — FAIL 확인**

Run: `cd frontend && npx vitest run src/markdown/__tests__/tableLineBreak-customParse.test.ts`
Expected: FAIL — `postParse`가 셀 토큰을 그대로 두어 `l1.MKRABR.l2` 반환(개행 변환 미적용).

- [ ] **Step 3: `customParse.ts` 수정**

`customParse.ts:3` 아래에 import 추가:

```ts
import { breakTokensToNewlines, newlinesToBreakTokens } from './tableLineBreak';
```

`customParse.ts:54`의 preSerialize 테이블 분기 교체:

```ts
    if (isTableBlock(b)) {
      return mapTableCells(b, (nodes) => newlinesToBreakTokens(inlineToTokenText(nodes)));
    }
```

`customParse.ts:72`의 postParse 테이블 분기 교체:

```ts
    if (isTableBlock(b)) {
      return mapTableCells(b, (nodes) => tokenTextToInline(breakTokensToNewlines(nodes)));
    }
```

- [ ] **Step 4: 테스트 실행 — PASS 확인**

Run: `cd frontend && npx vitest run src/markdown/__tests__/tableLineBreak-customParse.test.ts`
Expected: 3개 PASS.

- [ ] **Step 5: 전체 테스트 — 회귀 없음 확인**

Run: `cd frontend && npx vitest run`
Expected: 기존 셀 이미지 테스트 포함 전부 PASS.

- [ ] **Step 6: 커밋**

```bash
cd /Users/user/src/workspace_markora/markora
git add frontend/src/markdown/customParse.ts frontend/src/markdown/__tests__/tableLineBreak-customParse.test.ts
git commit -m "feat: customParse 셀 변환에 개행 토큰 처리 합성

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `Editor.tsx` 파이프라인 연결 + 전체 라운드트립 통합 테스트

로드/저장 경로에 개행 마스킹을 감싼다. 순서 불변식: 로드는 이미지 마스킹 → 개행 마스킹, 저장은 개행 언마스킹 → 이미지 언마스킹(역순). 실제 `BlockNoteEditor` 로 전체 파이프라인을 검증한다.

**Files:**
- Modify: `frontend/src/editor/Editor.tsx:8` (import), `:65` (초기 로드), `:180` (리로드), `:94-96` (저장)
- Create: `frontend/src/markdown/__tests__/tableLineBreak-roundtrip.test.ts`

- [ ] **Step 1: 실패하는 통합 테스트 작성 (Editor.tsx 파이프라인 재현)**

`frontend/src/markdown/__tests__/tableLineBreak-roundtrip.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BlockNoteEditor } from '@blocknote/core';
import { schema } from '../../editor/schema';
import { parseMarkdownWithBlockquotes, serializeBlocksWithBlockquotes } from '../blockquote';
import { postParse, preSerialize } from '../customParse';
import { maskTableImages, unmaskTableImages } from '../tableImage';
import { maskTableBreaks, unmaskBreakTokens } from '../tableLineBreak';

// Editor.tsx 의 로드/저장 파이프라인을 그대로 재현한다(마스킹 순서 포함).
async function load(editor: any, md: string) {
  const blocks = await parseMarkdownWithBlockquotes(editor, maskTableBreaks(maskTableImages(md)));
  return postParse(blocks as any);
}
async function save(editor: any): Promise<string> {
  return unmaskTableImages(unmaskBreakTokens(
    await serializeBlocksWithBlockquotes(editor, preSerialize(editor.document as any) as any),
  ));
}

describe('테이블 셀 개행 전체 라운드트립', () => {
  it('셀 <br> 가 유실 없이 라운드트립된다', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const md = ['| A | B |', '| --- | --- |', '| line1<br>line2 | plain |'].join('\n');
    const blocks: any = await load(editor, md);
    editor.replaceBlocks(editor.document, blocks);
    const out = await save(editor);
    expect(out).toContain('line1<br>line2');
    expect(out).not.toContain('MKRABR');
  });

  it('<br/> 와 <BR /> 는 <br> 로 정규화된다', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const md = ['| A |', '| --- |', '| a<br/>b |', '| c<BR />d |'].join('\n');
    const blocks: any = await load(editor, md);
    editor.replaceBlocks(editor.document, blocks);
    const out = await save(editor);
    expect(out).toContain('a<br>b');
    expect(out).toContain('c<br>d');
    expect(out).not.toMatch(/<br\/|<BR/);
  });

  it('이미지+개행 혼합 셀도 둘 다 보존된다', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const md = ['| H |', '| --- |', '| ![a](docs/x.png)<br>caption |'].join('\n');
    const blocks: any = await load(editor, md);
    editor.replaceBlocks(editor.document, blocks);
    const out = await save(editor);
    expect(out).toContain('![a](docs/x.png)');
    expect(out).toContain('<br>caption');
    expect(out).not.toContain('MKRABR');
    expect(out).not.toContain('MKRAIMG');
  });

  it('테이블 밖 <br> 는 이 기능의 영향을 받지 않는다', async () => {
    const editor = BlockNoteEditor.create({ schema });
    // 테이블 밖 <br> 는 마스킹되지 않으므로 BlockNote 기존 동작대로 처리된다(범위 밖).
    // 여기서는 셀 <br> 만 라운드트립되고 그 외는 파이프라인이 깨지지 않음을 확인한다.
    const md = ['일반 문단', '', '| H |', '| --- |', '| x<br>y |'].join('\n');
    const blocks: any = await load(editor, md);
    editor.replaceBlocks(editor.document, blocks);
    const out = await save(editor);
    expect(out).toContain('x<br>y');
    expect(out).toContain('일반 문단');
  });
});
```

- [ ] **Step 2: 테스트 실행 — 셀 <br> 케이스 FAIL 확인**

Run: `cd frontend && npx vitest run src/markdown/__tests__/tableLineBreak-roundtrip.test.ts`
Expected: PASS (import한 mask/unmask 함수는 Task 2~4에서 이미 구현됨).

> 참고: 이 테스트는 Editor.tsx 가 아니라 파이프라인 함수를 직접 조합하므로 Task 2~4 완료 상태에서 이미 통과한다. Editor.tsx 수정(Step 3)은 이 통과한 파이프라인을 실제 컴포넌트에 연결하는 작업이다. 만약 이 테스트가 FAIL 이면 Task 2~4 를 먼저 점검한다.

- [ ] **Step 3: `Editor.tsx` 수정 — 로드/저장에 개행 마스킹 연결**

`Editor.tsx:8` 아래에 import 추가:

```ts
import { maskTableBreaks, unmaskBreakTokens } from '../markdown/tableLineBreak';
```

`Editor.tsx:65` (초기 로드) 교체:

```ts
        const blocks = await parseMarkdownWithBlockquotes(editor, maskTableBreaks(maskTableImages(body)));
```

`Editor.tsx:180` (리로드) 교체:

```ts
        const blocks = await parseMarkdownWithBlockquotes(editor, maskTableBreaks(maskTableImages(body)));
```

`Editor.tsx:94-96` (저장) 교체:

```ts
        const body = unmaskTableImages(unmaskBreakTokens(
          await serializeBlocksWithBlockquotes(editor, preSerialize(editor.document as any) as any),
        ));
```

- [ ] **Step 4: 타입 체크 + 전체 테스트**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: 타입 에러 없음, 전체 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
cd /Users/user/src/workspace_markora/markora
git add frontend/src/editor/Editor.tsx frontend/src/markdown/__tests__/tableLineBreak-roundtrip.test.ts
git commit -m "feat: Editor 로드/저장 파이프라인에 테이블 셀 개행 마스킹 연결

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: 수동 검증 (runIde 샌드박스)

에디터 내 실제 사용자 입력 동작을 실측한다. BlockNote 기본 키맵이 셀 안 Shift+Enter 를 hard break(`\n`)로 만드는지는 코드가 아니라 런타임에서만 확인 가능하다.

**Files:** (코드 변경 없음 — 검증 후 결과를 스펙 문서에 반영)

- [ ] **Step 1: 프론트엔드 번들 후 샌드박스 IDE 실행**

Run: `cd /Users/user/src/workspace_markora/markora && ./gradlew runIde`
(JDK 21 필요 — `markora-build-jdk` 메모 참조)

- [ ] **Step 2: 개행이 있는 테이블 `.md` 파일을 열어 검증**

검증 항목:
1. `| line1<br>line2 |` 가 포함된 기존 `.md` 를 열면 셀 안이 두 줄로 렌더되는가.
2. 셀 안에서 Shift+Enter 로 줄바꿈을 새로 입력할 수 있는가.
3. 편집 후 자동 저장된 파일을 터미널에서 열어 `<br>` 로 저장됐는지 확인(`<br/>` 로 저장한 파일도 `<br>` 로 정규화되는지).
4. 셀 이미지 + 개행 혼합 셀이 깨지지 않는가.

- [ ] **Step 3: 결과 기록**

Shift+Enter 가 hard break 를 만들지 않는다면(BlockNote 키맵 미지원), 스펙의 "미결 사항"에 추가하고 별도 키핸들러 작업을 후속 이슈로 분리한다. 정상 동작하면 스펙 상태를 "구현 완료"로 갱신.

---

## Task 7: 마무리 — 스펙 상태 갱신 및 PR

- [ ] **Step 1: 스펙 상태 갱신**

`docs/superpowers/specs/2026-07-14-table-cell-linebreak-design.md`의 `- 상태: 설계 승인 대기` 를 `- 상태: 구현 완료` 로 변경(Task 6 수동 검증 결과 반영).

- [ ] **Step 2: 커밋 후 푸시**

```bash
cd /Users/user/src/workspace_markora/markora
git add docs/superpowers/specs/2026-07-14-table-cell-linebreak-design.md
git commit -m "docs: 테이블 셀 개행 스펙 상태 구현 완료로 갱신

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push -u origin feature/table-cell-linebreak
```

- [ ] **Step 3: PR 생성 (gh CLI + HEREDOC)**

```bash
gh pr create --title "feat: 테이블 셀 개행(<br>) 무손실 라운드트립" --body "$(cat <<'EOF'
## Summary
- 테이블 셀 안 개행(`| line1<br>line2 |`)이 로드/편집/저장에서 유실되던 문제 해결
- `tableImage.ts` 토큰 마스킹 패턴 답습: `<br>` → `.MKRABR.` 토큰 → `\n` 복원, 저장은 역방향
- 테이블 라인 스캐너를 `tableScan.ts` 공용 유틸로 추출(이미지/개행 공유)
- 저장 시 `<br>` 로 정규화. 범위: 테이블 셀 한정

## Test plan
- [ ] `npx vitest run` 전체 통과 (단위 + 통합)
- [ ] runIde 샌드박스에서 셀 개행 렌더/입력/저장 수동 검증
EOF
)"
```

---

## Self-Review 결과

**스펙 커버리지:** 스펙의 모든 요구사항이 태스크로 매핑됨 — 문자열 마스킹(Task 2), 트리 변환(Task 3), customParse 합성(Task 4), Editor 연결 + 순서 불변식(Task 5), `tableScan` 추출 리팩터링(Task 1), 수동 검증(Task 6), 통합 테스트(Task 5). `<br>` 정규화·이미지+개행 혼합·CRLF·코드펜스 제외 모두 테스트로 커버.

**Placeholder 스캔:** 없음. 모든 코드 스텝에 완전한 코드/명령/기대 출력 포함.

**타입 일관성:** 함수명이 전 태스크에서 일관됨 — `mapTableLines`, `maskTableBreaks`, `unmaskBreakTokens`, `breakTokensToNewlines`, `newlinesToBreakTokens`. `customParse.ts`(Task 4)와 통합 테스트(Task 5)가 동일 시그니처 사용. 토큰 문자열 `.MKRABR.` 전 태스크 일치.
