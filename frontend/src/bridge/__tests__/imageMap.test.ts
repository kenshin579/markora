import { describe, it, expect } from 'vitest';
import { collectImageUrlMap, restoreImagePaths } from '../imageMap';

const BASE = 'http://localhost:63342/markora/';

describe('collectImageUrlMap', () => {
  it('상대경로 이미지를 base 기준 절대 URL로 매핑 (절대→원본)', () => {
    const md = '![alt](images/foo.png)\n\ntext\n';
    const map = collectImageUrlMap(md, BASE);
    expect(map.get('http://localhost:63342/markora/images/foo.png')).toBe('images/foo.png');
  });

  it('./ 와 ../ 상대경로도 매핑', () => {
    const md = '![a](./a.png) ![b](../b.png)';
    const map = collectImageUrlMap(md, BASE);
    expect(map.get('http://localhost:63342/markora/a.png')).toBe('./a.png');
    expect(map.get('http://localhost:63342/b.png')).toBe('../b.png');
  });

  it('이미 절대 URL(http/https)인 이미지는 매핑하지 않는다', () => {
    const md = '![x](https://example.com/x.png)';
    const map = collectImageUrlMap(md, BASE);
    expect(map.size).toBe(0);
  });

  it('타이틀이 있어도 경로만 추출', () => {
    const md = '![a](images/foo.png "caption")';
    const map = collectImageUrlMap(md, BASE);
    expect(map.get('http://localhost:63342/markora/images/foo.png')).toBe('images/foo.png');
  });

  it('이미지가 없으면 빈 맵', () => {
    expect(collectImageUrlMap('# no images', BASE).size).toBe(0);
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
