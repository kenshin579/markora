import { describe, it, expect } from 'vitest';
import { mapTableLines } from '../tableScan';

describe('mapTableLines', () => {
  it('테이블 본문행에만 mapLine 을 적용하고 테이블 밖은 원문 유지', () => {
    const md = ['before x', '| A | B |', '| --- | --- |', '| x | y |', '', 'after x'].join('\n');
    const out = mapTableLines(md, (line) => line.replace(/x/g, 'X'));
    const lines = out.split('\n');
    expect(lines[0]).toBe('before x');   // 테이블 밖
    expect(lines[3]).toBe('| X | y |');  // 본문행 — 적용됨
    expect(lines[5]).toBe('after x');    // 테이블 밖
  });

  it('코드펜스 내부의 테이블 모양 라인은 건드리지 않는다', () => {
    const md = ['```', '| A |', '| --- |', '| x |', '```'].join('\n');
    const out = mapTableLines(md, (line) => line.replace(/x/g, 'X'));
    expect(out).toContain('| x |');
  });

  it('파이프만 있고 구분행이 없는 단락은 테이블로 오인하지 않는다', () => {
    const md = 'a | b x c | d';
    expect(mapTableLines(md, (line) => line.replace(/x/g, 'X'))).toBe('a | b x c | d');
  });

  it('CRLF 테이블도 본문행에 적용된다', () => {
    const md = '| A |\r\n| --- |\r\n| x |';
    const out = mapTableLines(md, (line) => line.replace(/x/g, 'X'));
    expect(out).toContain('| X |');
  });
});
