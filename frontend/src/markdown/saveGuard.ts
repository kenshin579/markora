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

// 외부 편집 클로버 가드: 저장 직전 디스크 내용이 markora의 마지막 동기화본과
// 달라졌다면(터미널/다른 프로세스가 편집), lossy 직렬화 결과가 디스크 내용을
// 잘라먹는 것을 막기 위해 더 민감한 줄 수 기준을 적용한다.
const EXTERNAL_LINE_SHRINK_RATIO = 0.3;
const MIN_ABSOLUTE_LINE_LOSS = 10;

function lineCount(s: string): number {
  return s.length === 0 ? 0 : s.split('\n').length;
}

// 문서 맨 앞(BOM 허용)의 `---\n ... \n---\n` 블록만 frontmatter로 인정.
// 본문 중간의 --- 구분선은 매칭되지 않는다.
const FRONTMATTER_RE = /^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n/;

export function hasFrontmatter(md: string): boolean {
  return FRONTMATTER_RE.test(md);
}

// previous: markora가 마지막으로 정상이라 판단한 내용(lastKnownContent)
// next:     이번에 저장하려는 직렬화 결과
// disk:     (선택) 저장 직전 디스크에서 다시 읽은 현재 본문. 외부 편집 클로버 검출용.
export function checkSaveSafety(previous: string, next: string, disk?: string): SaveGuardResult {
  const prevLen = previous.length;
  const lostChars = prevLen - next.length;
  const lostRatio = prevLen > 0 ? lostChars / prevLen : 0;

  // 1) frontmatter 파괴 감지: 원본엔 있었는데 저장본엔 사라짐/깨짐
  if (hasFrontmatter(previous) && !hasFrontmatter(next)) {
    return { safe: false, reason: 'frontmatter would be lost', lostChars, lostRatio };
  }

  // 2) 외부 편집 클로버 감지: 디스크가 마지막 동기화본과 달라졌다면(외부 편집),
  //    저장본(next)이 디스크 대비 대량의 줄/문자를 잃을 때 차단한다. 이 가드가
  //    previous 기준 검사(레이어 3)보다 먼저 동작해야 stale한 previous 때문에
  //    50% 미만으로 보이는 외부 클로버(예: 디스크 621줄 → 346줄)를 잡을 수 있다.
  if (disk !== undefined && disk !== previous) {
    const diskLines = lineCount(disk);
    const nextLines = lineCount(next);
    const lostLines = diskLines - nextLines;
    const lostLineRatio = diskLines > 0 ? lostLines / diskLines : 0;
    const diskLostChars = disk.length - next.length;
    const diskLostRatio = disk.length > 0 ? diskLostChars / disk.length : 0;
    const lineLoss = lostLines >= MIN_ABSOLUTE_LINE_LOSS && lostLineRatio >= EXTERNAL_LINE_SHRINK_RATIO;
    const charLoss = diskLostChars >= MIN_ABSOLUTE_LOSS && diskLostRatio >= SHRINK_RATIO;
    if (lineLoss || charLoss) {
      return {
        safe: false,
        reason: `external edit would be overwritten (disk ${diskLines} lines → ${nextLines} lines)`,
        lostChars: diskLostChars,
        lostRatio: diskLostRatio,
      };
    }
  }

  // 3) 대량 내용 손실 감지 (예: HTML 블록 삭제로 문서 절반 이상 증발)
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
