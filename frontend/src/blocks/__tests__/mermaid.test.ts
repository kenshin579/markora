import { describe, it, expect, vi, beforeEach } from 'vitest';
import mermaid from 'mermaid';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (id: string, source: string) => {
      if (source.includes('INVALID')) throw new Error('Parse error: INVALID');
      return { svg: `<svg id="${id}">${source}</svg>` };
    }),
  },
}));

import { renderMermaidToSvg, initMermaid } from '../MermaidBlock';

describe('renderMermaidToSvg', () => {
  beforeEach(() => initMermaid('light'));

  it('valid source → SVG 문자열', async () => {
    const { svg, error } = await renderMermaidToSvg('m1', 'graph TD\nA-->B');
    expect(error).toBeNull();
    expect(svg).toContain('<svg');
  });

  it('invalid source → 에러 메시지', async () => {
    const { svg, error } = await renderMermaidToSvg('m2', 'INVALID');
    expect(error).toContain('Parse error');
    expect(svg).toBe('');
  });
});

describe('initMermaid config', () => {
  // JCEF의 임베디드 Chromium은 mermaid 기본값(foreignObject HTML 라벨)의
  // 자동 줄바꿈을 적용하지 못해 긴 한글이 박스 폭을 넘어 짤린다. mermaid 11에서는
  // top-level `htmlLabels:false`만 적용돼야 라벨이 SVG <text>/<tspan>으로
  // 렌더되어 JCEF에서도 안정적으로 wrapping된다(`flowchart.htmlLabels`는 무시됨).
  it('htmlLabels:false 가 top-level 로 mermaid.initialize 에 전달된다', () => {
    (mermaid.initialize as any).mockClear();
    initMermaid('light');
    const cfg = (mermaid.initialize as any).mock.calls.at(-1)[0];
    expect(cfg.htmlLabels).toBe(false);
  });
});
