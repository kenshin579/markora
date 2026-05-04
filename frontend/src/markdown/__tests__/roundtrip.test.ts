import { describe, it, expect } from 'vitest';
import { preSerialize, postParse, splitInlineMath, joinInlineMath } from '../customParse';

describe('preSerialize: custom block → standard codeBlock', () => {
  it('katex 블록을 ```math 코드블록으로 치환', () => {
    const blocks = [{ type: 'katex', props: { source: 'x^2' } }];
    expect(preSerialize(blocks as any)).toEqual([
      {
        type: 'codeBlock',
        props: { language: 'math' },
        content: [{ type: 'text', text: 'x^2', styles: {} }],
      },
    ]);
  });

  it('mermaid 블록을 ```mermaid 코드블록으로 치환', () => {
    const blocks = [{ type: 'mermaid', props: { source: 'graph TD\nA-->B' } }];
    expect(preSerialize(blocks as any)).toEqual([
      {
        type: 'codeBlock',
        props: { language: 'mermaid' },
        content: [{ type: 'text', text: 'graph TD\nA-->B', styles: {} }],
      },
    ]);
  });

  it('표준 블록은 그대로 반환', () => {
    const blocks = [{ type: 'paragraph', content: [{ type: 'text', text: 'hi', styles: {} }] }];
    expect(preSerialize(blocks as any)).toEqual(blocks);
  });

  it('children 재귀 처리', () => {
    const blocks = [{
      type: 'bulletListItem',
      content: [{ type: 'text', text: 'top', styles: {} }],
      children: [{ type: 'katex', props: { source: 'a' } }],
    }];
    const out = preSerialize(blocks as any);
    expect((out[0] as any).children[0].type).toBe('codeBlock');
  });
});

describe('postParse: standard codeBlock → custom block', () => {
  it('```math 코드블록을 katex 블록으로', () => {
    const blocks = [{
      type: 'codeBlock',
      props: { language: 'math' },
      content: [{ type: 'text', text: 'x^2', styles: {} }],
    }];
    expect(postParse(blocks as any)).toEqual([
      { type: 'katex', props: { source: 'x^2' } },
    ]);
  });

  it('```mermaid 코드블록을 mermaid 블록으로', () => {
    const blocks = [{
      type: 'codeBlock',
      props: { language: 'mermaid' },
      content: [{ type: 'text', text: 'graph TD\nA-->B', styles: {} }],
    }];
    expect(postParse(blocks as any)).toEqual([
      { type: 'mermaid', props: { source: 'graph TD\nA-->B' } },
    ]);
  });

  it('다른 언어 코드블록은 그대로', () => {
    const blocks = [{
      type: 'codeBlock',
      props: { language: 'javascript' },
      content: [{ type: 'text', text: 'let x = 1;', styles: {} }],
    }];
    expect(postParse(blocks as any)).toEqual(blocks);
  });
});

describe('인라인 수식 분리', () => {
  it('"text $a^2$ tail" → ["text ", katex(a^2), " tail"]', () => {
    const out = splitInlineMath([{ type: 'text', text: 'text $a^2$ tail', styles: {} }]);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ type: 'text', text: 'text ', styles: {} });
    expect(out[1]).toEqual({ type: 'katexInline', props: { source: 'a^2' } });
    expect(out[2]).toEqual({ type: 'text', text: ' tail', styles: {} });
  });

  it('수식 없으면 입력 그대로', () => {
    const input = [{ type: 'text', text: 'no math here', styles: {} }];
    expect(splitInlineMath(input)).toEqual(input);
  });

  it('직렬화: katexInline → "$source$" 텍스트', () => {
    const input = [
      { type: 'text', text: 'a ', styles: {} },
      { type: 'katexInline', props: { source: 'x^2' } },
      { type: 'text', text: ' b', styles: {} },
    ];
    expect(joinInlineMath(input)).toEqual([
      { type: 'text', text: 'a $x^2$ b', styles: {} },
    ]);
  });
});
