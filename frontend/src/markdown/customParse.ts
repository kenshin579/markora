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

export function preSerialize(blocks: AnyBlock[]): AnyBlock[] {
  return blocks.map(b => {
    if (b.type === 'katex')   return codeBlock('math',    b.props?.source ?? '');
    if (b.type === 'mermaid') return codeBlock('mermaid', b.props?.source ?? '');
    if (Array.isArray(b.content)) {
      return { ...b, content: joinInlineMath(b.content as InlineNode[]),
               children: b.children ? preSerialize(b.children) : undefined };
    }
    if (b.children?.length) return { ...b, children: preSerialize(b.children) };
    return b;
  });
}

export function postParse(blocks: AnyBlock[]): AnyBlock[] {
  return blocks.map(b => {
    if (b.type === 'codeBlock' && b.props?.language === 'math') {
      return { type: 'katex',   props: { source: codeContent(b) } };
    }
    if (b.type === 'codeBlock' && b.props?.language === 'mermaid') {
      return { type: 'mermaid', props: { source: codeContent(b) } };
    }
    if (Array.isArray(b.content)) {
      return { ...b, content: splitInlineMath(b.content as InlineNode[]),
               children: b.children ? postParse(b.children) : undefined };
    }
    if (b.children?.length) return { ...b, children: postParse(b.children) };
    return b;
  });
}

const INLINE_MATH_RE = /\$([^$\n]+?)\$/g;

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

export function joinInlineMath(nodes: InlineNode[]): InlineNode[] {
  // 인라인 KaTeX 노드를 $source$ 텍스트로 직렬화하면서 인접 텍스트와 병합
  const result: InlineNode[] = [];
  for (const n of nodes) {
    let serialized: InlineNode;
    if (n.type === 'katexInline') {
      serialized = { type: 'text', text: `$${n.props.source}$`, styles: {} };
    } else {
      serialized = n;
    }
    const prev = result[result.length - 1];
    if (prev && prev.type === 'text' && serialized.type === 'text' &&
        JSON.stringify(prev.styles) === JSON.stringify(serialized.styles)) {
      prev.text += serialized.text;
    } else {
      result.push(serialized);
    }
  }
  return result;
}
