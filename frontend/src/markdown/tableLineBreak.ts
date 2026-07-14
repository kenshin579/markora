// 테이블 셀 개행(<br>) 무손실 라운드트립.
//
// BlockNote 의 markdown 파서는 셀 안 <br> 을 드롭하고(단어가 붙어 데이터 손상),
// 직렬화 시 셀 텍스트의 \n 을 공백으로 뭉갠다. 이를 우회하기 위해 파싱 직전 테이블
// 라인의 <br> 변형을 무해 토큰으로 마스킹하고(파서가 텍스트로 보존), 파싱 후 셀
// 인라인 텍스트의 토큰을 \n 으로 복원한다(BlockNote 가 \n 을 <br> 로 렌더). 저장은 역방향.
// tableImage.ts 와 대칭 구조. 저장 형식은 항상 <br> 로 정규화한다.

import { mapTableLines } from './tableScan';

// 토큰: '.MKRABR.' — 캡슐화할 데이터가 없어 페이로드 없는 고정 문자열. '.'로 감싸
// base64url/일반 텍스트와 경계가 모호하지 않다(tableImage.ts 토큰 규약과 동일 철학).
const BREAK_TOKEN = '.MKRABR.';
const BREAK_TOKEN_RE = /\.MKRABR\./g;
// <br>, <br/>, <br />, 대소문자 무관.
const BR_TAG_RE = /<br[ \t]*\/?>/gi;

export function maskTableBreaks(md: string): string {
  return mapTableLines(md, (line) => line.replace(BR_TAG_RE, BREAK_TOKEN));
}

export function unmaskBreakTokens(md: string): string {
  return md.replace(BREAK_TOKEN_RE, '<br>');
}

type InlineNode =
  | { type: 'text'; text: string; styles: Record<string, any> }
  | { type: string; [k: string]: any };

// 셀 인라인 배열의 텍스트 노드에서 토큰을 \n 으로 치환. 비-텍스트 노드는 통과.
export function breakTokensToNewlines(nodes: InlineNode[]): InlineNode[] {
  return nodes.map((n) => {
    if ((n as any).type === 'text' && typeof (n as any).text === 'string') {
      return { ...(n as any), text: ((n as any).text as string).split(BREAK_TOKEN).join('\n') };
    }
    return n;
  });
}

// 역방향: 텍스트 노드의 \n 을 토큰으로 치환.
export function newlinesToBreakTokens(nodes: InlineNode[]): InlineNode[] {
  return nodes.map((n) => {
    if ((n as any).type === 'text' && typeof (n as any).text === 'string') {
      return { ...(n as any), text: ((n as any).text as string).split('\n').join(BREAK_TOKEN) };
    }
    return n;
  });
}
