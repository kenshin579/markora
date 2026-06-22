import { describe, it, expect } from 'vitest';
import { escapeSingleTildes } from '../customParse';

describe('escapeSingleTildes', () => {
  it('단일 틸드(범위 표기)를 이스케이프', () => {
    expect(escapeSingleTildes('p2p 속도(0.4~1.0)')).toBe('p2p 속도(0.4\\~1.0)');
  });

  it('이중 틸드(취소선)는 보존', () => {
    expect(escapeSingleTildes('~~취소선~~')).toBe('~~취소선~~');
  });

  it('이미 이스케이프된 \\~ 는 이중 이스케이프 안 함', () => {
    expect(escapeSingleTildes('a \\~ b')).toBe('a \\~ b');
  });

  it('``` 펜스 내부는 변환하지 않음', () => {
    const md = '```\n0.4~1.0\n```';
    expect(escapeSingleTildes(md)).toBe(md);
  });

  it('~~~ 펜스(마커 + 내부)는 변환하지 않음', () => {
    const md = '~~~\n0.4~1.0\n~~~';
    expect(escapeSingleTildes(md)).toBe(md);
  });

  it('인라인 코드 스팬 내부는 변환하지 않음', () => {
    expect(escapeSingleTildes('값 `0.4~1.0` 끝')).toBe('값 `0.4~1.0` 끝');
  });

  it('표 행의 여러 범위를 모두 이스케이프', () => {
    const line = '| `NAVIGATION` | 9 | p2p 속도(0.4~1.0), 대기(30~300s) |';
    const out = escapeSingleTildes(line);
    expect(out).toContain('0.4\\~1.0');
    expect(out).toContain('30\\~300s');
  });
});
