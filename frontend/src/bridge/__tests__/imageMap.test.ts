import { describe, it, expect } from 'vitest';
import { rewriteImagePathsForDisplay, restoreImagePaths } from '../imageMap';

const SERVER = 'http://localhost:63342/markora/';
const DIR = '/Users/me/doc';

describe('rewriteImagePathsForDisplay', () => {
  it('상대경로 이미지를 local-image API URL로 재작성하고 (URL→원본) 매핑을 만든다', () => {
    const { body, map } = rewriteImagePathsForDisplay(
      '![alt](images/foo.png)\n\ntext\n',
      DIR,
      SERVER,
    );
    const url =
      'http://localhost:63342/markora/api/local-image?path=' +
      encodeURIComponent('/Users/me/doc/images/foo.png');
    expect(body).toBe(`![alt](${url})\n\ntext\n`);
    expect(map.get(url)).toBe('images/foo.png');
  });

  it('./ 와 ../ 상대경로를 디스크 절대경로로 해석', () => {
    const { map } = rewriteImagePathsForDisplay('![a](./_assets/a.png) ![b](../b.png)', DIR, SERVER);
    const urlA =
      'http://localhost:63342/markora/api/local-image?path=' +
      encodeURIComponent('/Users/me/doc/_assets/a.png');
    const urlB =
      'http://localhost:63342/markora/api/local-image?path=' +
      encodeURIComponent('/Users/me/b.png');
    expect(map.get(urlA)).toBe('./_assets/a.png');
    expect(map.get(urlB)).toBe('../b.png');
  });

  it('이미 절대 URL(http/https)이나 data URL은 재작성하지 않는다', () => {
    const md = '![x](https://example.com/x.png) ![y](data:image/png;base64,AAAA)';
    const { body, map } = rewriteImagePathsForDisplay(md, DIR, SERVER);
    expect(body).toBe(md);
    expect(map.size).toBe(0);
  });

  it('타이틀은 보존하면서 경로만 재작성', () => {
    const { body } = rewriteImagePathsForDisplay('![a](images/foo.png "caption")', DIR, SERVER);
    const url =
      'http://localhost:63342/markora/api/local-image?path=' +
      encodeURIComponent('/Users/me/doc/images/foo.png');
    expect(body).toBe(`![a](${url} "caption")`);
  });

  it('이미지가 없으면 원본 그대로, 빈 맵', () => {
    const { body, map } = rewriteImagePathsForDisplay('# no images', DIR, SERVER);
    expect(body).toBe('# no images');
    expect(map.size).toBe(0);
  });

  it('재작성 후 저장 시 원본 상대경로로 복원된다 (라운드트립)', () => {
    const original = '![alt](./_assets/a.png "cap")\n';
    const { body, map } = rewriteImagePathsForDisplay(original, DIR, SERVER);
    expect(restoreImagePaths(body, map)).toBe(original);
  });
});

describe('restoreImagePaths', () => {
  it('직렬화된 절대 URL을 원본 상대경로로 되돌린다', () => {
    const map = new Map([['http://localhost:63342/markora/images/foo.png', 'images/foo.png']]);
    const md = '![alt](http://localhost:63342/markora/images/foo.png)\n';
    expect(restoreImagePaths(md, map)).toBe('![alt](images/foo.png)\n');
  });

  it('타이틀은 보존', () => {
    const map = new Map([['http://localhost:63342/markora/images/foo.png', 'images/foo.png']]);
    const md = '![alt](http://localhost:63342/markora/images/foo.png "cap")\n';
    expect(restoreImagePaths(md, map)).toBe('![alt](images/foo.png "cap")\n');
  });

  it('맵에 없는 URL은 그대로 둔다', () => {
    const map = new Map([['http://localhost:63342/markora/images/foo.png', 'images/foo.png']]);
    const md = '![x](https://cdn.example.com/y.png)\n';
    expect(restoreImagePaths(md, map)).toBe(md);
  });

  it('빈 맵이면 원본 그대로', () => {
    const md = '![x](http://localhost:63342/markora/images/foo.png)';
    expect(restoreImagePaths(md, new Map())).toBe(md);
  });

  it('업로드 이미지의 local-image API URL도 역변환', () => {
    const url = 'http://localhost:63342/api/local-image?path=%2Ftmp%2Fimages%2Fa.png';
    const map = new Map([[url, 'images/a.png']]);
    const md = `![](${url})`;
    expect(restoreImagePaths(md, map)).toBe('![](images/a.png)');
  });
});
