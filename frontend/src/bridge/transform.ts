// 브릿지 경계 문자열 변환 (옵션 B: 비편집 영역 보존 + raw 편집)
//
// BlockNote의 마크다운 라운드트립은 YAML frontmatter를 파괴한다(예: `---` → `***`).
// frontmatter는 BlockNote를 거치지 않는다: 로드 시 펜스(`---`) 안쪽 inner YAML만 떼어
// 패널에서 편집하고, 저장 시 다시 펜스로 감싸 본문 앞에 붙인다. inner YAML이 비어 있으면
// frontmatter를 통째로 생략한다(= 삭제). 펜스/BOM은 정규화되어 LF로 직렬화된다.

// 문서 맨 앞(BOM 허용)의 `---\n ... \n---\n` 블록만 frontmatter로 인정.
// 캡처 그룹 1 = 펜스 사이 inner YAML. 본문 중간의 --- 구분선은 매칭되지 않는다.
// 알려진 한계: YAML block scalar 내에 bare `---` 줄이 있거나, 빈 줄 없이
// `---\n---\n`(zero-line block)로 시작하는 문서는 frontmatter로 인식되지 않는다 —
// 정규식 기반 파싱의 허용된 제한 사항이다.
const FRONTMATTER_RE = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n/;

export interface SplitResult {
  frontmatter: string; // 펜스/BOM 없는 inner YAML, 없으면 ''
  body: string;
}

export function splitFrontmatter(md: string): SplitResult {
  const m = FRONTMATTER_RE.exec(md);
  if (!m) return { frontmatter: '', body: md };
  return { frontmatter: m[1], body: md.slice(m[0].length) };
}

/**
 * inner YAML(펜스/BOM 없음)을 받아 `---\n…\n---\n`로 재조립한다.
 * 비거나 공백뿐이면 body만 반환(= frontmatter 삭제). inner는 trim 후 사용.
 */
export function joinFrontmatter(frontmatter: string, body: string): string {
  const inner = frontmatter.trim();
  if (inner === '') return body;
  return `---\n${inner}\n---\n${body}`;
}
