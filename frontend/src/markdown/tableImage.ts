// 테이블 셀 이미지 지원 (표시 전용 + 무손실 라운드트립)
//
// BlockNote 테이블 셀(tableParagraph)은 content: "inline*" 이라 블록 레벨 image 노드를
// 담을 수 없어, 마크다운 파싱 시 셀 안 이미지가 드롭된다. 이를 우회하기 위해 파싱 직전
// 셀 이미지를 마크다운 무해 토큰 텍스트로 마스킹하고(파서가 텍스트로 보존), 파싱 후
// 셀 인라인의 토큰을 inlineImage 커스텀 인라인 콘텐츠로 복원한다. 저장은 역방향.

export interface TableImage {
  url: string;
  alt: string;
  title: string;
}

// 토큰: .MKRAIMG.<base64url(JSON)>.  — base64url 알파벳(A-Za-z0-9-_)은 마크다운/파이프에
// 무해하고, 구분자 '.' 은 base64url 에 등장하지 않아 경계가 모호하지 않다.
const TOKEN_RE = /\.MKRAIMG\.([A-Za-z0-9_-]+)\./g;

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function encodeToken(img: TableImage): string {
  const bytes = new TextEncoder().encode(JSON.stringify(img));
  return `.MKRAIMG.${toBase64Url(bytes)}.`;
}

export function decodeToken(payload: string): TableImage {
  const json = new TextDecoder().decode(fromBase64Url(payload));
  const o = JSON.parse(json);
  return { url: o.url ?? '', alt: o.alt ?? '', title: o.title ?? '' };
}
