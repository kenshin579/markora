// 저장 직전 손실 가드 (옵션 C: 즉시 출혈 방지)
//
// blocksToMarkdownLossy 라운드트립은 BlockNote가 모델링하지 못하는 구조
// (YAML frontmatter, HTML 블록 등)를 삭제·파괴한다. Editor는 편집이 일어날 때마다
// 문서 전체를 이 손실 변환으로 재직렬화해 파일을 통째로 덮어쓰므로, 한 번의 사소한
// 편집만으로도 frontmatter/내용이 영구히 손실될 수 있다.
//
// 이 가드는 저장 직전 직렬화 결과(next)를 마지막으로 알려진 정상 내용(previous)과
// 비교하여 명백한 손실이 감지되면 저장을 차단한다. 근본 해결(손실 없는 직렬화)이
// 아니라, 데이터 파괴를 멈추기 위한 안전장치다.

export interface SaveGuardResult {
  safe: boolean;
  reason?: string;
  lostChars: number;
  lostRatio: number;
}

// previous 대비 이 비율 이상 사라지고(SHRINK_RATIO) 절대 손실도 MIN_ABSOLUTE_LOSS자
// 이상일 때만 차단한다. 작은 문서에서의 정상적인 대량 삭제 오탐을 줄이기 위함.
const SHRINK_RATIO = 0.5;
const MIN_ABSOLUTE_LOSS = 50;

// 문서 맨 앞(BOM 허용)의 `---\n ... \n---\n` 블록만 frontmatter로 인정.
// 본문 중간의 --- 구분선은 매칭되지 않는다.
const FRONTMATTER_RE = /^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n/;

export function hasFrontmatter(md: string): boolean {
  return FRONTMATTER_RE.test(md);
}

export function checkSaveSafety(previous: string, next: string): SaveGuardResult {
  const prevLen = previous.length;
  const lostChars = prevLen - next.length;
  const lostRatio = prevLen > 0 ? lostChars / prevLen : 0;

  // 1) frontmatter 파괴 감지: 원본엔 있었는데 저장본엔 사라짐/깨짐
  if (hasFrontmatter(previous) && !hasFrontmatter(next)) {
    return { safe: false, reason: 'frontmatter would be lost', lostChars, lostRatio };
  }

  // 2) 대량 내용 손실 감지 (예: HTML 블록 삭제로 문서 절반 이상 증발)
  if (lostChars >= MIN_ABSOLUTE_LOSS && lostRatio >= SHRINK_RATIO) {
    return {
      safe: false,
      reason: `large content loss (${lostChars} chars, ${Math.round(lostRatio * 100)}%)`,
      lostChars,
      lostRatio,
    };
  }

  return { safe: true, lostChars, lostRatio };
}
