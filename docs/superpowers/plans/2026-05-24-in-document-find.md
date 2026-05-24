# In-Document Find Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a VS Code–style in-document Find bar (Cmd/Ctrl+F) to the markora WYSIWYG editor that highlights and navigates matches in the visible text of the currently open document.

**Architecture:** A pure string matcher (`findMatches`) and a ProseMirror document→text indexer (`buildSearchIndex`) feed a ProseMirror decoration plugin (`searchPlugin`) that paints highlights without mutating document content. A React `SearchBar` drives the plugin via command helpers and shows the match count. `Editor.tsx` opens/closes the bar on Cmd/Ctrl+F / Esc and registers the plugin on `editor.prosemirrorView`.

**Tech Stack:** React 18, BlockNote 0.49 (on ProseMirror), prosemirror-state/view/model, Vitest + @testing-library/react.

---

## File Structure

- `frontend/src/search/findMatches.ts` (create) — pure match algorithm over a string.
- `frontend/src/search/searchIndex.ts` (create) — walk a ProseMirror doc into per-block text segments with PM position maps; map string offsets back to PM ranges.
- `frontend/src/search/searchPlugin.ts` (create) — ProseMirror plugin + key + command helpers (`setSearch`, `gotoNext`, `gotoPrev`, `clearSearch`).
- `frontend/src/search/SearchBar.tsx` (create) — the top find bar UI.
- `frontend/src/search/__tests__/findMatches.test.ts` (create)
- `frontend/src/search/__tests__/searchIndex.test.ts` (create)
- `frontend/src/search/__tests__/SearchBar.test.tsx` (create)
- `frontend/src/editor/Editor.tsx` (modify) — wire plugin, Cmd/Ctrl+F state, render SearchBar.
- `frontend/src/styles.css` (modify) — highlight + bar styles.
- `frontend/package.json` (modify) — pin prosemirror-state/view/model as direct deps.

**Working directory for all commands:** `frontend/` (i.e. `cd /Users/user/src/workspace_markora/markora/frontend`).

---

## Task 1: Pin ProseMirror packages as direct dependencies

These are currently transitive deps of BlockNote. The new code imports them directly, so declare them explicitly at their installed versions.

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Add the three packages to `dependencies`**

In `frontend/package.json`, inside the `"dependencies"` object, add these three entries (keep alphabetical-ish grouping near the other libs; exact versions match what is already installed):

```json
    "prosemirror-model": "^1.25.4",
    "prosemirror-state": "^1.4.4",
    "prosemirror-view": "^1.41.8",
```

- [ ] **Step 2: Verify they resolve (already in node_modules)**

Run: `node -e "require.resolve('prosemirror-state'); require.resolve('prosemirror-view'); require.resolve('prosemirror-model'); console.log('ok')"`
Expected: prints `ok` (no install needed — they are already present transitively).

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json
git commit -m "build(frontend): pin prosemirror-state/view/model as direct deps"
```

---

## Task 2: `findMatches` pure string matcher

The core algorithm. Given a single string and a query, return match ranges as string offsets `{ start, end }` (end exclusive). Options: `caseSensitive`, `wholeWord`. No regex. Matches never overlap (scan continues from the end of each match).

**Files:**
- Create: `frontend/src/search/findMatches.ts`
- Test: `frontend/src/search/__tests__/findMatches.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/search/__tests__/findMatches.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- findMatches`
Expected: FAIL — cannot resolve `../findMatches` / `findMatches is not a function`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/search/findMatches.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- findMatches`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/search/findMatches.ts frontend/src/search/__tests__/findMatches.test.ts
git commit -m "feat(frontend): add pure findMatches string matcher"
```

---

## Task 3: `buildSearchIndex` and `rangeToPos` (ProseMirror glue)

Walk a ProseMirror document into one text segment per textblock, each carrying a parallel array mapping every character to its absolute PM position. Splitting per textblock prevents matches from spanning block boundaries. `rangeToPos` converts a string-offset `RawMatch` (within one segment) into a PM `{ from, to }` range.

KaTeX/Mermaid blocks and inline math use `content: 'none'` (source lives in props, not text nodes), so they have no text nodes and are naturally excluded — no special-casing needed.

**Files:**
- Create: `frontend/src/search/searchIndex.ts`
- Test: `frontend/src/search/__tests__/searchIndex.test.ts`

- [ ] **Step 1: Write the failing test**

The test uses a minimal fake that mimics the parts of a ProseMirror `Node` we rely on (`descendants`, `isTextblock`, `isText`, `text`), so it runs without a real editor.

Create `frontend/src/search/__tests__/searchIndex.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- searchIndex`
Expected: FAIL — cannot resolve `../searchIndex`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/search/searchIndex.ts`:

