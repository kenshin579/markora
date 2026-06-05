// 이미지 경로 변환 (옵션 B: 비편집 영역 보존)
//
// 파일에 적힌 상대경로 이미지(예: `./_assets/foo.png`)를 그대로 BlockNote에 넘기면,
// <img>가 JCEF 페이지의 base URI(번들 dist 디렉터리) 기준으로 해석되어 디스크의 실제
// 파일이 아니라 엉뚱한 곳을 가리킨다 → 렌더링 실패. 그래서 로드 시 상대경로를 IDE가
// 디스크에서 직접 서빙하는 `api/local-image?path=<절대경로>` URL로 재작성한다.
// 동시에 (local-image URL → 원본 상대경로) 매핑을 만들어 두고, 저장 시 직렬화된 URL을
// 원본 상대경로로 되돌려 파일에는 localhost 절대 URL이 박히지 않게 한다.

// `![alt](target)` / `![alt](target "title")`를 head/target/tail 세 그룹으로 나눈다.
const IMAGE_REWRITE_RE = /(!\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g;
// 링크/이미지의 `](target)` 또는 `](target "title")` 부분.
const LINK_TARGET_RE = /\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g;

const ABSOLUTE_URL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const DATA_URL_RE = /^data:/i;

// `dir` 기준으로 상대경로 `rel`을 디스크 절대경로로 해석한다. `.`/`..` 세그먼트 처리.
function resolveAgainstDir(dir: string, rel: string): string {
  const parts = dir.replace(/\\/g, '/').replace(/\/+$/, '').split('/');
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length > 1) parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return parts.join('/');
}

export function rewriteImagePathsForDisplay(
  md: string,
  mdDir: string,
  serverUrl: string,
): { body: string; map: Map<string, string> } {
  const map = new Map<string, string>();
  const body = md.replace(IMAGE_REWRITE_RE, (whole, head: string, target: string, tail: string) => {
    // 이미 절대 URL이거나 data URL이면 디스크 파일이 아니므로 재작성하지 않는다.
    if (ABSOLUTE_URL_RE.test(target) || DATA_URL_RE.test(target)) return whole;
    const absPath = resolveAgainstDir(mdDir, target);
    const url = `${serverUrl}api/local-image?path=${encodeURIComponent(absPath)}`;
    map.set(url, target);
    return `${head}${url}${tail}`;
  });
  return { body, map };
}

export function restoreImagePaths(md: string, map: Map<string, string>): string {
  if (map.size === 0) return md;
  return md.replace(LINK_TARGET_RE, (whole, url: string, title: string) => {
    const original = map.get(url);
    return original ? `](${original}${title})` : whole;
  });
}
