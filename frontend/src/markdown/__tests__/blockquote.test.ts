import { describe, it, expect } from 'vitest';
import { splitRuns, stripQuotePrefix } from '../blockquote';

describe('splitRuns', () => {
  it('blockquote 줄과 일반 줄을 연속 구간으로 분리', () => {
    const body = 'para\n> q1\n> q2\nafter';
    expect(splitRuns(body)).toEqual([
      { kind: 'plain', text: 'para' },
      { kind: 'quote', text: '> q1\n> q2' },
      { kind: 'plain', text: 'after' },
    ]);
  });

  it('앞 공백 ≤3까지는 blockquote로 인정', () => {
    expect(splitRuns('   > q')).toEqual([{ kind: 'quote', text: '   > q' }]);
  });

  it('코드펜스 내부의 > 줄은 blockquote로 오인하지 않음', () => {
    const body = '```\n> not a quote\n```';
    expect(splitRuns(body)).toEqual([
      { kind: 'plain', text: '```\n> not a quote\n```' },
    ]);
  });
});

describe('stripQuotePrefix', () => {
  it('> 와 뒤따르는 공백 1개만 제거하고 들여쓰기는 보존', () => {
    const text = '> - a\n>   - a1\n>';
    expect(stripQuotePrefix(text)).toBe('- a\n  - a1\n');
  });

  it('> 없는 줄은 그대로', () => {
    expect(stripQuotePrefix('plain')).toBe('plain');
  });
});
