import { describe, it, expect } from 'vitest';
import { findMatches } from '../findMatches';

const opts = (o: Partial<{ caseSensitive: boolean; wholeWord: boolean }> = {}) => ({
  caseSensitive: o.caseSensitive ?? false,
  wholeWord: o.wholeWord ?? false,
});

describe('findMatches', () => {
  it('empty query returns no matches', () => {
    expect(findMatches('hello world', '', opts())).toEqual([]);
  });

  it('finds a single substring match (case-insensitive default)', () => {
    expect(findMatches('Hello world', 'hello', opts())).toEqual([{ start: 0, end: 5 }]);
  });

  it('finds multiple non-overlapping matches', () => {
    expect(findMatches('aXaXa', 'aX', opts())).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });

  it('does not produce overlapping matches', () => {
    // "aa" in "aaa" yields one match at 0..2, then continues from 2 (no match)
    expect(findMatches('aaa', 'aa', opts())).toEqual([{ start: 0, end: 2 }]);
  });

  it('case-sensitive excludes differently-cased text', () => {
    expect(findMatches('Hello hello', 'hello', opts({ caseSensitive: true }))).toEqual([
      { start: 6, end: 11 },
    ]);
  });

  it('whole-word matches only word-boundaried occurrences', () => {
    // "cat" matches the standalone word but not inside "category"
    expect(findMatches('cat category cat.', 'cat', opts({ wholeWord: true }))).toEqual([
      { start: 0, end: 3 },
      { start: 13, end: 16 },
    ]);
  });

  it('whole-word treats start/end of string as boundaries', () => {
    expect(findMatches('cat', 'cat', opts({ wholeWord: true }))).toEqual([{ start: 0, end: 3 }]);
  });

  it('returns no matches when query absent', () => {
    expect(findMatches('hello', 'zzz', opts())).toEqual([]);
  });
});
