import { describe, it, expect } from 'vitest';
import { maskTableBreaks, unmaskBreakTokens } from '../tableLineBreak';
import { breakTokensToNewlines, newlinesToBreakTokens } from '../tableLineBreak';

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
    const md = ['| H |', '| --- |', '| l1.MKRABR.l2 |'].join('\n');
    expect(unmaskBreakTokens(md)).toContain('l1<br>l2');
  });
  it('연속 토큰도 각각 복원', () => {
    const md = ['| H |', '| --- |', '| a.MKRABR..MKRABR.b |'].join('\n');
    expect(unmaskBreakTokens(md)).toContain('a<br><br>b');
  });
  it('토큰이 없으면 원문 그대로', () => {
    expect(unmaskBreakTokens('plain text')).toBe('plain text');
  });
  it('테이블 밖 리터럴 토큰은 건드리지 않는다 (스코프)', () => {
    const md = ['para .MKRABR. text', '', '| H |', '| --- |', '| a.MKRABR.b |'].join('\n');
    const out = unmaskBreakTokens(md);
    // 테이블 밖 문단의 리터럴 토큰은 보존
    expect(out).toContain('para .MKRABR. text');
    // 테이블 셀 안의 토큰만 <br> 로 복원
    expect(out).toContain('| a<br>b |');
  });
});

describe('breakTokensToNewlines', () => {
  it('텍스트 노드의 토큰을 개행으로 (스타일 보존)', () => {
    const nodes = [{ type: 'text', text: 'l1.MKRABR.l2', styles: { bold: true } }];
    expect(breakTokensToNewlines(nodes as any)).toEqual([
      { type: 'text', text: 'l1\nl2', styles: { bold: true } },
    ]);
  });
  it('연속 토큰 → 연속 개행', () => {
    const nodes = [{ type: 'text', text: 'a.MKRABR..MKRABR.b', styles: {} }];
    expect(breakTokensToNewlines(nodes as any)).toEqual([
      { type: 'text', text: 'a\n\nb', styles: {} },
    ]);
  });
  it('비-텍스트 노드(inlineImage)는 그대로 통과', () => {
    const nodes = [{ type: 'inlineImage', props: { url: 'x', alt: '', title: '' } }];
    expect(breakTokensToNewlines(nodes as any)).toEqual(nodes);
  });
});

describe('newlinesToBreakTokens', () => {
  it('개행을 토큰으로', () => {
    const nodes = [{ type: 'text', text: 'l1\nl2', styles: {} }];
    expect(newlinesToBreakTokens(nodes as any)).toEqual([
      { type: 'text', text: 'l1.MKRABR.l2', styles: {} },
    ]);
  });
  it('대칭성: break→newline→break 왕복 동일', () => {
    const start = [{ type: 'text', text: 'a.MKRABR.b.MKRABR.c', styles: {} }];
    const round = newlinesToBreakTokens(breakTokensToNewlines(start as any));
    expect(round).toEqual(start);
  });
});
