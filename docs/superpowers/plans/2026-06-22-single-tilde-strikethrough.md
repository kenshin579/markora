# 단일 틸드 취소선 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 범위 표기(`0.4~1.0` 등)의 단일 틸드가 취소선으로 오작동하지 않도록, 로드 시 단일 틸드를 이스케이프하고 저장 시 되돌린다. 취소선은 `~~이중 틸드~~`만 처리한다.

**Architecture:** BlockNote의 `tryParseMarkdownToBlocks`는 `remark-gfm`의 `singleTilde` 옵션을 노출하지 않으므로, 파싱 직전 문자열에서 단일 `~`를 `\~`로 이스케이프한다. 코드 펜스/인라인 코드 영역은 보호한다. 저장 시 `blocksToMarkdownLossy` 출력에서 `\~`를 `~`로 되돌려 파일을 깨끗하게 유지한다(코드 영역 보호 동일 적용).

**Tech Stack:** TypeScript, BlockNote 0.49, Vitest

---

## File Structure

- **Modify:** `frontend/src/markdown/customParse.ts` — `transformOutsideCode` 헬퍼와 `escapeSingleTildes`/`unescapeSingleTildes` 함수 추가
- **Modify:** `frontend/src/editor/Editor.tsx` — 로드 2곳에 escape, 저장 1곳에 unescape 적용
- **Create/Modify:** `frontend/src/markdown/__tests__/tilde.test.ts` — escape/unescape 단위 테스트
- **Modify:** `frontend/src/markdown/__tests__/integration.test.ts` — 표 라운드트립(취소선 미발생 + 파일 정결) 테스트

---

## Task 1: `transformOutsideCode` + `escapeSingleTildes`

**Files:**
- Modify: `frontend/src/markdown/customParse.ts` (파일 끝에 추가)
- Test: `frontend/src/markdown/__tests__/tilde.test.ts` (신규)

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/markdown/__tests__/tilde.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest';
import { escapeSingleTildes } from '../customParse';

