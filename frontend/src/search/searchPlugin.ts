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
          const current = matches.length === 0 ? -1 : Math.max(0, Math.min(value.current, matches.length - 1));
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
