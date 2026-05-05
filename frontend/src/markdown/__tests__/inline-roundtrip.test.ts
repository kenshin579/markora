import { describe, it, expect } from 'vitest';
import { splitInlineMath, joinInlineMath } from '../customParse';

describe('인라인 수식 라운드트립', () => {
  it('split 후 join으로 원본 텍스트 복원', () => {
    const original = [{ type: 'text', text: '식: $a+b$ 와 $c-d$', styles: {} }] as any;
    const split = splitInlineMath(original);
    expect(split).toHaveLength(4);
    const back = joinInlineMath(split);
    expect(back).toEqual([{ type: 'text', text: '식: $a+b$ 와 $c-d$', styles: {} }]);
  });
});
