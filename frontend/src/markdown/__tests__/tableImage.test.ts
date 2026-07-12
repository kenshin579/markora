import { describe, it, expect } from 'vitest';
import { encodeToken, decodeToken, maskTableImages, unmaskTableImages } from '../tableImage';

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

describe('maskTableImages', () => {
  it('테이블 셀 이미지를 토큰으로 치환', () => {
    const md = [
      '| A | B |',
      '| --- | --- |',
      '| ![alt](img.png) | text |',
      '',
    ].join('\n');
    const masked = maskTableImages(md);
    expect(masked).not.toContain('![alt](img.png)');
    expect(masked).toMatch(/\.MKRAIMG\.[A-Za-z0-9_-]+\./);
    expect(masked.split('\n')[2]).toMatch(/^\| \.MKRAIMG\..+\. \| text \|$/);
  });

  it('테이블 밖 일반 단락의 이미지는 건드리지 않는다', () => {
    const md = 'para ![a](x.png) end\n\n| H |\n| --- |\n| c |';
    expect(maskTableImages(md)).toContain('![a](x.png)');
  });

  it('파이프만 있고 구분행이 없는 단락은 테이블로 오인하지 않는다', () => {
    const md = 'a | b ![a](x.png) c | d';
    expect(maskTableImages(md)).toContain('![a](x.png)');
  });

  it('코드펜스 내부 테이블 유사 라인은 건드리지 않는다', () => {
    const md = '```\n| ![a](x.png) |\n| --- |\n```';
    expect(maskTableImages(md)).toContain('![a](x.png)');
  });
});

describe('unmaskTableImages', () => {
  it('토큰을 마크다운 이미지로 복원(title 유무)', () => {
    const withTitle = encodeToken({ url: 'u.png', alt: 'a', title: 't' });
    const noTitle = encodeToken({ url: 'v.png', alt: 'b', title: '' });
    expect(unmaskTableImages(`x ${withTitle} y`)).toBe('x ![a](u.png "t") y');
    expect(unmaskTableImages(`x ${noTitle} y`)).toBe('x ![b](v.png) y');
  });

  it('mask → unmask 왕복이 테이블 이미지 원문을 복원', () => {
    const md = '| A |\n| --- |\n| ![alt](img.png) |';
    expect(unmaskTableImages(maskTableImages(md))).toBe(md);
  });
});
