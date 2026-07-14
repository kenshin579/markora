import { describe, it, expect } from 'vitest';
import { maskTableBreaks, unmaskBreakTokens } from '../tableLineBreak';

describe('maskTableBreaks', () => {
  it('셀 안 <br> 변형(<br>, <br/>, <br />, <BR>)을 토큰으로 치환', () => {
    const md = [
      '| A |',
      '| --- |',
      '| l1<br>l2 |',
      '| a<br/>b |',
      '| c<br />d |',
      '| e<BR>f |',
    ].join('\n');
    const out = maskTableBreaks(md);
    expect(out).not.toMatch(/<br/i);
    expect((out.match(/\.MKRABR\./g) || []).length).toBe(4);
  });

  it('테이블 밖 <br> 는 건드리지 않는다', () => {
    const md = 'para<br>text\n\n| H |\n| --- |\n| c |';
    expect(maskTableBreaks(md)).toContain('para<br>text');
  });

  it('코드펜스 내부 <br> 는 건드리지 않는다', () => {
    const md = ['```html', '<br>', '```'].join('\n');
    expect(maskTableBreaks(md)).toContain('<br>');
  });
});

describe('unmaskBreakTokens', () => {
  it('토큰을 <br> 로 복원', () => {
    expect(unmaskBreakTokens('l1.MKRABR.l2')).toBe('l1<br>l2');
  });
  it('연속 토큰도 각각 복원', () => {
    expect(unmaskBreakTokens('a.MKRABR..MKRABR.b')).toBe('a<br><br>b');
  });
  it('토큰이 없으면 원문 그대로', () => {
    expect(unmaskBreakTokens('plain text')).toBe('plain text');
  });
});
