import { describe, it, expect } from 'vitest';
import { postParse, preSerialize } from '../customParse';

const tableBlock = (cellText: string) => ({
  type: 'table',
  content: {
    type: 'tableContent',
    rows: [{
      cells: [{ type: 'tableCell', content: [{ type: 'text', text: cellText, styles: {} }], props: {} }],
    }],
  },
});

const cellText = (block: any): string =>
  block.content.rows[0].cells[0].content[0].text;

describe('customParse 셀 개행 합성', () => {
  it('postParse: 셀 토큰을 개행으로 복원', () => {
    const out = postParse([tableBlock('l1.MKRABR.l2')] as any);
    expect(cellText(out[0])).toBe('l1\nl2');
  });

  it('preSerialize: 셀 개행을 토큰으로 되돌림', () => {
    const out = preSerialize([tableBlock('l1\nl2')] as any);
    expect(cellText(out[0])).toBe('l1.MKRABR.l2');
  });

  it('라운드트립: postParse → preSerialize 왕복 동일', () => {
    const start = [tableBlock('a.MKRABR.b')];
    const round = preSerialize(postParse(start as any) as any);
    expect(cellText(round[0])).toBe('a.MKRABR.b');
  });
});
