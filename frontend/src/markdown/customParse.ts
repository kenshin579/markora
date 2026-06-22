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

export function preSerialize(blocks: AnyBlock[]): AnyBlock[] {
  return blocks.map(b => {
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
    if (b.type === 'codeBlock' && b.props?.language === 'math') {
      return { type: 'katex', props: { source: codeContent(b) } };
    }
    if (b.type === 'codeBlock' && b.props?.language === 'mermaid') {
      return { type: 'mermaid', props: { source: codeContent(b) } };
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
    const m = line.match(/^(\s*)(`{3,}|~{3,})/); // 여는 펜스: info-string 허용
    if (fence) {
      // 닫는 펜스: info-string 없이 마커 + 선택적 후행 공백만 허용 (CommonMark 규칙)
      const mc = line.match(/^(\s*)(`{3,}|~{3,})\s*$/);
      if (mc && mc[2][0] === fence[0] && mc[2].length >= fence.length) fence = null;
      out.push(line); // 닫는 펜스 라인 포함, 내부는 변환 안 함
      continue;
    }
    if (m) {
      fence = m[2];
      out.push(line); // 여는 펜스 라인 변환 안 함 (~~~ 마커 보존)
      continue;
    }
    // 인라인 코드 스팬 분리 — 홀수 인덱스가 코드 스팬
    // known limitation: `` `foo`bar `` 같이 내부 단일 백틱 포함 스팬은 완벽하게 토크나이즈되지 않음
    const parts = line.split(/(`+[^`\n]*`+)/);
    out.push(parts.map((p, i) => (i % 2 === 1 ? p : fn(p))).join(''));
  }
  return out.join('\n');
}

export function escapeSingleTildes(md: string): string {
  // (?<!\\): 이미 이스케이프된 \~ 제외, (?<!~)~(?!~): 단일 틸드만 (~~ 보존)
  // known limitation: \\~ (이스케이프 백슬래시 + 원시 틸드) 는 lookbehind 로 인해 이스케이프되지 않음
  return transformOutsideCode(md, (t) => t.replace(/(?<!\\)(?<!~)~(?!~)/g, '\\~'));
}
