// GFM 테이블 라인 스캐너 (tableImage.ts / tableLineBreak.ts 공용)
//
// GFM 테이블 블록(헤더행 + 구분행 + 본문행) 내부의 라인에만 mapLine 을 적용한다.
// 코드펜스 내부는 제외하고, 그 외 라인은 원문 그대로 통과시킨다.

// blockquote.ts / strikethrough.ts 와 동일한 펜스 판정.
const FENCE_RE = /^ {0,3}(```|~~~)/;
// GFM 구분행: 셀마다 optional colon + 하이픈. 최소 한 개의 '-' 포함.
const DELIM_ROW_RE = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

function isTableRow(line: string): boolean {
  return line.includes('|') && line.trim() !== '';
}

// CRLF/CR → LF 정규화 후 스캔한다. 이 함수는 RAW 본문에 먼저 도는데(하위 파이프라인의
// CRLF 정규화보다 앞섬), 정규화하지 않으면 DELIM_ROW_RE 의 `$`(m 플래그 없음)가 trailing
// `\r` 앞에서 매칭에 실패해 CRLF 테이블을 놓친다. 하위 파이프라인이 어차피 동일하게
// 정규화하므로 LF 입력은 무변화.
// 한계: blockquote 안에 중첩된 테이블(`> | --- |`)은 구분행이 매칭되지 않아 감지하지 않는다.
export function mapTableLines(md: string, mapLine: (line: string) => string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
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
    if (inTable) lines[i] = mapLine(line);
  }
  return lines.join('\n');
}