```ts
import type { Node as PMNode } from 'prosemirror-model';
import type { RawMatch } from './findMatches';

export interface TextSegment {
  /** concatenated visible text of one textblock */
  text: string;
  /** positions[i] = absolute PM position of text[i] */
  positions: number[];
}

export interface PosRange {
  from: number;
  to: number;
}

/**
 * Walk a ProseMirror document into one TextSegment per textblock. Each text
 * node contributes its characters at consecutive PM positions (pos + offset).
 * Blocks without text (e.g. KaTeX/Mermaid, which store source in props) yield
 * empty segments and are skipped.
 */
export function buildSearchIndex(doc: PMNode): TextSegment[] {
  const segments: TextSegment[] = [];
  let current: TextSegment | null = null;

  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      current = { text: '', positions: [] };
      segments.push(current);
      return;
    }
    if (node.isText && current && typeof node.text === 'string') {
      const t = node.text;
      for (let i = 0; i < t.length; i++) {
        current.text += t[i];
        current.positions.push(pos + i);
      }
    }
  });

  return segments.filter((s) => s.text.length > 0);
}

/** Convert a string-offset match within a segment to a PM position range. */
export function rangeToPos(segment: TextSegment, match: RawMatch): PosRange {
  return {
    from: segment.positions[match.start],
    to: segment.positions[match.end - 1] + 1,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- searchIndex`
Expected: PASS (5 tests).

Note: `buildSearchIndex` pushes the new `current` segment before filtering empties at the end, so blocks that turn out to have no text are dropped by the final `.filter`. The "ignores text before any textblock" case passes because `current` is null until the first textblock.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/search/searchIndex.ts frontend/src/search/__tests__/searchIndex.test.ts
git commit -m "feat(frontend): add buildSearchIndex PM doc indexer + rangeToPos"
```

---

## Task 4: `searchPlugin` — ProseMirror decoration plugin + commands

A ProseMirror plugin holding search state and rendering decorations. Decoration-only: command transactions set plugin meta and never change the document, so auto-save/dirty tracking is untouched. Exposes command helpers used by the UI.

**Files:**
- Create: `frontend/src/search/searchPlugin.ts`

(No standalone unit test — this is editor glue verified via the SearchBar test and manual `runIde`. The matching/indexing logic it composes is already covered by Tasks 2–3.)

- [ ] **Step 1: Write the implementation**

Create `frontend/src/search/searchPlugin.ts`:

```ts
import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { findMatches, type MatchOptions } from './findMatches';
import { buildSearchIndex, rangeToPos, type PosRange } from './searchIndex';

export interface SearchState {
  query: string;
  options: MatchOptions;
  matches: PosRange[];
  /** index into matches of the active match, or -1 when none */
  current: number;
}

export interface SearchSummary {
  count: number;
  /** 1-based index of the active match, or 0 when none */
  current: number;
}

const EMPTY: SearchState = {
  query: '',
  options: { caseSensitive: false, wholeWord: false },
  matches: [],
  current: -1,
};

export const searchPluginKey = new PluginKey<SearchState>('markora-search');

type Meta =
  | { type: 'set'; query: string; options: MatchOptions }
  | { type: 'goto'; delta: number }
  | { type: 'clear' };

function computeMatches(state: EditorState, query: string, options: MatchOptions): PosRange[] {
  if (!query) return [];
  const segments = buildSearchIndex(state.doc);
  const ranges: PosRange[] = [];
  for (const seg of segments) {
    for (const m of findMatches(seg.text, query, options)) {
      ranges.push(rangeToPos(seg, m));
    }
  }
  return ranges;
}

function buildDecorations(state: EditorState, value: SearchState): DecorationSet {
  if (value.matches.length === 0) return DecorationSet.empty;
  const decos = value.matches.map((m, i) =>
    Decoration.inline(m.from, m.to, {
      class: i === value.current ? 'markora-search-current' : 'markora-search-match',
    }),
  );
  return DecorationSet.create(state.doc, decos);
}

