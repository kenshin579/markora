# Strikethrough 단일 틸드 오탐 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단일 틸드 `~range~`가 strikethrough로 잘못 렌더링되는 문제를, GFM 표준(`~~text~~`만 strike)으로 고치고 round-trip을 보존한다.

**Architecture:** BlockNote 내부(remark-gfm `singleTilde:true` 기본값)를 수정하지 않고, markora의 마크다운 래퍼 레이어에서 문자열 전처리/후처리로 해결한다. 파싱 전 고립된 단일 틸드를 `\~`로 이스케이프하고, 직렬화 후 `\~`를 `~`로 복원한다. 두 변환 모두 코드펜스·인라인 코드스팬을 보존(code-aware)한다.

**Tech Stack:** TypeScript, Vitest, `@blocknote/core 0.49`, frontend는 Vite 번들 → `src/main/resources/blocknote/dist`로 빌드.

---

## File Structure

- **Create:** `frontend/src/markdown/strikethrough.ts` — `escapeSingleTildes` / `unescapeTildes` 순수 함수. 단일 책임: 틸드 이스케이프 변환.
- **Create:** `frontend/src/markdown/__tests__/strikethrough.test.ts` — 변환 함수 단위 테스트.
- **Modify:** `frontend/src/markdown/blockquote.ts` — 파싱(`parseMarkdownWithBlockquotes`)·직렬화(`serializeBlocksWithBlockquotes`)에 두 함수를 연결.
- **Modify:** `frontend/src/markdown/__tests__/integration.test.ts` — 실제 에디터 round-trip 케이스 추가.

---

## Task 1: 틸드 변환 모듈 (`strikethrough.ts`)

**Files:**
- Create: `frontend/src/markdown/strikethrough.ts`
- Test: `frontend/src/markdown/__tests__/strikethrough.test.ts`

- [ ] **Step 1: 실패하는 단위 테스트 작성**

Create `frontend/src/markdown/__tests__/strikethrough.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { escapeSingleTildes, unescapeTildes } from '../strikethrough';

describe('escapeSingleTildes', () => {
  it('고립된 단일 틸드를 \\~ 로 이스케이프', () => {
    expect(escapeSingleTildes('속도(0.4~1.0)')).toBe('속도(0.4\\~1.0)');
  });

  it('한 줄에 여러 단일 틸드를 모두 이스케이프', () => {
    expect(escapeSingleTildes('시간(30~300s), 민감도(0~2)'))
      .toBe('시간(30\\~300s), 민감도(0\\~2)');
  });

  it('~~strike~~ (이중 틸드)는 보존', () => {
    expect(escapeSingleTildes('진짜 ~~취소선~~ 입니다'))
      .toBe('진짜 ~~취소선~~ 입니다');
  });

  it('~~strike~~ 내부의 단일 틸드만 이스케이프', () => {
    expect(escapeSingleTildes('~~a~b~~')).toBe('~~a\\~b~~');
  });

  it('~~~ 런(길이 3)은 보존', () => {
    expect(escapeSingleTildes('x ~~~ y')).toBe('x ~~~ y');
  });

  it('이미 이스케이프된 \\~ 는 이중 이스케이프하지 않음', () => {
    expect(escapeSingleTildes('a\\~b')).toBe('a\\~b');
  });

  it('인라인 코드스팬 내부 틸드는 변형하지 않음', () => {
    expect(escapeSingleTildes('값 `a~b` 끝')).toBe('값 `a~b` 끝');
  });

  it('코드스팬 밖 틸드는 이스케이프, 안쪽은 보존', () => {
    expect(escapeSingleTildes('x~y `a~b` z~w'))
      .toBe('x\\~y `a~b` z\\~w');
  });

  it('펜스 코드블록 내부는 변형하지 않음', () => {
    const md = '```\nlet a~b = 1;\n```';
    expect(escapeSingleTildes(md)).toBe(md);
  });

  it('펜스 밖 단락의 틸드는 이스케이프', () => {
    const input = '범위 0~9\n\n```\na~b\n```';
    const expected = '범위 0\\~9\n\n```\na~b\n```';
    expect(escapeSingleTildes(input)).toBe(expected);
  });
});

describe('unescapeTildes', () => {
  it('\\~ 를 ~ 로 복원', () => {
    expect(unescapeTildes('속도(0.4\\~1.0)')).toBe('속도(0.4~1.0)');
  });

  it('~~strike~~ 는 영향 없음', () => {
    expect(unescapeTildes('진짜 ~~취소선~~ 입니다'))
      .toBe('진짜 ~~취소선~~ 입니다');
  });

  it('펜스 코드블록 내부의 \\~ 는 복원하지 않음 (verbatim 보존)', () => {
    const md = '```\nliteral \\~ here\n```';
    expect(unescapeTildes(md)).toBe(md);
  });

  it('인라인 코드스팬 내부의 \\~ 는 복원하지 않음', () => {
    expect(unescapeTildes('값 `\\~` 끝')).toBe('값 `\\~` 끝');
  });
});

describe('escape → unescape round-trip', () => {
  it('단일 틸드 텍스트는 원문으로 복원', () => {
    const src = '속도(0.4~1.0), 시간(30~300s)';
    expect(unescapeTildes(escapeSingleTildes(src))).toBe(src);
  });

  it('~~strike~~ 도 원문 그대로', () => {
    const src = '진짜 ~~취소선~~ 과 범위 0~9';
    expect(unescapeTildes(escapeSingleTildes(src)))
      .toBe('진짜 ~~취소선~~ 과 범위 0~9');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd frontend && npx vitest run src/markdown/__tests__/strikethrough.test.ts`
