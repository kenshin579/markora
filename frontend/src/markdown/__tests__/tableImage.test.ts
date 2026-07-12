import { describe, it, expect } from 'vitest';
import { encodeToken, decodeToken } from '../tableImage';

describe('토큰 코덱', () => {
  it('encode → decode 라운드트립(한글 alt/title 포함)', () => {
    const img = { url: 'http://localhost:63342/api/local-image?path=%2Fa%2Fb.png', alt: '설명 [x]', title: '제목 "인용"' };
    const token = encodeToken(img);
    expect(token).toMatch(/^\.MKRAIMG\.[A-Za-z0-9_-]+\.$/);
    expect(decodeToken(token.slice('.MKRAIMG.'.length, -1))).toEqual(img);
  });

  it('토큰은 마크다운 특수문자/파이프를 포함하지 않는다', () => {
    const token = encodeToken({ url: 'a|b*c_d', alt: '![nested](x)', title: '' });
    const payload = token.slice('.MKRAIMG.'.length, -1);
    expect(payload).not.toMatch(/[|*`\[\]()<>~\\]/);
  });
});