/** Notify callback fired whenever the search summary changes. */
export function createSearchPlugin(onSummary: (s: SearchSummary) => void): Plugin<SearchState> {
  return new Plugin<SearchState>({
    key: searchPluginKey,
    state: {
      init: () => EMPTY,
      apply(tr: Transaction, value: SearchState, _old: EditorState, newState: EditorState): SearchState {
        const meta = tr.getMeta(searchPluginKey) as Meta | undefined;

        if (meta?.type === 'clear') {
          queueMicrotask(() => onSummary({ count: 0, current: 0 }));
          return EMPTY;
        }

        if (meta?.type === 'set') {
          const matches = computeMatches(newState, meta.query, meta.options);
          const current = matches.length > 0 ? 0 : -1;
          queueMicrotask(() => onSummary({ count: matches.length, current: current + 1 }));
          return { query: meta.query, options: meta.options, matches, current };
        }

        if (meta?.type === 'goto' && value.matches.length > 0) {
          const n = value.matches.length;
          const current = (value.current + meta.delta + n) % n;
          queueMicrotask(() => onSummary({ count: n, current: current + 1 }));
          return { ...value, current };
        }

        // Document changed while a search is active → recompute against new doc.
        if (tr.docChanged && value.query) {
          const matches = computeMatches(newState, value.query, value.options);
          const current = matches.length === 0 ? -1 : Math.min(value.current, matches.length - 1);
          queueMicrotask(() => onSummary({ count: matches.length, current: current + 1 }));
          return { ...value, matches, current };
        }

        return value;
      },
    },
    props: {
      decorations(state) {
        return buildDecorations(state, searchPluginKey.getState(state) ?? EMPTY);
      },
    },
  });
}

function scrollToCurrent(view: EditorView): void {
  const value = searchPluginKey.getState(view.state);
  if (!value || value.current < 0) return;
  const match = value.matches[value.current];
  if (!match) return;
  try {
    const dom = view.domAtPos(match.from).node as Node;
    const el = dom.nodeType === Node.ELEMENT_NODE ? (dom as Element) : dom.parentElement;
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } catch {
    /* position may be transiently invalid; ignore */
  }
}

// --- Command helpers (called by the UI) -----------------------------------

export function setSearch(view: EditorView, query: string, options: MatchOptions): void {
  view.dispatch(view.state.tr.setMeta(searchPluginKey, { type: 'set', query, options }));
  scrollToCurrent(view);
}

export function gotoNext(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(searchPluginKey, { type: 'goto', delta: 1 }));
  scrollToCurrent(view);
}

export function gotoPrev(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(searchPluginKey, { type: 'goto', delta: -1 }));
  scrollToCurrent(view);
}

export function clearSearch(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(searchPluginKey, { type: 'clear' }));
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: Vite build succeeds (TypeScript compiles). If `npm run build` is heavy, `npx tsc --noEmit -p tsconfig.json` also works.
Expected: no type errors referencing `searchPlugin.ts`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/search/searchPlugin.ts
git commit -m "feat(frontend): add ProseMirror search decoration plugin + commands"
```

---

## Task 5: `SearchBar` component

The VS Code–style top bar. Stateless about the document: it owns input/toggle state and reports changes through callbacks, displaying the count summary passed in by the parent.

**Files:**
- Create: `frontend/src/search/SearchBar.tsx`
- Test: `frontend/src/search/__tests__/SearchBar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/search/__tests__/SearchBar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchBar } from '../SearchBar';

function setup(overrides: Partial<React.ComponentProps<typeof SearchBar>> = {}) {
  const props = {
    summary: { count: 0, current: 0 },
    onSearch: vi.fn(),
    onNext: vi.fn(),
    onPrev: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<SearchBar {...props} />);
  return props;
}

