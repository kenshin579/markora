export interface MatchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
}

export interface RawMatch {
  /** inclusive start offset in the source string */
  start: number;
  /** exclusive end offset in the source string */
  end: number;
}

const WORD_CHAR = /[A-Za-z0-9_]/;

function isBoundary(text: string, index: number): boolean {
  // index is just outside the match (before start, or at end position)
  if (index < 0 || index >= text.length) return true;
  return !WORD_CHAR.test(text[index]);
}

/**
 * Find non-overlapping occurrences of `query` in `text`.
 * Pure string-level matching — no regex, no DOM. Returns offsets in order.
 */
export function findMatches(text: string, query: string, options: MatchOptions): RawMatch[] {
  if (!query) return [];

  const haystack = options.caseSensitive ? text : text.toLowerCase();
  const needle = options.caseSensitive ? query : query.toLowerCase();

  const matches: RawMatch[] = [];
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    const end = idx + needle.length;
    if (
      !options.wholeWord ||
      (isBoundary(text, idx - 1) && isBoundary(text, end))
    ) {
      matches.push({ start: idx, end });
    }
    // advance at least one char to guarantee termination and non-overlap
    from = end > idx ? end : idx + 1;
  }
  return matches;
}
