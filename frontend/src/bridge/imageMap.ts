// 이미지 경로 역변환 (옵션 B: 비편집 영역 보존)
//
// BlockNote는 마크다운을 파싱할 때 상대경로 이미지를 문서 base URI 기준 절대 URL로
// 해석한다(예: `images/foo.png` → `http://localhost:<port>/markora/images/foo.png`).
// 그대로 저장하면 파일에 localhost 절대 URL이 박혀 깨진다. 그래서 로드 시 (절대 URL →
// 원본 경로) 매핑을 만들어 두고, 저장 시 직렬화된 절대 URL을 원본 경로로 되돌린다.

// 마크다운 이미지 링크에서 경로(target)를 뽑는 정규식. `![alt](target)` / `![alt](target "title")`.
const IMAGE_LINK_RE = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
// 링크/이미지의 `](target)` 또는 `](target "title")` 부분.
const LINK_TARGET_RE = /\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g;

const ABSOLUTE_URL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const DATA_URL_RE = /^data:/i;

export function collectImageUrlMap(md: string, baseUri: string): Map<string, string> {
  const map = new Map<string, string>();
  IMAGE_LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMAGE_LINK_RE.exec(md)) !== null) {
    const original = m[1];
    // 이미 절대 URL이거나 data URL이면 BlockNote가 재작성하지 않으므로 매핑 불필요
    if (ABSOLUTE_URL_RE.test(original) || DATA_URL_RE.test(original)) continue;
    try {
      const abs = new URL(original, baseUri).href;
      map.set(abs, original);
    } catch {
      /* 잘못된 경로는 건너뜀 */
    }
  }
  return map;
}

export function restoreImagePaths(md: string, map: Map<string, string>): string {
  if (map.size === 0) return md;
  return md.replace(LINK_TARGET_RE, (whole, url: string, title: string) => {
    const original = map.get(url);
    return original ? `](${original}${title})` : whole;
  });
}
