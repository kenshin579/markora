import { describe, it, expect } from 'vitest';
import { buildSearchIndex, rangeToPos } from '../searchIndex';

// Minimal fake of a ProseMirror doc. Each entry is visited in order with its pos.
// kind: 'block' marks a textblock boundary; 'text' contributes characters.
type FakeEntry =
  | { kind: 'block'; pos: number }
  | { kind: 'text'; pos: number; text: string };

function fakeDoc(entries: FakeEntry[]) {
  return {
    descendants(fn: (node: any, pos: number) => void) {
      for (const e of entries) {
        if (e.kind === 'block') {
          fn({ isTextblock: true, isText: false, text: undefined }, e.pos);
        } else {
          fn({ isTextblock: false, isText: true, text: e.text }, e.pos);
        }
      }
    },
  } as any;
}

describe('buildSearchIndex', () => {
  it('produces one segment per textblock with correct positions', () => {
    // Paragraph "ab" starting at pos 1, then paragraph "cd" starting at pos 5.
    const doc = fakeDoc([
      { kind: 'block', pos: 0 },
      { kind: 'text', pos: 1, text: 'ab' },
      { kind: 'block', pos: 4 },
      { kind: 'text', pos: 5, text: 'cd' },
    ]);
    const index = buildSearchIndex(doc);
    expect(index).toEqual([
      { text: 'ab', positions: [1, 2] },
      { text: 'cd', positions: [5, 6] },
    ]);
  });

  it('concatenates multiple text nodes within one block (e.g. across marks)', () => {
    // "he" at pos 1, "llo" at pos 3 -> one block "hello"
    const doc = fakeDoc([
      { kind: 'block', pos: 0 },
      { kind: 'text', pos: 1, text: 'he' },
      { kind: 'text', pos: 3, text: 'llo' },
    ]);
    expect(buildSearchIndex(doc)).toEqual([
      { text: 'hello', positions: [1, 2, 3, 4, 5] },
    ]);
  });

  it('ignores text appearing before any textblock', () => {
    const doc = fakeDoc([{ kind: 'text', pos: 1, text: 'x' }]);
    expect(buildSearchIndex(doc)).toEqual([]);
  });

  it('prevents cross-block matches by keeping blocks as separate segments', () => {
    // block1 contains "a" at pos 1; block2 contains "b" at pos 4.
    // The resulting index must be two separate segments, NOT one "ab" segment,
    // so a query like "ab" can never span the block boundary.
    const doc = fakeDoc([
      { kind: 'block', pos: 0 },
      { kind: 'text', pos: 1, text: 'a' },
      { kind: 'block', pos: 3 },
      { kind: 'text', pos: 4, text: 'b' },
    ]);
    const index = buildSearchIndex(doc);
    expect(index).toEqual([
      { text: 'a', positions: [1] },
      { text: 'b', positions: [4] },
    ]);
  });
});

describe('rangeToPos', () => {
  it('maps a string-offset match to PM from/to', () => {
    const segment = { text: 'hello', positions: [1, 2, 3, 4, 5] };
    // match "ell" => start 1, end 4 (exclusive)
    expect(rangeToPos(segment, { start: 1, end: 4 })).toEqual({ from: 2, to: 5 });
  });

  it('maps a single-char match', () => {
    const segment = { text: 'ab', positions: [10, 11] };
    expect(rangeToPos(segment, { start: 0, end: 1 })).toEqual({ from: 10, to: 11 });
  });
});
