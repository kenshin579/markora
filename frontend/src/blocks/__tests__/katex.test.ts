import { describe, it, expect } from 'vitest';
import { renderKatexToHtml } from '../KatexBlock';

describe('renderKatexToHtml', () => {
  it('valid LaTeX → KaTeX HTML', () => {
    const { html, error } = renderKatexToHtml('x^2 + y^2 = z^2');
    expect(error).toBeNull();
    expect(html).toContain('katex');
  });

  it('invalid LaTeX → error 반환', () => {
    const { html, error } = renderKatexToHtml('\\alfa^2');
    expect(error).not.toBeNull();
    expect(html).toBe('');
  });

  it('빈 source → 빈 HTML, 에러 없음', () => {
    const { html, error } = renderKatexToHtml('');
    expect(error).toBeNull();
    expect(html).toBe('');
  });
});
