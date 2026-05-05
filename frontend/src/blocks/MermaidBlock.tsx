import React, { useState, useEffect, useRef } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import mermaid from 'mermaid';
import { ErrorBox } from './ErrorBox';

let initialized = false;
export function initMermaid(theme: 'light' | 'dark') {
  mermaid.initialize({
    startOnLoad: false,
    theme: theme === 'dark' ? 'dark' : 'default',
    securityLevel: 'strict',
  });
  initialized = true;
}

export async function renderMermaidToSvg(id: string, source: string): Promise<{ svg: string; error: string | null }> {
  if (!source.trim()) return { svg: '', error: null };
  if (!initialized) initMermaid('light');
  try {
    const { svg } = await mermaid.render(id, source);
    return { svg, error: null };
  } catch (e: any) {
    return { svg: '', error: e?.message ?? 'Mermaid render error' };
  }
}

const themeReinitListeners = new Set<() => void>();
export function reinitOnThemeChange(theme: 'light' | 'dark') {
  initMermaid(theme);
  themeReinitListeners.forEach(cb => cb());
}
export function subscribeMermaidReinit(cb: () => void): () => void {
  themeReinitListeners.add(cb);
  return () => { themeReinitListeners.delete(cb); };
}

let counter = 0;
const nextId = () => `markora-mermaid-${++counter}`;

export const MermaidBlock = createReactBlockSpec(
  {
    type: 'mermaid',
    propSchema: { source: { default: '' } },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const [editing, setEditing] = useState(!block.props.source);
      const [draft, setDraft] = useState(block.props.source);
      const [debounced, setDebounced] = useState(block.props.source);
      const [svg, setSvg] = useState<string>('');
      const [error, setError] = useState<string | null>(null);
      const [renderVersion, setRenderVersion] = useState(0);
      const timerRef = useRef<number | null>(null);
      const idRef = useRef<string>(nextId());

      // Sync state when block.props.source changes externally (e.g., replaceBlocks)
      useEffect(() => {
        setDraft(block.props.source);
        setDebounced(block.props.source);
      }, [block.props.source]);

      useEffect(() => {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setDebounced(draft), 300);
        return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
      }, [draft]);

      useEffect(() => subscribeMermaidReinit(() => setRenderVersion(v => v + 1)), []);

      useEffect(() => {
        let cancelled = false;
        (async () => {
          const r = await renderMermaidToSvg(idRef.current, debounced);
          if (!cancelled) { setSvg(r.svg); setError(r.error); }
        })();
        return () => { cancelled = true; };
      }, [debounced, renderVersion]);

      const commit = () => {
        if (draft !== block.props.source) {
          editor.updateBlock(block, { type: 'mermaid', props: { source: draft } } as any);
        }
        setEditing(false);
      };

      if (editing) {
        return (
          <div className="markora-mermaid-edit">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
                  e.preventDefault(); commit();
                }
              }}
              rows={Math.max(4, draft.split('\n').length)}
              placeholder="Mermaid (예: graph TD\nA-->B)"
            />
          </div>
        );
      }

      if (error) {
        return (
          <ErrorBox
            kind="Mermaid"
            message={error}
            onEdit={() => setEditing(true)}
            onConvertToCode={() =>
              editor.updateBlock(block, {
                type: 'codeBlock',
                props: { language: 'mermaid' },
                content: [{ type: 'text', text: block.props.source, styles: {} }],
              } as any)
            }
          />
        );
      }
      return (
        <div
          className="markora-mermaid-render"
          onClick={() => setEditing(true)}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      );
    },
  }
);