Expected: FAIL — `Failed to resolve import "../strikethrough"` (모듈 없음).

- [ ] **Step 3: 모듈 구현**

Create `frontend/src/markdown/strikethrough.ts`:

```typescript
// GFM 표준: strikethrough 는 ~~text~~ (이중 틸드)만 인정한다.
// 그러나 BlockNote 내부 remark-gfm 은 singleTilde 기본값이 true 라서 단일 ~ 도
// strikethrough 로 오인한다(예: 범위 표현 "0.4~1.0"). 옵션을 외부로 노출하지 않으므로
// 파싱 전 고립된 단일 틸드를 \~ 로 이스케이프하고, 직렬화 후 다시 ~ 로 복원한다.
// 두 변환 모두 코드펜스 / 인라인 코드스팬은 verbatim 으로 보존한다.

// blockquote.ts 와 동일한 펜스 판정(``` 또는 ~~~ 로 시작하는 줄).
const FENCE_RE = /^ {0,3}(```|~~~)/;

// "고립된 단일 틸드": 앞에 \(이스케이프) 도 ~ 도 없고, 뒤에 ~ 도 없는 ~ 한 개.
// → ~~ 이상의 런, 이미 이스케이프된 \~ 는 매칭되지 않는다.
const SINGLE_TILDE_RE = /(?<!\\)(?<!~)~(?!~)/g;

// 한 줄을 인라인 코드스팬(백틱 런으로 구분) 기준으로 나눠, 코드스팬이 아닌
// 텍스트 구간에만 fn 을 적용한다. 닫는 백틱 런이 없으면 백틱을 리터럴로 취급한다.
function applyOutsideInlineCode(line: string, fn: (text: string) => string): string {
  const parts = line.split(/(`+)/); // [text, backticks, text, backticks, ...]
  let out = '';
  let i = 0;
  while (i < parts.length) {
    if (i % 2 === 0) {
      out += fn(parts[i]); // 텍스트 구간
      i += 1;
      continue;
    }
    const open = parts[i]; // 백틱 런
    let j = i + 2;
    while (j < parts.length && parts[j] !== open) j += 2; // 동일 길이 닫는 런 탐색
    if (j < parts.length) {
      out += parts.slice(i, j + 1).join(''); // 코드스팬 전체 verbatim
      i = j + 1;
    } else {
      out += open; // 닫는 런 없음 → 백틱 리터럴, 다음 구간 계속 처리
      i += 1;
    }
  }
  return out;
}

// 펜스 블록 밖의 텍스트 구간에만 fn 을 적용하는 공통 순회.
function transformOutsideCode(md: string, fn: (text: string) => string): string {
  let inFence = false;
  return md
    .split('\n')
    .map(line => {
      if (FENCE_RE.test(line)) { inFence = !inFence; return line; }
      if (inFence) return line;
      return applyOutsideInlineCode(line, fn);
    })
    .join('\n');
}

// 파싱 전: 고립된 단일 틸드를 \~ 로 이스케이프한다.
export function escapeSingleTildes(md: string): string {
  return transformOutsideCode(md, t => t.replace(SINGLE_TILDE_RE, '\\~'));
}

