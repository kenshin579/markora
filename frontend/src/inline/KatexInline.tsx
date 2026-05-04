import React, { useState, useEffect } from 'react';
import { createReactInlineContentSpec } from '@blocknote/react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export const KatexInline = createReactInlineContentSpec(
  {
    type: 'katexInline',
    propSchema: { source: { default: '' } },
    content: 'none',
  },
  {
    render: ({ inlineContent, updateInlineContent }) => {
      const [editing, setEditing] = useState(false);
      const [draft, setDraft] = useState(inlineContent.props.source);

      useEffect(() => {
        setDraft(inlineContent.props.source);
      }, [inlineContent.props.source]);

      if (editing) {
        return (
          <span className="markora-katex-inline-edit">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                if (draft !== inlineContent.props.source) {
                  updateInlineContent({ type: 'katexInline', props: { source: draft }, content: undefined } as any);
                }
                setEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
          </span>
        );
      }

      let html = '';
      let error: string | null = null;
      try {
        html = katex.renderToString(inlineContent.props.source, { displayMode: false, throwOnError: true });
      } catch (e: any) {
        error = e?.message ?? 'error';
      }
      if (error) {
        return (
          <span className="markora-katex-inline-error" onClick={() => setEditing(true)} title={error}>
            ⚠ ${inlineContent.props.source}$
          </span>
        );
      }
      return (
        <span
          className="markora-katex-inline"
          onClick={() => setEditing(true)}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    },
  }
);
