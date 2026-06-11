# Blockquote 내부 리스트 지원 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** blockquote 안의 bullet/numbered 리스트(중첩 포함)를 markora에서 파싱·렌더·저장 가능하게 한다.

**Architecture:** BlockNote는 top-level 리스트는 완벽히 처리하지만 `>` 내부에서는 평탄화한다. 새 모듈 `blockquote.ts`가 `>` 껍데기를 벗겨 BlockNote에 재위임(파싱)하고 다시 씌운다(직렬화). markora는 `>` 레이어만 책임지고 리스트 처리는 BlockNote를 재활용한다.

**Tech Stack:** TypeScript, BlockNote 0.49 (`@blocknote/core`), Vitest (happy-dom).

---

## File Structure

- **Create** `frontend/src/markdown/blockquote.ts` — 파싱/직렬화 `>` 껍데기 레이어. 순수 헬퍼(`splitRuns`, `stripQuotePrefix`, `assembleQuote`, `serializeQuote`)와 editor를 받는 두 공개 함수(`parseMarkdownWithBlockquotes`, `serializeBlocksWithBlockquotes`).
- **Create** `frontend/src/markdown/__tests__/blockquote.test.ts` — 단위 + 통합 + 라운드트립 테스트.
- **Modify** `frontend/src/editor/Editor.tsx` — 3곳(L63, L92, L176)에서 BlockNote 직접 호출을 새 함수로 교체, import 추가.

`customParse.ts`(KaTeX/Mermaid inline)는 변경하지 않는다. `postParse`/`preSerialize`와 합성만 한다.

---

## Task 1: 라인 스캐너 `splitRuns` (코드펜스 인지)

**Files:**
- Create: `frontend/src/markdown/blockquote.ts`
- Test: `frontend/src/markdown/__tests__/blockquote.test.ts`

- [ ] **Step 1: Write the failing test**

`frontend/src/markdown/__tests__/blockquote.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { splitRuns } from '../blockquote';

describe('splitRuns', () => {
  it('blockquote 줄과 일반 줄을 연속 구간으로 분리', () => {
    const body = 'para\n> q1\n> q2\nafter';
    expect(splitRuns(body)).toEqual([
      { kind: 'plain', text: 'para' },
      { kind: 'quote', text: '> q1\n> q2' },
      { kind: 'plain', text: 'after' },
    ]);
  });

  it('앞 공백 ≤3까지는 blockquote로 인정', () => {
    expect(splitRuns('   > q')).toEqual([{ kind: 'quote', text: '   > q' }]);
  });

  it('코드펜스 내부의 > 줄은 blockquote로 오인하지 않음', () => {
    const body = '```\n> not a quote\n```';
    expect(splitRuns(body)).toEqual([
      { kind: 'plain', text: '```\n> not a quote\n```' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/markdown/__tests__/blockquote.test.ts`
Expected: FAIL — `splitRuns` is not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

`frontend/src/markdown/blockquote.ts`:

```ts
export type Run = { kind: 'quote' | 'plain'; text: string };

const QUOTE_LINE_RE = /^ {0,3}>/;
const FENCE_RE = /^ {0,3}(```|~~~)/;

