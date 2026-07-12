import { getLanguageId } from '@blocknote/core';
import { codeBlockOptions } from '../editor/codeBlock';
import { tokenTextToInline, inlineToTokenText } from './tableImage';

type AnyBlock = {
  type: string;
  props?: Record<string, any>;
  content?: any;
  children?: AnyBlock[];
};

type InlineNode =
  | { type: 'text'; text: string; styles: Record<string, any> }
  | { type: 'link'; href: string; content: InlineNode[] }
  | { type: 'katexInline'; props: { source: string } };

const codeBlock = (language: string, source: string): AnyBlock => ({
  type: 'codeBlock',
  props: { language },
  content: [{ type: 'text', text: source, styles: {} }],
});

const codeContent = (b: AnyBlock): string => {
  if (Array.isArray(b.content) && b.content.length > 0 && b.content[0].type === 'text') {
    return b.content[0].text ?? '';
  }
  return '';
};

// Fix 4: only apply inline math splitting/joining to blocks that support inline content
const INLINE_MATH_BLOCK_TYPES = new Set([
  'paragraph', 'heading', 'bulletListItem', 'numberedListItem', 'checkListItem', 'quote',
]);

// 테이블 블록은 content 가 배열이 아니라 { type:'tableContent', rows:[{cells:[{type:'tableCell', content:[...]}]}] }
// 객체라 기존 재귀가 도달하지 못한다. 각 셀의 인라인 배열에 fn 을 적용한 새 블록을 만든다.
function mapTableCells(b: AnyBlock, fn: (nodes: any[]) => any[]): AnyBlock {
  const content: any = b.content;
  const rows = (content.rows ?? []).map((row: any) => ({
    ...row,
    cells: (row.cells ?? []).map((cell: any) =>
      cell && typeof cell === 'object' && Array.isArray(cell.content)
        ? { ...cell, content: fn(cell.content) }
        : cell),
  }));
  return { ...b, content: { ...content, rows } };
}

export function preSerialize(blocks: AnyBlock[]): AnyBlock[] {
  return blocks.map(b => {
    if ((b.content as any)?.type === 'tableContent') {
      return mapTableCells(b, inlineToTokenText);
    }
    if (b.type === 'katex')   return codeBlock('math',    b.props?.source ?? '');
    if (b.type === 'mermaid') return codeBlock('mermaid', b.props?.source ?? '');
    // Fix 4 + Fix 5: gate by block type; Fix 5: only add children key when present
    if (Array.isArray(b.content) && INLINE_MATH_BLOCK_TYPES.has(b.type)) {
      const next: AnyBlock = { ...b, content: joinInlineMath(b.content as InlineNode[]) };
      if (b.children) next.children = preSerialize(b.children);
      return next;
    }
    if (b.children?.length) return { ...b, children: preSerialize(b.children) };
    return b;
  });
}

export function postParse(blocks: AnyBlock[]): AnyBlock[] {
  return blocks.map(b => {
    if ((b.content as any)?.type === 'tableContent') {
      return mapTableCells(b, tokenTextToInline);
    }
    if (b.type === 'codeBlock' && b.props?.language === 'math') {
      return { type: 'katex', props: { source: codeContent(b) } };
    }
    if (b.type === 'codeBlock' && b.props?.language === 'mermaid') {
      return { type: 'mermaid', props: { source: codeContent(b) } };
    }
    // Normalize codeBlock language aliases (e.g. 'bash' → 'shellscript', 'kt' → 'kotlin')
    // so BlockNote's language picker can show the correct label. Unknown languages are
    // left as-is to preserve round-trip serialization.
    if (b.type === 'codeBlock' && typeof b.props?.language === 'string' && b.props.language.length > 0) {
      const canonical = getLanguageId(codeBlockOptions, b.props.language);
      if (canonical && canonical !== b.props.language) {
        return { ...b, props: { ...b.props, language: canonical } };
      }
    }
    // Fix 4 + Fix 5: gate by block type; Fix 5: only add children key when present
    if (Array.isArray(b.content) && INLINE_MATH_BLOCK_TYPES.has(b.type)) {
      const next: AnyBlock = { ...b, content: splitInlineMath(b.content as InlineNode[]) };
      if (b.children) next.children = postParse(b.children);
      return next;
    }
    if (b.children?.length) return { ...b, children: postParse(b.children) };
    return b;
  });
}

// Fix 2 + Fix 3: tightened regex
// - (?<!\\)       : reject escaped \$
// - (?<!\$)\$(?!\$): opening $ that is not adjacent to another $ (rejects $$ block math)
// - \S            : non-whitespace immediately after opening $
// - (?:[^$\n]*?\S)?: optional middle content (ends with non-whitespace)
// - (?<!\$)\$(?!\$): closing $ that is not adjacent to another $ (rejects $$ block math)
// - (?!\d)        : reject currency like $10
const INLINE_MATH_RE = /(?<!\\)(?<!\$)\$(?!\$)(\S(?:[^\$\n]*?\S)?)(?<!\$)\$(?!\$)(?!\d)/g;

export function splitInlineMath(nodes: InlineNode[]): InlineNode[] {
  const out: InlineNode[] = [];
  for (const n of nodes) {
    if (n.type !== 'text') { out.push(n); continue; }
    INLINE_MATH_RE.lastIndex = 0;
    if (!INLINE_MATH_RE.test(n.text)) { out.push(n); continue; }
    INLINE_MATH_RE.lastIndex = 0;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = INLINE_MATH_RE.exec(n.text)) !== null) {
      if (m.index > last) out.push({ type: 'text', text: n.text.slice(last, m.index), styles: n.styles });
      out.push({ type: 'katexInline', props: { source: m[1] } });
      last = m.index + m[0].length;
    }
    if (last < n.text.length) out.push({ type: 'text', text: n.text.slice(last), styles: n.styles });
  }
  return out;
}

// Fix 1: no input mutation — always produce fresh result objects
export function joinInlineMath(nodes: InlineNode[]): InlineNode[] {
  // 인라인 KaTeX 노드를 $source$ 텍스트로 직렬화하면서 인접 텍스트와 병합
  const result: InlineNode[] = [];
  for (const n of nodes) {
    let serialized: InlineNode;
    if (n.type === 'katexInline') {
      serialized = { type: 'text', text: `$${n.props.source}$`, styles: {} };
    } else if (n.type === 'text') {
      serialized = { type: 'text', text: n.text, styles: n.styles }; // shallow copy — never mutate input
    } else {
      serialized = n;
    }
    const prev = result[result.length - 1];
    if (prev && prev.type === 'text' && serialized.type === 'text' &&
        JSON.stringify(prev.styles) === JSON.stringify(serialized.styles)) {
      // replace last entry with a fresh merged object (Fix 1: no mutation of prev)
      result[result.length - 1] = { type: 'text', text: prev.text + serialized.text, styles: prev.styles };
    } else {
      result.push(serialized);
    }
  }
  return result;
}
