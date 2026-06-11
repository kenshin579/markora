export type Run = { kind: 'quote' | 'plain'; text: string };

const QUOTE_LINE_RE = /^ {0,3}>/;
const FENCE_RE = /^ {0,3}(```|~~~)/;

// 원문을 줄 단위로 훑어 연속된 blockquote 줄 / 일반 줄 구간(run)으로 나눈다.
// 코드펜스(``` 또는 ~~~) 내부의 '>' 줄은 blockquote로 오인하지 않는다.
export function splitRuns(body: string): Run[] {
  const lines = body.split('\n');
  const runs: Run[] = [];
  let cur: Run | null = null;
  let inFence = false;

  for (const line of lines) {
    if (FENCE_RE.test(line)) inFence = !inFence;
    const kind: Run['kind'] = !inFence && QUOTE_LINE_RE.test(line) ? 'quote' : 'plain';
    if (!cur || cur.kind !== kind) {
      cur = { kind, text: line };
      runs.push(cur);
    } else {
      cur.text += '\n' + line;
    }
  }
  return runs;
}

// 각 줄에서 blockquote 마커 1단계('>' + 공백 1개)만 제거한다.
// 나머지 들여쓰기는 보존되어 중첩 리스트 구조가 유지된다.
// '>' 단독 줄은 빈 줄이 된다. 중첩 blockquote('>>')는 1단계만 벗겨 내부 '>'가 남는다(의도적).
export function stripQuotePrefix(text: string): string {
  return text
    .split('\n')
    .map(line => {
      const m = line.match(/^ {0,3}>( ?)(.*)$/);
      return m ? m[2] : line;
    })
    .join('\n');
}