describe('SearchBar', () => {
  it('fires onSearch with query and options as the user types', () => {
    const props = setup();
    fireEvent.change(screen.getByPlaceholderText('Find'), { target: { value: 'cat' } });
    expect(props.onSearch).toHaveBeenCalledWith('cat', { caseSensitive: false, wholeWord: false });
  });

  it('toggles case-sensitive and re-fires onSearch', () => {
    const props = setup();
    fireEvent.change(screen.getByPlaceholderText('Find'), { target: { value: 'cat' } });
    fireEvent.click(screen.getByRole('button', { name: /case sensitive/i }));
    expect(props.onSearch).toHaveBeenLastCalledWith('cat', { caseSensitive: true, wholeWord: false });
  });

  it('shows "n / total" when there are matches', () => {
    setup({ summary: { count: 12, current: 3 } });
    expect(screen.getByText('3 / 12')).toBeInTheDocument();
  });

  it('shows "No results" when query present but zero matches', () => {
    setup({ summary: { count: 0, current: 0 } });
    fireEvent.change(screen.getByPlaceholderText('Find'), { target: { value: 'zzz' } });
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('disables next/prev when there are no matches', () => {
    setup({ summary: { count: 0, current: 0 } });
    expect(screen.getByRole('button', { name: /next match/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /previous match/i })).toBeDisabled();
  });

  it('Enter triggers next, Shift+Enter triggers prev', () => {
    const props = setup({ summary: { count: 2, current: 1 } });
    const input = screen.getByPlaceholderText('Find');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onNext).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(props.onPrev).toHaveBeenCalledTimes(1);
  });

  it('Escape triggers onClose', () => {
    const props = setup();
    fireEvent.keyDown(screen.getByPlaceholderText('Find'), { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- SearchBar`
Expected: FAIL — cannot resolve `../SearchBar`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/search/SearchBar.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import type { MatchOptions } from './findMatches';
import type { SearchSummary } from './searchPlugin';

interface Props {
  summary: SearchSummary;
  onSearch: (query: string, options: MatchOptions) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

export function SearchBar({ summary, onSearch, onNext, onPrev, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus + select-all when the bar mounts.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Fire search whenever query or options change (debounced).
  useEffect(() => {
    const id = window.setTimeout(() => onSearch(query, { caseSensitive, wholeWord }), 100);
    return () => window.clearTimeout(id);
  }, [query, caseSensitive, wholeWord, onSearch]);

  const hasMatches = summary.count > 0;
  const hasQuery = query.length > 0;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) onPrev();
      else onNext();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="markora-search-bar" role="search">
      <input
        ref={inputRef}
        className="markora-search-input"
        placeholder="Find"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        className={`markora-search-toggle${caseSensitive ? ' is-active' : ''}`}
        aria-label="Case sensitive"
        aria-pressed={caseSensitive}
        onClick={() => setCaseSensitive((v) => !v)}
      >
        Aa
      </button>
      <button
        type="button"
        className={`markora-search-toggle${wholeWord ? ' is-active' : ''}`}
        aria-label="Whole word"
        aria-pressed={wholeWord}
        onClick={() => setWholeWord((v) => !v)}
      >
        W
      </button>
      <span className="markora-search-count">
        {hasMatches ? `${summary.current} / ${summary.count}` : hasQuery ? 'No results' : ''}
      </span>
      <button
        type="button"
        className="markora-search-nav"
        aria-label="Previous match"
        disabled={!hasMatches}
        onClick={onPrev}
      >
        ↑
      </button>
      <button
        type="button"
        className="markora-search-nav"
        aria-label="Next match"
        disabled={!hasMatches}
        onClick={onNext}
      >
        ↓
      </button>
      <button type="button" className="markora-search-close" aria-label="Close" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- SearchBar`
Expected: PASS (7 tests). Note the debounce uses fake-timer-free `setTimeout(…, 100)`; @testing-library `fireEvent.change` then the effect fires after 100ms. If a timing-sensitive test flakes, wrap the assertion in `await screen.findByText(...)` — but the provided tests assert on the synchronous `onSearch` callback via `toHaveBeenCalledWith`, which @testing-library flushes; if it flakes, switch those two assertions to `await vi.waitFor(() => expect(props.onSearch)...)`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/search/SearchBar.tsx frontend/src/search/__tests__/SearchBar.test.tsx
git commit -m "feat(frontend): add SearchBar find UI component"
```

---

## Task 6: Wire the plugin and bar into `Editor.tsx`

Register the plugin on the editor's ProseMirror view (via reconfigure-append), toggle the bar on Cmd/Ctrl+F, close on Esc, and route command callbacks to the plugin helpers.

**Files:**
- Modify: `frontend/src/editor/Editor.tsx`

- [ ] **Step 1: Add imports**

At the top of `frontend/src/editor/Editor.tsx`, alongside the existing imports, add:

```ts
import { SearchBar } from '../search/SearchBar';
import {
  createSearchPlugin,
  setSearch as pmSetSearch,
  gotoNext as pmGotoNext,
  gotoPrev as pmGotoPrev,
  clearSearch as pmClearSearch,
  type SearchSummary,
} from '../search/searchPlugin';
import type { MatchOptions } from '../search/findMatches';
```

- [ ] **Step 2: Add component state**

Inside `export function Editor({ bridge }: Props) {`, just after the existing `const [status, setStatus] = useState<string>('Ready');` line, add:

```ts
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchSummary, setSearchSummary] = useState<SearchSummary>({ count: 0, current: 0 });
```

- [ ] **Step 3: Register the plugin on the ProseMirror view**

Add a new `useEffect` after the theme-sync effects (anywhere inside the component body, before the `return`). It appends the search plugin once via reconfigure:

```ts
  // 검색 플러그인을 ProseMirror view에 한 번 등록 (데코레이션 전용 — 문서 변경 없음).
  useEffect(() => {
    const view = editor.prosemirrorView;
    if (!view) return;
    const plugin = createSearchPlugin(setSearchSummary);
    view.updateState(
      view.state.reconfigure({ plugins: [...view.state.plugins, plugin] }),
    );
    // 언마운트 시 플러그인 제거.
    return () => {
      const v = editor.prosemirrorView;
      if (!v) return;
      v.updateState(
        v.state.reconfigure({ plugins: v.state.plugins.filter((p) => p !== plugin) }),
      );
    };
  }, [editor]);
```

- [ ] **Step 4: Add the Cmd/Ctrl+F open handler**

Add another `useEffect` that listens for the open shortcut on the editor shell (mirrors the existing line-navigation keydown binding):

```ts
  // Cmd/Ctrl+F 로 검색 바 열기 (열려 있으면 SearchBar 자체가 입력 포커스를 처리).
  useEffect(() => {
    const target: HTMLElement =
      editor.domElement ?? document.querySelector<HTMLElement>('.markora-shell') ?? document.body;
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.altKey && !e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        e.stopPropagation();
        setSearchOpen(true);
      }
    };
    target.addEventListener('keydown', onKeyDown, true);
    return () => target.removeEventListener('keydown', onKeyDown, true);
  }, [editor]);
```

- [ ] **Step 5: Add the command callbacks and close handler**

Add these handlers inside the component, before the `return`:

```ts
  const handleSearch = (query: string, options: MatchOptions) => {
    const view = editor.prosemirrorView;
    if (view) pmSetSearch(view, query, options);
  };
  const handleNext = () => {
    const view = editor.prosemirrorView;
    if (view) pmGotoNext(view);
  };
  const handlePrev = () => {
    const view = editor.prosemirrorView;
    if (view) pmGotoPrev(view);
  };
  const handleCloseSearch = () => {
    const view = editor.prosemirrorView;
    if (view) pmClearSearch(view);
    setSearchOpen(false);
    editor.prosemirrorView?.focus();
  };
```

- [ ] **Step 6: Render the bar**

In the returned JSX, change the opening of the shell so the bar renders above the editor. Replace:

```tsx
    <div className="markora-shell">
      <BlockNoteView editor={editor} theme={theme} slashMenu={false}>
```

with:

```tsx
    <div className="markora-shell">
      {searchOpen && (
        <SearchBar
          summary={searchSummary}
          onSearch={handleSearch}
          onNext={handleNext}
          onPrev={handlePrev}
          onClose={handleCloseSearch}
        />
      )}
      <BlockNoteView editor={editor} theme={theme} slashMenu={false}>
```

- [ ] **Step 7: Build to type-check the wiring**

Run: `npm run build`
Expected: build succeeds with no type errors. (`editor.prosemirrorView` is typed as `EditorView`; the reconfigure call uses `view.state.reconfigure`.)

- [ ] **Step 8: Run the full frontend test suite**

Run: `npm test`
Expected: all tests pass (existing suites + the new findMatches/searchIndex/SearchBar tests).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/editor/Editor.tsx
git commit -m "feat(frontend): wire search bar and plugin into the editor"
```

---

## Task 7: Highlight + bar styles

Add the highlight classes (match / current-match) and the find-bar layout, with light/dark theme colors.

**Files:**
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Read the current top of styles.css to match conventions**

Run: `head -40 frontend/src/styles.css`
Expected: see how `.markora-shell` / theme selectors are written (BlockNote sets `[data-color-scheme="dark"]` or the Mantine theme). Match the existing dark-mode selector pattern used elsewhere in this file.

- [ ] **Step 2: Append the styles**

Append to `frontend/src/styles.css`:

```css
/* ---- In-document find ---- */
.markora-search-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
  background: #f3f3f3;
  position: sticky;
  top: 0;
  z-index: 20;
}
.markora-search-input {
  flex: 1;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  background: #fff;
  color: inherit;
  font-size: 13px;
}
.markora-search-toggle,
.markora-search-nav,
.markora-search-close {
  flex: none;
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
}
.markora-search-toggle.is-active {
  background: rgba(53, 116, 240, 0.25);
  border-color: rgba(53, 116, 240, 0.6);
}
.markora-search-nav:disabled {
  opacity: 0.4;
  cursor: default;
}
.markora-search-count {
  flex: none;
  padding: 0 6px;
  font-size: 12px;
  opacity: 0.7;
  white-space: nowrap;
}

/* match highlights (ProseMirror inline decorations) */
.markora-search-match {
  background: rgba(255, 214, 0, 0.45);
  border-radius: 2px;
}
.markora-search-current {
  background: rgba(255, 145, 0, 0.85);
  border-radius: 2px;
}

/* dark theme */
[data-color-scheme='dark'] .markora-search-bar {
  background: #2b2d30;
  border-bottom-color: rgba(255, 255, 255, 0.12);
}
[data-color-scheme='dark'] .markora-search-input {
  background: #1e1f22;
  border-color: rgba(255, 255, 255, 0.2);
}
[data-color-scheme='dark'] .markora-search-match {
  background: rgba(255, 214, 0, 0.32);
}
[data-color-scheme='dark'] .markora-search-current {
  background: rgba(255, 145, 0, 0.75);
}
```

Note: if Step 1 shows this file uses a different dark-mode selector than `[data-color-scheme='dark']` (e.g. a `.dark` class or `.bn-container[data-color-scheme]`), replace the `[data-color-scheme='dark']` prefix above with whatever selector the file already uses for dark mode so the colors actually apply.

- [ ] **Step 3: Build to confirm CSS bundles**

Run: `npm run build`
Expected: build succeeds; `styles.css` is bundled into the dist.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles.css
git commit -m "feat(frontend): add find bar and match highlight styles"
```

---

## Task 8: Manual verification in the IDE sandbox

Automated tests cover the algorithm and UI; the JCEF-runtime behaviors below require a sandbox IDE.

**Files:** none (verification only).

- [ ] **Step 1: Launch the sandbox**

Run (from the repo root `markora/`): `./gradlew runIde`
Expected: a sandbox IDE starts. `buildFrontend` runs first and bundles the new code.

- [ ] **Step 2: Verify the find flow**

Open any `.md` file in the Markora editor tab and confirm:
- Cmd+F (macOS) / Ctrl+F (Win·Linux) opens the bar at the top; input is focused.
- Typing highlights all matches (yellow) and the active one (orange); count shows "n / total".
- Enter / ↓ moves to the next match (wraps at the end and scrolls into view); Shift+Enter / ↑ moves to the previous.
- `Aa` and `W` toggles change results live.
- A term that only appears inside a KaTeX/Mermaid block's source is NOT matched (visible text only).
- Esc and × close the bar, remove highlights, and return focus to the editor.

- [ ] **Step 3: Verify auto-save non-interference (critical edge case)**

- Open a file, run a search (highlights appear), then switch focus away and back.
- Confirm the status indicator does NOT flip to "Modified"/"Saving..." purely from searching or navigating matches (search transactions don't change the document).
- Confirm no spurious file modification: the file's on-disk mtime/content is unchanged after searching without editing.

- [ ] **Step 4: Verify theme colors**

Toggle the IDE between light and dark themes (reopen the editor if theme syncs on open) and confirm the bar and highlight colors are legible in both.

- [ ] **Step 5: Record results**

If all checks pass, the feature is complete. If any check fails, use the systematic-debugging skill before patching.

---

## Self-Review Notes

- **Spec coverage:** scope=current doc only (Tasks 2–4 operate on the open doc); find-only (no replace anywhere); Cmd/Ctrl+F open + Esc/× close (Task 6, Task 5); top horizontal bar (Tasks 5, 7); case-sensitive + whole-word toggles (Tasks 2, 5); count + Enter/Shift+Enter + ↑/↓ + wrap + scroll-into-view (Tasks 4, 5); visible-text-only incl. code blocks, excl. math/Mermaid (Task 3, confirmed via `content: 'none'`). Edge cases empty/zero/auto-save/reload/theme covered in Tasks 4, 7, 8.
- **Type consistency:** `MatchOptions`/`RawMatch` (findMatches) → `TextSegment`/`PosRange` (searchIndex) → `SearchState`/`SearchSummary` + `setSearch`/`gotoNext`/`gotoPrev`/`clearSearch` (searchPlugin) → consumed in Editor under aliases `pmSetSearch`/`pmGotoNext`/`pmGotoPrev`/`pmClearSearch`. Names are consistent across tasks.
- **YAGNI:** no replace, regex, multi-file, or math-source search — none added.
