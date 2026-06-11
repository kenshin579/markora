import type { BlockNoteEditor } from '@blocknote/core';

export type Run = { kind: 'quote' | 'plain'; text: string };

type AnyBlock = { type: string; props?: Record<string, any>; content?: any; children?: AnyBlock[] };

const QUOTE_PROPS = { backgroundColor: 'default', textColor: 'default' } as const;

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
