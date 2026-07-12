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

// blockquote.ts / strikethrough.ts 와 동일한 펜스 판정.
const FENCE_RE = /^ {0,3}(```|~~~)/;
// GFM 구분행: 셀마다 optional colon + 하이픈. 최소 한 개의 '-' 포함.
const DELIM_ROW_RE = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
// 마크다운 이미지 ![alt](target "title"?). target 은 공백 없는 토큰.
const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;

function isTableRow(line: string): boolean {
  return line.includes('|') && line.trim() !== '';
}

function maskImagesInLine(line: string): string {
  return line.replace(IMAGE_RE, (_m, alt: string, url: string, title?: string) =>
    encodeToken({ url, alt: alt ?? '', title: title ?? '' }));
}

// GFM 테이블 블록(헤더행 + 구분행 + 본문행)을 라인 스캔으로 식별하고, 그 안의
// 마크다운 이미지만 토큰으로 치환한다. 코드펜스 내부는 제외.
export function maskTableImages(md: string): string {
  const lines = md.split('\n');
  let inFence = false;
  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE_RE.test(line)) { inFence = !inFence; inTable = false; continue; }
    if (inFence) continue;
    if (!inTable) {
      // 헤더행 조건: 현재 줄이 파이프 행이고 다음 줄이 구분행.
      if (isTableRow(line) && i + 1 < lines.length && DELIM_ROW_RE.test(lines[i + 1])) {
        inTable = true;
      }
    } else if (!isTableRow(line)) {
      // 빈 줄/비-행에서 테이블 종료.
      inTable = false;
      continue;
    }
    if (inTable) lines[i] = maskImagesInLine(line);
  }
  return lines.join('\n');
}

// alt/url/title 은 항상 IMAGE_RE(maskTableImages) 유래라 title 에 " 가 없고 url 에 공백/`)`이
// 없다. 그래서 이스케이프 없이 보간해도 유효한 마크다운 이미지가 나온다.
export function unmaskTableImages(md: string): string {
  return md.replace(TOKEN_RE, (m, payload: string) => {
    try {
      const { url, alt, title } = decodeToken(payload);
      return title ? `![${alt}](${url} "${title}")` : `![${alt}](${url})`;
    } catch {
      return m; // 우리 토큰이 아니거나 손상됨 — 원문 그대로 둔다
    }
  });
}

type InlineNode =
  | { type: 'text'; text: string; styles: Record<string, any> }
  | { type: 'inlineImage'; props: { url: string; alt: string; title: string } }
  | { type: string; [k: string]: any };

// splitInlineMath 대칭: 텍스트 노드의 토큰을 text | inlineImage | text 로 분리.
// 한계: inlineImage 는 스타일을 보유하지 않으므로, 스타일된 셀 텍스트 안 이미지의
// 스타일 라운드트립은 지원 범위 밖(표시 전용).
export function tokenTextToInline(nodes: InlineNode[]): InlineNode[] {
  const out: InlineNode[] = [];
  for (const n of nodes) {
    if ((n as any).type !== 'text' || typeof (n as any).text !== 'string') { out.push(n); continue; }
    const text = (n as any).text as string;
    const styles = (n as any).styles;
    TOKEN_RE.lastIndex = 0;
    if (!TOKEN_RE.test(text)) { out.push(n); continue; }
    TOKEN_RE.lastIndex = 0;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = TOKEN_RE.exec(text)) !== null) {
      if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index), styles });
      try {
        const { url, alt, title } = decodeToken(m[1]);
        out.push({ type: 'inlineImage', props: { url, alt, title } });
      } catch {
        out.push({ type: 'text', text: m[0], styles }); // 손상 토큰은 리터럴 텍스트로 보존
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ type: 'text', text: text.slice(last), styles });
  }
  return out;
}

// joinInlineMath 대칭: inlineImage 를 토큰 텍스트로 직렬화하고 인접 텍스트와 병합.
export function inlineToTokenText(nodes: InlineNode[]): InlineNode[] {
  const out: InlineNode[] = [];
  for (const n of nodes) {
    let serialized: InlineNode;
    if ((n as any).type === 'inlineImage') {
      const p = (n as any).props ?? {};
      serialized = { type: 'text', text: encodeToken({ url: p.url ?? '', alt: p.alt ?? '', title: p.title ?? '' }), styles: {} };
    } else if ((n as any).type === 'text') {
      serialized = { type: 'text', text: (n as any).text, styles: (n as any).styles };
    } else {
      out.push(n);
      continue;
    }
    const prev = out[out.length - 1] as any;
    if (prev && prev.type === 'text' && (serialized as any).type === 'text' &&
        JSON.stringify(prev.styles) === JSON.stringify((serialized as any).styles)) {
      out[out.length - 1] = { type: 'text', text: prev.text + (serialized as any).text, styles: prev.styles };
    } else {
      out.push(serialized);
    }
  }
  return out;
}
