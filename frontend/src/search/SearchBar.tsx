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
