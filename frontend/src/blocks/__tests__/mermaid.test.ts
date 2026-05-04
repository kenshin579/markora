import { describe, it, expect, vi, beforeEach } from 'vitest';

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
