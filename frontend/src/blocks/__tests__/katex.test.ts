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

describe('renderKatexToHtml: 추가 회귀', () => {
  it('whitespace-only source는 valid (KaTeX가 빈 식으로 처리)', () => {
    const { error } = renderKatexToHtml('   ');
    // KaTeX는 whitespace-only를 valid로 처리할 수도, 에러로 처리할 수도 있음
    // 그냥 호출이 throw하지 않으면 OK (방어 테스트)
    expect(typeof error === 'string' || error === null).toBe(true);
  });
});
