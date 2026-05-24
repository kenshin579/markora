# In-Document Find — Design Spec

**Date:** 2026-05-24
**Status:** Approved (brainstorming)
**Scope:** markora frontend (React/BlockNote editor inside JCEF)

## Summary

Add a "Find" feature to the markora WYSIWYG editor that searches **within the
currently open document only**. Cmd/Ctrl+F opens a VS Code–style horizontal bar
at the top of the editor; matches in the visible text are highlighted, with the
active match emphasized and navigable. Find-only — no replace.

## Requirements

- **Scope:** current open document only (not project-wide, not across files).
- **Mode:** find only (no replace).
- **Trigger / chrome:** Cmd+F (macOS) / Ctrl+F (Win·Linux) opens; Esc or × closes.
- **UI:** horizontal bar across the top of the editor (VS Code style).
- **Matching options:** case-sensitive toggle (`Aa`) + whole-word toggle. No regex.
- **Navigation:** result count ("3 / 12"); next/prev via Enter / Shift+Enter and
  ↑/↓ buttons; wrap-around at ends; active match scrolled into view.
- **Search target:** visible plain text only — paragraph, heading, list, quote,
  table, code-block text. Excludes hidden source of KaTeX math (block + inline)
  and Mermaid diagrams.

### Out of scope (YAGNI)

Replace, regex, project-wide/multi-file search, searching math/Mermaid source text.

## Approach

In-editor find via **ProseMirror decorations**. BlockNote 0.49 sits on
ProseMirror, accessible through `editor.prosemirrorView`. A PM plugin walks the
document's text nodes, computes match ranges for the query/options, and renders
inline decorations (CSS classes) over them — without mutating document content,
so auto-save / dirty tracking is never triggered.

Rejected alternatives: CSS Custom Highlight API (fragile manual DOM walking over
BlockNote's nested DOM, uncertain JCEF Chromium support); native `window.find()`
(no count, no styled highlight-all, conflicts with editor selection/auto-save).

## Architecture & Components

New unit directory: `frontend/src/search/`.

- **`findMatches.ts`** (pure function) — input: ProseMirror document + query +
  options `{ caseSensitive, wholeWord }`; output: ordered match ranges
  `{ from, to }[]` in PM positions. Walks text nodes; skips KaTeX/Mermaid nodes
  so only visible text is searched. No editor/DOM dependency → unit-testable.

- **`searchPlugin.ts`** (ProseMirror plugin) — holds search state
  `{ query, options, matches, currentIndex }`. Builds a `DecorationSet` applying
  `.markora-search-match` to all matches and `.markora-search-current` to the
  active one. Exposes commands via plugin key: `setSearch(query, options)`,
  `clear()`, `next()`, `prev()`. Decoration-only — never changes document content.

- **`SearchBar.tsx`** (React) — VS Code–style top bar: text input, `Aa`
  (case-sensitive) toggle, whole-word toggle, "n / total" count, ↑/↓ buttons,
  close (×). Calls plugin commands and reflects current count/index.

- **`Editor.tsx` wiring** — Cmd/Ctrl+F opens (`searchOpen` state) and refocuses
  the input if already open; Esc closes. Registers the plugin on
  `editor.prosemirrorView`, following the existing `lineNavigation.ts` keydown
  pattern.

- **`styles.css`** — highlight styles for all-match and current-match, with
  light/dark theme colors.

## Data Flow

1. Cmd/Ctrl+F → `searchOpen=true` → SearchBar mounts, input autofocused
   (re-press → refocus + select-all).
2. Input change → dispatch meta transaction to plugin → `findMatches` recomputes
   → decorations refresh → bar shows "n / total". ~100ms debounce while typing.
3. Enter / ↓ → `next` (index +1, wrap to first at end); Shift+Enter / ↑ → `prev`.
   Active match `scrollIntoView`, current-match highlight updated.
4. Esc or × → plugin `clear()` (remove decorations) + close bar; focus returns to
   the editor.

## Edge Cases

- Empty query → remove decorations, hide count.
- Zero matches → "0 results", ↑/↓ disabled.
- **Auto-save non-interference (critical)** — search transactions must not change
  the document, so `editor.onChange` dirty/save logic must not fire. Verify
  whether BlockNote `onChange` fires on decoration-only transactions; if so,
  identify and ignore search transactions (analogous to the existing
  `applyingRemoteRef` guard).
- External reload (`replaceBlocks`) while the bar is open → recompute matches.
- Light/dark theme highlight colors.

## Testing

- **`findMatches.test.ts`** (vitest) — plain / case-sensitive / whole-word
  matching, cross-block-boundary text, exclusion of math & Mermaid source,
  zero matches, overlapping/adjacent cases.
- **`SearchBar` test** (@testing-library/react) — count display, toggles, button
  disabled states.
- **Manual (`./gradlew runIde`)** — plugin↔editor wiring, Cmd+F / Esc, scroll-to,
  auto-save non-interference, theme colors. (JCEF-runtime dependent.)
