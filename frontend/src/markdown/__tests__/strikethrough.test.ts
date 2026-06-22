import { describe, it, expect } from 'vitest';
import { escapeSingleTildes, unescapeTildes } from '../strikethrough';

describe('escapeSingleTildes', () => {
  it('고립된 단일 틸드를 \\~ 로 이스케이프', () => {
    expect(escapeSingleTildes('속도(0.4~1.0)')).toBe('속도(0.4\\~1.0)');
  });

  it('한 줄에 여러 단일 틸드를 모두 이스케이프', () => {
    expect(escapeSingleTildes('시간(30~300s), 민감도(0~2)'))
      .toBe('시간(30\\~300s), 민감도(0\\~2)');
  });

  it('~~strike~~ (이중 틸드)는 보존', () => {
    expect(escapeSingleTildes('진짜 ~~취소선~~ 입니다'))
      .toBe('진짜 ~~취소선~~ 입니다');
  });

  it('~~strike~~ 내부의 단일 틸드만 이스케이프', () => {
    expect(escapeSingleTildes('~~a~b~~')).toBe('~~a\\~b~~');
  });

  it('~~~ 런(길이 3)은 보존', () => {
    expect(escapeSingleTildes('x ~~~ y')).toBe('x ~~~ y');
  });

  it('이미 이스케이프된 \\~ 는 이중 이스케이프하지 않음', () => {
    expect(escapeSingleTildes('a\\~b')).toBe('a\\~b');
  });

  it('인라인 코드스팬 내부 틸드는 변형하지 않음', () => {
    expect(escapeSingleTildes('값 `a~b` 끝')).toBe('값 `a~b` 끝');
  });

  it('코드스팬 밖 틸드는 이스케이프, 안쪽은 보존', () => {
    expect(escapeSingleTildes('x~y `a~b` z~w'))
      .toBe('x\\~y `a~b` z\\~w');
  });

  it('펜스 코드블록 내부는 변형하지 않음', () => {
    const md = '```\nlet a~b = 1;\n```';
    expect(escapeSingleTildes(md)).toBe(md);
  });

  it('펜스 밖 단락의 틸드는 이스케이프', () => {
    const input = '범위 0~9\n\n```\na~b\n```';
    const expected = '범위 0\\~9\n\n```\na~b\n```';
    expect(escapeSingleTildes(input)).toBe(expected);
  });

  it('blockquote 내부 코드펜스의 틸드는 변형하지 않음', () => {
    const md = '> ```\n> let a~b = 1;\n> ```';
    expect(escapeSingleTildes(md)).toBe(md);
  });

  it('blockquote 내부 일반 텍스트의 단일 틸드는 이스케이프', () => {
    expect(escapeSingleTildes('> 범위 0~9')).toBe('> 범위 0\\~9');
  });
});

describe('unescapeTildes', () => {
  it('\\~ 를 ~ 로 복원', () => {
    expect(unescapeTildes('속도(0.4\\~1.0)')).toBe('속도(0.4~1.0)');
  });

  it('~~strike~~ 는 영향 없음', () => {
    expect(unescapeTildes('진짜 ~~취소선~~ 입니다'))
      .toBe('진짜 ~~취소선~~ 입니다');
  });

  it('펜스 코드블록 내부의 \\~ 는 복원하지 않음 (verbatim 보존)', () => {
    const md = '```\nliteral \\~ here\n```';
    expect(unescapeTildes(md)).toBe(md);
  });

  it('인라인 코드스팬 내부의 \\~ 는 복원하지 않음', () => {
    expect(unescapeTildes('값 `\\~` 끝')).toBe('값 `\\~` 끝');
  });

  it('사용자 작성 \\~ 도 ~ 로 정규화된다 (의도된 무손실 동작)', () => {
    expect(unescapeTildes('a\\~b')).toBe('a~b');
  });
});

describe('escape → unescape round-trip', () => {
  it('단일 틸드 텍스트는 원문으로 복원', () => {
    const src = '속도(0.4~1.0), 시간(30~300s)';
    expect(unescapeTildes(escapeSingleTildes(src))).toBe(src);
  });

  it('~~strike~~ 도 원문 그대로', () => {
    const src = '진짜 ~~취소선~~ 과 범위 0~9';
    expect(unescapeTildes(escapeSingleTildes(src)))
      .toBe('진짜 ~~취소선~~ 과 범위 0~9');
  });
});