describe('escapeSingleTildes', () => {
  it('단일 틸드(범위 표기)를 이스케이프', () => {
    expect(escapeSingleTildes('p2p 속도(0.4~1.0)')).toBe('p2p 속도(0.4\\~1.0)');
  });

  it('이중 틸드(취소선)는 보존', () => {
    expect(escapeSingleTildes('~~취소선~~')).toBe('~~취소선~~');
  });

  it('이미 이스케이프된 \\~ 는 이중 이스케이프 안 함', () => {
    expect(escapeSingleTildes('a \\~ b')).toBe('a \\~ b');
  });

  it('``` 펜스 내부는 변환하지 않음', () => {
    const md = '```\n0.4~1.0\n```';
    expect(escapeSingleTildes(md)).toBe(md);
  });

  it('~~~ 펜스(마커 + 내부)는 변환하지 않음', () => {
    const md = '~~~\n0.4~1.0\n~~~';
    expect(escapeSingleTildes(md)).toBe(md);
  });

  it('인라인 코드 스팬 내부는 변환하지 않음', () => {
    expect(escapeSingleTildes('값 `0.4~1.0` 끝')).toBe('값 `0.4~1.0` 끝');
  });

  it('표 행의 여러 범위를 모두 이스케이프', () => {
    const line = '| `NAVIGATION` | 9 | p2p 속도(0.4~1.0), 대기(30~300s) |';
    const out = escapeSingleTildes(line);
    expect(out).toContain('0.4\\~1.0');
    expect(out).toContain('30\\~300s');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/markdown/__tests__/tilde.test.ts`
Expected: FAIL — `escapeSingleTildes is not a function` (export 없음)

- [ ] **Step 3: 최소 구현 추가**

`frontend/src/markdown/customParse.ts` 파일 끝에 추가:

```ts
// ── 단일 틸드 보호 ───────────────────────────────────────────────
// BlockNote가 쓰는 remark-gfm은 단일 틸드(~...~)도 취소선으로 해석한다.
// 범위 표기(0.4~1.0 등)가 취소선이 되지 않도록 파싱 직전 단일 틸드를 이스케이프하고,
// 저장 시 되돌린다. 코드 펜스/인라인 코드 영역은 보호한다.

// 코드 펜스(``` 또는 ~~~) 바깥 라인의, 인라인 코드 스팬(`...`) 바깥 텍스트에만 fn을 적용한다.
function transformOutsideCode(md: string, fn: (text: string) => string): string {
  const lines = md.split('\n');
  let fence: string | null = null; // 열린 펜스 마커 (예: '```' 또는 '~~~')
  const out: string[] = [];
  for (const line of lines) {
    const m = line.match(/^(\s*)(`{3,}|~{3,})/);
    if (fence) {
      // 펜스 내부: 같은 문자 + 여는 펜스 이상 길이면 닫힘
      if (m && m[2][0] === fence[0] && m[2].length >= fence.length) fence = null;
      out.push(line); // 닫는 펜스 라인 포함, 내부는 변환 안 함
      continue;
    }
    if (m) {
      fence = m[2];
      out.push(line); // 여는 펜스 라인 변환 안 함 (~~~ 마커 보존)
      continue;
    }
    // 인라인 코드 스팬 분리 — 홀수 인덱스가 코드 스팬
    const parts = line.split(/(`+[^`\n]*`+)/);
    out.push(parts.map((p, i) => (i % 2 === 1 ? p : fn(p))).join(''));
  }
  return out.join('\n');
}

export function escapeSingleTildes(md: string): string {
  // (?<!\\): 이미 이스케이프된 \~ 제외, (?<!~)~(?!~): 단일 틸드만 (~~ 보존)
  return transformOutsideCode(md, (t) => t.replace(/(?<!\\)(?<!~)~(?!~)/g, '\\~'));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/markdown/__tests__/tilde.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/markdown/customParse.ts frontend/src/markdown/__tests__/tilde.test.ts
git commit -m "$(cat <<'EOF'
feat(frontend): escapeSingleTildes로 범위 표기 틸드 보호

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `unescapeSingleTildes` (저장 정결화)

**Files:**
- Modify: `frontend/src/markdown/customParse.ts`
- Test: `frontend/src/markdown/__tests__/tilde.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

`frontend/src/markdown/__tests__/tilde.test.ts`의 import 줄을 수정하고 describe 블록 추가:

```ts
import { escapeSingleTildes, unescapeSingleTildes } from '../customParse';
```

```ts
describe('unescapeSingleTildes', () => {
  it('\\~ 를 ~ 로 되돌림', () => {
    expect(unescapeSingleTildes('0.4\\~1.0')).toBe('0.4~1.0');
  });

  it('이중 틸드 취소선 ~~...~~ 는 건드리지 않음', () => {
    expect(unescapeSingleTildes('~~취소선~~')).toBe('~~취소선~~');
  });

  it('\\~ 가 없으면 변화 없음 (안전한 no-op)', () => {
    expect(unescapeSingleTildes('0.4~1.0')).toBe('0.4~1.0');
  });

  it('``` 펜스 내부의 \\~ 는 보존', () => {
    const md = '```\na\\~b\n```';
    expect(unescapeSingleTildes(md)).toBe(md);
  });

  it('escape → unescape 라운드트립 항등', () => {
    const md = 'p2p 속도(0.4~1.0), `code~tilde`, ~~strike~~';
    expect(unescapeSingleTildes(escapeSingleTildes(md))).toBe(md);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/markdown/__tests__/tilde.test.ts`
Expected: FAIL — `unescapeSingleTildes is not a function`

- [ ] **Step 3: 최소 구현 추가**

`frontend/src/markdown/customParse.ts`의 `escapeSingleTildes` 아래에 추가:

```ts
export function unescapeSingleTildes(md: string): string {
  // \~ → ~ (단, \~~ 같은 경우는 건드리지 않음)
  return transformOutsideCode(md, (t) => t.replace(/\\~(?!~)/g, '~'));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/markdown/__tests__/tilde.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/markdown/customParse.ts frontend/src/markdown/__tests__/tilde.test.ts
git commit -m "$(cat <<'EOF'
feat(frontend): unescapeSingleTildes로 저장 시 파일 정결화

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Editor.tsx 로드/저장 경로 연결

**Files:**
- Modify: `frontend/src/editor/Editor.tsx:7` (import), `:40`, `:67`, `:120`

- [ ] **Step 1: import 수정**

`frontend/src/editor/Editor.tsx:7` 변경:

```ts
import { postParse, preSerialize, splitInlineMath, escapeSingleTildes, unescapeSingleTildes } from '../markdown/customParse';
```

- [ ] **Step 2: 초기 로드(L40)에 escape 적용**

`frontend/src/editor/Editor.tsx`의 초기 로드:

```ts
const blocks = await editor.tryParseMarkdownToBlocks(escapeSingleTildes(md));
```

- [ ] **Step 3: focus 재로드(L120)에 escape 적용**

`frontend/src/editor/Editor.tsx`의 focus 핸들러:

```ts
const blocks = await editor.tryParseMarkdownToBlocks(escapeSingleTildes(md));
```

- [ ] **Step 4: 저장(L67)에 unescape 적용**

`frontend/src/editor/Editor.tsx`의 저장 디바운스:

```ts
const md = unescapeSingleTildes(
  await editor.blocksToMarkdownLossy(preSerialize(editor.document as any) as any)
);
```

- [ ] **Step 5: 타입체크/빌드 확인**

Run: `cd frontend && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/editor/Editor.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): Editor 로드 시 틸드 escape, 저장 시 unescape 연결

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 통합 라운드트립 테스트 (취소선 미발생 + 파일 정결)

**Files:**
- Modify: `frontend/src/markdown/__tests__/integration.test.ts`

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`frontend/src/markdown/__tests__/integration.test.ts`의 import와 roundtrip 헬퍼를 Editor.tsx 경로와 동일하게 맞추고 테스트 추가.

import 줄 변경:

```ts
import { preSerialize, postParse, escapeSingleTildes, unescapeSingleTildes } from '../customParse';
```

roundtrip 헬퍼 변경 (escape/unescape 적용 — Editor.tsx와 동일 경로):

```ts
async function roundtrip(md: string): Promise<string> {
  const editor = BlockNoteEditor.create({ schema });
  const blocks = await editor.tryParseMarkdownToBlocks(escapeSingleTildes(md));
  const transformed = postParse(blocks as any);
  editor.replaceBlocks(editor.document, transformed as any);
  const raw = await editor.blocksToMarkdownLossy(preSerialize(editor.document as any) as any);
  return unescapeSingleTildes(raw).trim();
}
```

파일 끝 describe 블록에 추가:

```ts
describe('단일 틸드 취소선 회귀', () => {
  it('범위 표기는 취소선이 되지 않고 ~ 가 보존된다', async () => {
    const out = await roundtrip('속도(0.4~1.0), 대기(30~300s)');
    expect(out).toContain('0.4~1.0');
    expect(out).toContain('30~300s');
    expect(out).not.toContain('~~'); // 취소선 마크업 없음
  });

  it('이중 틸드 취소선은 보존된다', async () => {
    const out = await roundtrip('이건 ~~취소선~~ 입니다');
    expect(out).toContain('~~취소선~~');
  });

  it('표 안의 여러 범위 표기 보존', async () => {
    const md = [
      '| 항목 | 범위 |',
      '| --- | --- |',
      '| 속도 | 0.4~1.0 |',
      '| 대기 | 30~300s |',
    ].join('\n');
    const out = await roundtrip(md);
    expect(out).toContain('0.4~1.0');
    expect(out).toContain('30~300s');
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `cd frontend && npx vitest run src/markdown/__tests__/integration.test.ts`
Expected: PASS (기존 4 + 신규 3 = 7 tests). escape/unescape가 양쪽에 적용되어 범위는 보존되고 취소선은 발생하지 않는다.

- [ ] **Step 3: 전체 테스트 스위트 확인**

Run: `cd frontend && npx vitest run`
Expected: 모든 테스트 PASS (기존 회귀 없음)

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/markdown/__tests__/integration.test.ts
git commit -m "$(cat <<'EOF'
test(frontend): 단일 틸드 취소선 회귀 라운드트립 테스트

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 범위 밖 (YAGNI)

- 4-space 들여쓰기 코드 블록 내부의 틸드 보호 (펜스/인라인 코드만 보호).
- unified/HTML 파이프라인 도입.
- 단일 틸드 취소선을 다시 켜는 설정 옵션.
