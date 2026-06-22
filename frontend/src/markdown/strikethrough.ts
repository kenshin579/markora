// GFM 표준: strikethrough 는 ~~text~~ (이중 틸드)만 인정한다.
// 그러나 BlockNote 내부 remark-gfm 은 singleTilde 기본값이 true 라서 단일 ~ 도
// strikethrough 로 오인한다(예: 범위 표현 "0.4~1.0"). 옵션을 외부로 노출하지 않으므로
// 파싱 전 고립된 단일 틸드를 \~ 로 이스케이프하고, 직렬화 후 다시 ~ 로 복원한다.
// 두 변환 모두 코드펜스 / 인라인 코드스팬은 verbatim 으로 보존한다.

// blockquote.ts 와 동일한 펜스 판정(``` 또는 ~~~ 로 시작하는 줄).
const FENCE_RE = /^ {0,3}(```|~~~)/;

// "고립된 단일 틸드": 앞에 \(이스케이프) 도 ~ 도 없고, 뒤에 ~ 도 없는 ~ 한 개.
// → ~~ 이상의 런, 이미 이스케이프된 \~ 는 매칭되지 않는다.
const SINGLE_TILDE_RE = /(?<!\\)(?<!~)~(?!~)/g;

// 한 줄을 인라인 코드스팬(백틱 런으로 구분) 기준으로 나눠, 코드스팬이 아닌
// 텍스트 구간에만 fn 을 적용한다. 닫는 백틱 런이 없으면 백틱을 리터럴로 취급한다.
function applyOutsideInlineCode(line: string, fn: (text: string) => string): string {
  const parts = line.split(/(`+)/); // [text, backticks, text, backticks, ...]
  let out = '';
  let i = 0;
  while (i < parts.length) {
    if (i % 2 === 0) {
      out += fn(parts[i]); // 텍스트 구간
      i += 1;
      continue;
    }
    const open = parts[i]; // 백틱 런
    let j = i + 2;
    while (j < parts.length && parts[j] !== open) j += 2; // 동일 길이 닫는 런 탐색
    if (j < parts.length) {
      out += parts.slice(i, j + 1).join(''); // 코드스팬 전체 verbatim
      i = j + 1;
    } else {
      out += open; // 닫는 런 없음 → 백틱 리터럴, 다음 구간 계속 처리
      i += 1;
    }
  }
  return out;
}

// 펜스 블록 밖의 텍스트 구간에만 fn 을 적용하는 공통 순회.
function transformOutsideCode(md: string, fn: (text: string) => string): string {
  let inFence = false;
  return md
    .split('\n')
    .map(line => {
      // blockquote 마커(`>`)를 벗긴 뒤 펜스 여부를 판정한다.
      // escapeSingleTildes 는 splitRuns/stripQuotePrefix 이전 전체 본문에 적용되므로,
      // `> ``` 처럼 blockquote 안에 있는 코드펜스도 여기서 인식해야 내부 틸드를 보존한다.
      const unquoted = line.replace(/^( {0,3}>)+ ?/, '');
      if (FENCE_RE.test(unquoted)) { inFence = !inFence; return line; }
      if (inFence) return line;
      return applyOutsideInlineCode(line, fn);
    })
    .join('\n');
}

// 파싱 전: 고립된 단일 틸드를 \~ 로 이스케이프한다.
export function escapeSingleTildes(md: string): string {
  return transformOutsideCode(md, t => t.replace(SINGLE_TILDE_RE, '\\~'));
}

// 직렬화 후: \~ 를 다시 리터럴 ~ 로 복원한다(파일에 \~ 오염 방지).
// 주의: 사용자가 직접 쓴 \~ 도 ~ 로 정규화된다. 수정된 파이프라인에서는 ~ 와 \~ 가
// 동일하게 리터럴 ~ 로 렌더링되므로 시맨틱상 무손실이다(잉여 이스케이프 제거).
export function unescapeTildes(md: string): string {
  return transformOutsideCode(md, t => t.replace(/\\~/g, '~'));
}
