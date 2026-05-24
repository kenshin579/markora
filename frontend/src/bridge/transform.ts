// 브릿지 경계 문자열 변환 (옵션 B: 비편집 영역 보존)
//
// BlockNote의 마크다운 라운드트립은 YAML frontmatter를 파괴한다(예: `---` → `***`).
// frontmatter는 편집 대상이 아니므로, 로드 시 본문과 분리해 보관하고 저장 시 본문 앞에
// 그대로 다시 붙인다. 이렇게 하면 frontmatter가 BlockNote를 거치지 않아 손상되지 않는다.

const FRONTMATTER_RE = /^(﻿?---\r?\n[\s\S]*?\r?\n---\r?\n)/;

export interface SplitResult {
  frontmatter: string; // 구분자/줄바꿈 포함, 없으면 ''
  body: string;
}

export function splitFrontmatter(md: string): SplitResult {
  const m = FRONTMATTER_RE.exec(md);
  if (!m) return { frontmatter: '', body: md };
  return { frontmatter: m[1], body: md.slice(m[1].length) };
}

export function joinFrontmatter(frontmatter: string, body: string): string {
  return frontmatter ? frontmatter + body : body;
}