// 직렬화 후: \~ 를 다시 리터럴 ~ 로 복원한다(파일에 \~ 오염 방지).
export function unescapeTildes(md: string): string {
  return transformOutsideCode(md, t => t.replace(/\\~/g, '~'));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/markdown/__tests__/strikethrough.test.ts`
Expected: PASS (모든 테스트 green).

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/markdown/strikethrough.ts frontend/src/markdown/__tests__/strikethrough.test.ts
git commit -m "feat: add code-aware single-tilde escape/unescape helpers"
```

---

## Task 2: 래퍼 연결 + round-trip 통합 테스트

**Files:**
- Modify: `frontend/src/markdown/blockquote.ts`
- Test: `frontend/src/markdown/__tests__/integration.test.ts`

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`frontend/src/markdown/__tests__/integration.test.ts` 의 import 블록을 수정한다. 기존:

```typescript
import { preSerialize, postParse } from '../customParse';
```

를 다음으로 교체:

```typescript
import { preSerialize, postParse } from '../customParse';
import { parseMarkdownWithBlockquotes, serializeBlocksWithBlockquotes } from '../blockquote';
```

그리고 파일 맨 끝에 다음 describe 블록을 추가한다(실제 저장/로드 파이프라인과 동일하게 blockquote 래퍼를 경유):

```typescript
// 실제 Editor.tsx 의 로드/저장 파이프라인과 동일한 경로로 왕복한다.
async function roundtripViaWrapper(md: string): Promise<string> {
  const editor = BlockNoteEditor.create({ schema });
  const blocks = await parseMarkdownWithBlockquotes(editor, md);
  editor.replaceBlocks(editor.document, postParse(blocks as any) as any);
  const out = await serializeBlocksWithBlockquotes(
    editor,
    preSerialize(editor.document as any) as any,
  );
  return out.trim();
}

describe('strikethrough: 단일 틸드 round-trip', () => {
  it('범위 표현의 단일 틸드는 strike 가 아니라 리터럴로 보존', async () => {
    const out = await roundtripViaWrapper('속도(0.4~1.0), 시간(30~300s)\n');
    expect(out).toContain('0.4~1.0');
    expect(out).toContain('30~300s');
    expect(out).not.toContain('~~'); // strike 마크업으로 변질되지 않음
    expect(out).not.toContain('\\~'); // 이스케이프가 파일로 새어나가지 않음
  });

  it('~~strike~~ 취소선은 정상 보존', async () => {
    const out = await roundtripViaWrapper('진짜 ~~취소선~~ 입니다\n');
    expect(out).toContain('~~취소선~~');
  });

  it('표 셀 안의 단일 틸드도 리터럴 보존', async () => {
    const md = [
      '| 항목 | 범위 |',
      '| --- | --- |',
      '| 속도 | 0.4~1.0 |',
      '',
    ].join('\n');
    const out = await roundtripViaWrapper(md);
    expect(out).toContain('0.4~1.0');
    expect(out).not.toContain('\\~');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd frontend && npx vitest run src/markdown/__tests__/integration.test.ts`
Expected: FAIL — `0.4~1.0` 케이스에서 출력이 `0.4` 와 `1.0` 사이를 strike(`~~...~~`)로 직렬화하거나 `\~` 가 남아 단언 실패.

- [ ] **Step 3: blockquote.ts 에 변환 연결**

`frontend/src/markdown/blockquote.ts` 상단 import 에 추가:

```typescript
import { escapeSingleTildes, unescapeTildes } from './strikethrough';
```

`parseMarkdownWithBlockquotes` 안에서 `normalized` 정의 줄을 다음과 같이 수정한다. 기존:

```typescript
  const normalized = body.replace(/\r\n?/g, '\n');
```

수정 후 (정규화 직후 단일 틸드 이스케이프, splitRuns 이전 전체 1회):

```typescript
  // CRLF/CR → LF 정규화 후, 단일 틸드를 이스케이프해 remark-gfm 의 singleTilde 오탐을 막는다.
  const normalized = escapeSingleTildes(body.replace(/\r\n?/g, '\n'));
```

`serializeBlocksWithBlockquotes` 의 마지막 `return` 을 수정한다. 기존:

```typescript
  return parts.join('\n\n') + '\n';
```

수정 후 (직렬화 결과 전체에서 \~ 복원):

```typescript
  return unescapeTildes(parts.join('\n\n') + '\n');
```

- [ ] **Step 4: 통합 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/markdown/__tests__/integration.test.ts`
Expected: PASS.

- [ ] **Step 5: 전체 프론트엔드 테스트 통과 확인 (회귀 없음)**

Run: `cd frontend && npm test`
Expected: 모든 테스트 PASS (기존 roundtrip / blockquote / inline-math 회귀 없음).

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/markdown/blockquote.ts frontend/src/markdown/__tests__/integration.test.ts
git commit -m "fix: treat single tilde as literal (GFM strikethrough requires ~~)"
```

---

## Task 3: 번들 재빌드 + 수동 검증

**Files:** (소스 변경 없음 — 빌드/검증만)

- [ ] **Step 1: 프론트엔드 번들 빌드 후 IDE 빌드**

Run: `./gradlew build`
Expected: BUILD SUCCESSFUL. (Gradle 이 frontend 를 빌드해 `src/main/resources/blocknote/dist` 로 산출)

참고: frontend 가 Gradle 빌드에 연결돼 있지 않다면 먼저 `cd frontend && npm run build` 로 `dist` 를 생성한 뒤 `./gradlew build` 를 실행한다.

- [ ] **Step 2: 샌드박스에서 육안 검증**

Run: `./gradlew runIde`
검증 절차:
1. 다음 내용의 마크다운 파일을 markora 에디터로 연다:
   ```
   속도(0.4~1.0), 시간(30~300s)

   진짜 ~~취소선~~ 입니다

   | 항목 | 범위 |
   | --- | --- |
   | 속도 | 0.4~1.0 |
   ```
2. 기대: `0.4~1.0`, `30~300s` 가 **취소선 없이** 정상 텍스트로 보인다. `~~취소선~~` 만 취소선으로 보인다.
3. 파일을 저장(편집 후 또는 강제 저장)하고, 디스크의 원본 마크다운에 `\~` 가 새로 생기지 않았는지 확인한다.

- [ ] **Step 3: 검증 결과 기록**

육안 검증 통과 시 별도 커밋 불필요(소스 변경 없음). 문제가 있으면 Task 1/2 로 돌아가 수정한다.
