import React, { useState, useEffect, useRef } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { ErrorBox } from './ErrorBox';

export function renderKatexToHtml(source: string): { html: string; error: string | null } {
  if (!source) return { html: '', error: null };
  try {
    const html = katex.renderToString(source, {
      throwOnError: true,
      displayMode: true,
    });
    return { html, error: null };
  } catch (e: any) {
    return { html: '', error: e?.message ?? 'KaTeX render error' };
  }
}

export const KatexBlock = createReactBlockSpec(
  {
    type: 'katex',
    propSchema: { source: { default: '' } },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const [editing, setEditing] = useState(!block.props.source);
      const [draft, setDraft] = useState(block.props.source);
      const [debounced, setDebounced] = useState(block.props.source);
      const timerRef = useRef<number | null>(null);

      useEffect(() => {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setDebounced(draft), 300);
        return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
      }, [draft]);

      const commit = () => {
        editor.updateBlock(block, { type: 'katex', props: { source: draft } } as any);
        setEditing(false);
      };

      if (editing) {
        return (
          <div className="markora-katex-edit">
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
              rows={Math.max(2, draft.split('\n').length)}
              placeholder="LaTeX (예: \\sum_{i=0}^{n} i^2)"
            />
          </div>
        );
      }

      const { html, error } = renderKatexToHtml(debounced);
      if (error) {
        return (
          <ErrorBox
            kind="LaTeX"
            message={error}
            onEdit={() => setEditing(true)}
            onConvertToCode={() =>
              editor.updateBlock(block, {
                type: 'codeBlock',
                props: { language: 'math' },
                content: [{ type: 'text', text: block.props.source, styles: {} }],
              } as any)
            }
          />
        );
      }
      return (
        <div
          className="markora-katex-render"
          onClick={() => setEditing(true)}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    },
  }
);