// 원문을 줄 단위로 훑어 연속된 blockquote 줄 / 일반 줄 구간(run)으로 나눈다.
// 코드펜스(``` 또는 ~~~) 내부의 '>' 줄은 blockquote로 오인하지 않는다.
export function splitRuns(body: string): Run[] {
  const lines = body.split('\n');
  const runs: Run[] = [];
  let cur: Run | null = null;
  let inFence = false;

  for (const line of lines) {
    if (FENCE_RE.test(line)) inFence = !inFence;
    const kind: Run['kind'] = !inFence && QUOTE_LINE_RE.test(line) ? 'quote' : 'plain';
    if (!cur || cur.kind !== kind) {
      cur = { kind, text: line };
      runs.push(cur);
    } else {
      cur.text += '\n' + line;
    }
  }
  return runs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/markdown/__tests__/blockquote.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/markdown/blockquote.ts frontend/src/markdown/__tests__/blockquote.test.ts
git commit -m "feat(blockquote): add splitRuns line scanner with fence awareness"
```

---

## Task 2: `stripQuotePrefix` — `>` 접두사 1단계 제거

**Files:**
- Modify: `frontend/src/markdown/blockquote.ts`
- Test: `frontend/src/markdown/__tests__/blockquote.test.ts`

- [ ] **Step 1: Write the failing test**

`blockquote.test.ts`에 추가:

```ts
import { splitRuns, stripQuotePrefix } from '../blockquote';

describe('stripQuotePrefix', () => {
  it('> 와 뒤따르는 공백 1개만 제거하고 들여쓰기는 보존', () => {
    const text = '> - a\n>   - a1\n>';
    expect(stripQuotePrefix(text)).toBe('- a\n  - a1\n');
  });

  it('> 없는 줄은 그대로', () => {
    expect(stripQuotePrefix('plain')).toBe('plain');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/markdown/__tests__/blockquote.test.ts`
Expected: FAIL — `stripQuotePrefix` is not exported.

- [ ] **Step 3: Write minimal implementation**

`blockquote.ts`에 추가:

```ts
// 각 줄에서 blockquote 마커 1단계('>' + 공백 1개)만 제거한다.
// 나머지 들여쓰기는 보존되어 중첩 리스트 구조가 유지된다.
// '>' 단독 줄은 빈 줄이 된다. 중첩 blockquote('>>')는 1단계만 벗겨 내부 '>'가 남는다(의도적).
export function stripQuotePrefix(text: string): string {
  return text
    .split('\n')
    .map(line => {
      const m = line.match(/^ {0,3}>( ?)(.*)$/);
      return m ? m[2] : line;
    })
    .join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/markdown/__tests__/blockquote.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/markdown/blockquote.ts frontend/src/markdown/__tests__/blockquote.test.ts
git commit -m "feat(blockquote): add stripQuotePrefix"
```

---

## Task 3: `parseMarkdownWithBlockquotes` — 파싱 + quote 조립

**Files:**
- Modify: `frontend/src/markdown/blockquote.ts`
- Test: `frontend/src/markdown/__tests__/blockquote.test.ts`

조립 규칙: 벗긴 내부를 BlockNote로 재파싱한 뒤, 첫 블록이 `paragraph`면 그 인라인 content를 `quote.content`(선행 단락)로, 나머지를 `quote.children`로. 첫 블록이 paragraph가 아니면 `content=[]`, 전부 children. 빈 plain run(공백/개행뿐)은 건너뛴다(빈 paragraph 주입 방지).

- [ ] **Step 1: Write the failing test**

`blockquote.test.ts`에 추가:

```ts
import { BlockNoteEditor } from '@blocknote/core';
import { schema } from '../../editor/schema';
import {
  splitRuns, stripQuotePrefix, parseMarkdownWithBlockquotes,
} from '../blockquote';

describe('parseMarkdownWithBlockquotes', () => {
  it('> - a / > - b 를 quote + bullet children 로 파싱', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const blocks: any = await parseMarkdownWithBlockquotes(editor, '> - a\n> - b');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('quote');
    expect(blocks[0].children.map((c: any) => c.type))
      .toEqual(['bulletListItem', 'bulletListItem']);
  });

  it('선행 단락 + 리스트: 단락은 content, 리스트는 children', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const md = '> 링크\n>\n> - 범위\n> - 근거';
    const blocks: any = await parseMarkdownWithBlockquotes(editor, md);
    expect(blocks[0].type).toBe('quote');
    expect(blocks[0].content[0].text).toBe('링크');
    expect(blocks[0].children).toHaveLength(2);
    expect(blocks[0].children[0].type).toBe('bulletListItem');
  });

  it('numbered list 지원', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const blocks: any = await parseMarkdownWithBlockquotes(editor, '> 1. a\n> 2. b');
    expect(blocks[0].children[0].type).toBe('numberedListItem');
  });

  it('중첩 리스트 지원', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const blocks: any = await parseMarkdownWithBlockquotes(editor, '> - a\n>   - a1');
    const top = blocks[0].children[0];
    expect(top.type).toBe('bulletListItem');
    expect(top.children[0].type).toBe('bulletListItem');
  });

  it('blockquote 없는 문서는 BlockNote 기본 파싱과 동일하게 동작', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const blocks: any = await parseMarkdownWithBlockquotes(editor, '# T\n\n- a\n- b');
    expect(blocks.map((b: any) => b.type))
      .toEqual(['heading', 'bulletListItem', 'bulletListItem']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/markdown/__tests__/blockquote.test.ts`
Expected: FAIL — `parseMarkdownWithBlockquotes` is not exported.

- [ ] **Step 3: Write minimal implementation**

`blockquote.ts`에 추가:

```ts
import type { BlockNoteEditor } from '@blocknote/core';

type AnyBlock = { type: string; props?: Record<string, any>; content?: any; children?: AnyBlock[] };

const QUOTE_PROPS = { backgroundColor: 'default', textColor: 'default' } as const;

// 벗긴 내부 블록 배열을 단일 quote 블록으로 조립한다.
function assembleQuote(innerBlocks: AnyBlock[]): AnyBlock {
  let content: any[] = [];
  let children: AnyBlock[] = innerBlocks;
  if (innerBlocks.length > 0 && innerBlocks[0].type === 'paragraph') {
    content = (innerBlocks[0].content as any[]) ?? [];
    children = innerBlocks.slice(1);
  }
  return { type: 'quote', props: { ...QUOTE_PROPS }, content, children };
}

// 원문 마크다운을 파싱하되 blockquote 구간은 '>'를 벗겨 BlockNote에 재위임 후 quote로 조립한다.
export async function parseMarkdownWithBlockquotes(
  editor: BlockNoteEditor<any, any, any>,
  body: string,
): Promise<AnyBlock[]> {
  const out: AnyBlock[] = [];
  for (const run of splitRuns(body)) {
    if (run.kind === 'plain') {
      if (run.text.trim() === '') continue; // 빈 분리 run은 빈 paragraph 주입을 피하려 건너뛴다
      const blocks = (await editor.tryParseMarkdownToBlocks(run.text)) as AnyBlock[];
      out.push(...blocks);
    } else {
      const inner = stripQuotePrefix(run.text);
      const innerBlocks = (await editor.tryParseMarkdownToBlocks(inner)) as AnyBlock[];
      out.push(assembleQuote(innerBlocks));
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/markdown/__tests__/blockquote.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/markdown/blockquote.ts frontend/src/markdown/__tests__/blockquote.test.ts
git commit -m "feat(blockquote): parse blockquote-with-list via re-delegation to BlockNote"
```

---

## Task 4: `serializeBlocksWithBlockquotes` — `>` 접두사 복원

**Files:**
- Modify: `frontend/src/markdown/blockquote.ts`
- Test: `frontend/src/markdown/__tests__/blockquote.test.ts`

- [ ] **Step 1: Write the failing test**

`blockquote.test.ts`에 추가:

```ts
import {
  splitRuns, stripQuotePrefix, parseMarkdownWithBlockquotes,
  serializeBlocksWithBlockquotes,
} from '../blockquote';

describe('serializeBlocksWithBlockquotes', () => {
  it('quote + children 를 > 접두사 붙은 리스트로 직렬화', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const blocks: any = [{
      type: 'quote',
      props: { backgroundColor: 'default', textColor: 'default' },
      content: [{ type: 'text', text: '링크', styles: {} }],
      children: [
        { type: 'bulletListItem', content: [{ type: 'text', text: 'a', styles: {} }] },
        { type: 'bulletListItem', content: [{ type: 'text', text: 'b', styles: {} }] },
      ],
    }];
    const md = await serializeBlocksWithBlockquotes(editor, blocks);
    expect(md).toContain('> 링크');
    expect(md).toContain('> * a');
    expect(md).toContain('> * b');
    // 리스트 줄이 blockquote 밖으로 탈출하지 않는다
    expect(md).not.toMatch(/^\* a/m);
  });

  it('children 없는 일반 quote 는 기존처럼 직렬화', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const blocks: any = [{
      type: 'quote',
      props: { backgroundColor: 'default', textColor: 'default' },
      content: [{ type: 'text', text: 'hello', styles: {} }],
      children: [],
    }];
    const md = await serializeBlocksWithBlockquotes(editor, blocks);
    expect(md.trim()).toBe('> hello');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/markdown/__tests__/blockquote.test.ts`
Expected: FAIL — `serializeBlocksWithBlockquotes` is not exported.

- [ ] **Step 3: Write minimal implementation**

`blockquote.ts`에 추가:

```ts
// 단일 quote 블록을 직렬화한다. lead(선행 단락)와 children(리스트)를 각각 BlockNote로
// 직렬화한 뒤 children 모든 줄에 '> ' 접두사를 다시 입혀 합친다.
async function serializeQuote(
  editor: BlockNoteEditor<any, any, any>,
  quote: AnyBlock,
): Promise<string> {
  const children = quote.children ?? [];
  const hasContent = Array.isArray(quote.content) && quote.content.length > 0;
  const lead = hasContent
    ? (await editor.blocksToMarkdownLossy([{ ...quote, children: [] }] as any)).trimEnd()
    : '';
  if (children.length === 0) return lead || '>';
  const childMd = (await editor.blocksToMarkdownLossy(children as any)).trimEnd();
  const prefixed = childMd
    .split('\n')
    .map(l => (l.length ? `> ${l}` : '>'))
    .join('\n');
  return lead ? `${lead}\n>\n${prefixed}` : prefixed;
}

// 블록 트리를 마크다운으로 직렬화하되 quote 블록만 '>' 접두사 복원을 거친다.
// 인접한 비-quote 블록은 묶어서 한 번에 BlockNote로 직렬화한다.
export async function serializeBlocksWithBlockquotes(
  editor: BlockNoteEditor<any, any, any>,
  blocks: AnyBlock[],
): Promise<string> {
  const parts: string[] = [];
  let buffer: AnyBlock[] = [];
  const flush = async () => {
    if (buffer.length === 0) return;
    parts.push((await editor.blocksToMarkdownLossy(buffer as any)).trimEnd());
    buffer = [];
  };
  for (const block of blocks) {
    if (block.type === 'quote') {
      await flush();
      parts.push(await serializeQuote(editor, block));
    } else {
      buffer.push(block);
    }
  }
  await flush();
  return parts.join('\n\n') + '\n';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/markdown/__tests__/blockquote.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/markdown/blockquote.ts frontend/src/markdown/__tests__/blockquote.test.ts
git commit -m "feat(blockquote): serialize quote children with > prefix restoration"
```

---

## Task 5: 라운드트립 + 무회귀 테스트

**Files:**
- Test: `frontend/src/markdown/__tests__/blockquote.test.ts`

- [ ] **Step 1: Write the failing test**

`blockquote.test.ts`에 추가. `postParse`/`preSerialize` 합성을 포함해 Editor.tsx 실제 경로를 모사한다:

```ts
import { postParse, preSerialize } from '../customParse';

async function roundtrip(md: string): Promise<any[]> {
  const editor = BlockNoteEditor.create({ schema });
  const parsed = postParse(await parseMarkdownWithBlockquotes(editor, md) as any);
  editor.replaceBlocks(editor.document, parsed as any);
  const out = await serializeBlocksWithBlockquotes(editor, preSerialize(editor.document as any) as any);
  // 두 번째 파싱
  const editor2 = BlockNoteEditor.create({ schema });
  return postParse(await parseMarkdownWithBlockquotes(editor2, out) as any) as any[];
}

describe('blockquote 라운드트립', () => {
  it('선행 단락 + 리스트 구조가 md→blocks→md→blocks 후 보존', async () => {
    const md = '> 링크\n>\n> - 범위\n> - 근거';
    const blocks: any = await roundtrip(md);
    expect(blocks[0].type).toBe('quote');
    expect(blocks[0].content[0].text).toBe('링크');
    expect(blocks[0].children.map((c: any) => c.type))
      .toEqual(['bulletListItem', 'bulletListItem']);
  });

  it('중첩 리스트가 라운드트립 후 보존', async () => {
    const blocks: any = await roundtrip('> - a\n>   - a1');
    expect(blocks[0].children[0].children[0].type).toBe('bulletListItem');
  });

  it('코드펜스 내부 > 줄은 quote 로 변하지 않는다', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const blocks: any = await parseMarkdownWithBlockquotes(editor, '```\n> x\n```');
    expect(blocks[0].type).toBe('codeBlock');
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `npx vitest run src/markdown/__tests__/blockquote.test.ts`
Expected: 모두 PASS여야 한다. FAIL이면 직렬화 출력 형태(`> *` 접두사/빈 줄 처리)를 디버깅한다 — `console.log(out)`로 중간 마크다운을 확인하고 Task 4의 `serializeQuote` 결합 규칙을 점검한다.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/markdown/__tests__/blockquote.test.ts
git commit -m "test(blockquote): round-trip and fence-safety tests"
```

---

## Task 6: Editor.tsx 통합

**Files:**
- Modify: `frontend/src/editor/Editor.tsx` (import 추가; L63, L176, L92 교체)

- [ ] **Step 1: import 추가**

`Editor.tsx` 상단 import 블록(현재 L7 부근)에 추가:

```ts
import { parseMarkdownWithBlockquotes, serializeBlocksWithBlockquotes } from '../markdown/blockquote';
```

- [ ] **Step 2: 로드 경로 교체 (L63)**

기존:
```ts
        const blocks = await editor.tryParseMarkdownToBlocks(body);
        editor.replaceBlocks(editor.document, postParse(blocks as any) as any);
```
교체:
```ts
        const blocks = await parseMarkdownWithBlockquotes(editor, body);
        editor.replaceBlocks(editor.document, postParse(blocks as any) as any);
```

- [ ] **Step 3: 리로드 경로 교체 (L176 부근, 동일 패턴)**

기존:
```ts
        const blocks = await editor.tryParseMarkdownToBlocks(body);
        editor.replaceBlocks(editor.document, postParse(blocks as any) as any);
```
교체:
```ts
        const blocks = await parseMarkdownWithBlockquotes(editor, body);
        editor.replaceBlocks(editor.document, postParse(blocks as any) as any);
```

- [ ] **Step 4: 저장 경로 교체 (L92)**

기존:
```ts
        const body = await editor.blocksToMarkdownLossy(preSerialize(editor.document as any) as any);
```
교체:
```ts
        const body = await serializeBlocksWithBlockquotes(editor, preSerialize(editor.document as any) as any);
```

- [ ] **Step 5: 타입 체크 + 전체 프론트 테스트**

Run: `npx tsc --noEmit -p frontend/tsconfig.json` (실패 시 `cd frontend && npx tsc --noEmit`)
Expected: 에러 없음.

Run: `cd frontend && npx vitest run`
Expected: blockquote.test.ts + 기존 integration/roundtrip/saveGuard/inline-roundtrip 전부 PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/editor/Editor.tsx
git commit -m "feat(blockquote): wire blockquote-aware parse/serialize into Editor"
```

---

## Task 7: 빌드 + 육안 검증

**Files:** 없음(검증만)

- [ ] **Step 1: 프론트엔드 번들 빌드**

Run: `./gradlew buildFrontend` (markora/ 루트에서)
Expected: BUILD SUCCESSFUL, `src/main/resources/blocknote/dist/` 갱신.

- [ ] **Step 2: (가능 시) 샌드박스 IDE 육안 확인**

Run: `./gradlew runIde`
이미지 케이스(`> 링크` + `> - 항목...`) .md 파일을 열어 blockquote 안에 리스트가 마커와 함께 렌더되는지, 저장 후 재오픈 시 구조가 보존되는지 확인.

- [ ] **Step 3: 최종 커밋(필요 시 번들 산출물)**

번들 산출물이 git 추적 대상이면:
```bash
git add -A
git commit -m "build(blockquote): rebuild frontend bundle"
```
아니면 스킵.

---

## 완료 기준

- `blockquote.test.ts` 전체 PASS + 기존 테스트 무회귀
- `npx tsc --noEmit` 클린
- `./gradlew buildFrontend` 성공
- (가능 시) runIde 육안 확인: 파싱·렌더·저장 라운드트립
