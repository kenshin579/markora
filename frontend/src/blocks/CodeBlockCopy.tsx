import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export const CODE_BLOCK_SELECTOR = '[data-content-type="codeBlock"] pre';

interface Props {
  editorRoot: React.RefObject<HTMLElement | null>;
}

export function CodeBlockCopy({ editorRoot }: Props) {
  const [hoveredPre, setHoveredPre] = useState<HTMLPreElement | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  // Fix #1: clear the copy-state timer on unmount to avoid setState after unmount
  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const root = editorRoot.current;
    if (!root) return;

    const handleMouseEnter = (e: Event) => {
      const target = e.currentTarget as HTMLPreElement;
      setHoveredPre(target);
    };
    const handleMouseLeave = (e: Event) => {
      const target = e.currentTarget as HTMLPreElement;
      setHoveredPre((curr) => (curr === target ? null : curr));
    };

    const attach = (pre: HTMLPreElement) => {
      pre.addEventListener('mouseenter', handleMouseEnter);
      pre.addEventListener('mouseleave', handleMouseLeave);
    };
    const detach = (pre: HTMLPreElement) => {
      pre.removeEventListener('mouseenter', handleMouseEnter);
      pre.removeEventListener('mouseleave', handleMouseLeave);
    };

    root.querySelectorAll<HTMLPreElement>(CODE_BLOCK_SELECTOR).forEach(attach);

    const attachFromNode = (n: HTMLElement) => {
      // Case 1: n is a <pre> that sits inside a data-content-type="codeBlock" wrapper
      if (n.matches?.(CODE_BLOCK_SELECTOR)) attach(n as HTMLPreElement);
      // Case 2: n is (or contains) a codeBlock wrapper div — find descendant <pre>s
      n.querySelectorAll?.<HTMLPreElement>('[data-content-type="codeBlock"] pre').forEach(attach);
      // Case 3: n itself is the wrapper div
      if (n.dataset?.contentType === 'codeBlock') {
        n.querySelectorAll<HTMLPreElement>('pre').forEach(attach);
      }
    };
    const detachFromNode = (n: HTMLElement) => {
      if (n.matches?.(CODE_BLOCK_SELECTOR)) detach(n as HTMLPreElement);
      n.querySelectorAll?.<HTMLPreElement>('[data-content-type="codeBlock"] pre').forEach(detach);
      if (n.dataset?.contentType === 'codeBlock') {
        n.querySelectorAll<HTMLPreElement>('pre').forEach(detach);
      }
    };

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          attachFromNode(n);
        });
        m.removedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          detachFromNode(n);
        });
      }
    });
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      root.querySelectorAll<HTMLPreElement>(CODE_BLOCK_SELECTOR).forEach(detach);
    };
  }, [editorRoot]);

  const handleCopy = async () => {
    if (!hoveredPre) return;
    // Extract only the code content, excluding any injected button text.
    // The portal renders the button inside the <pre>, so we read from <code> only.
    const codeEl = hoveredPre.querySelector('code');
    const text = (codeEl ?? hoveredPre).innerText;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error('Code copy failed:', e);
    }
  };

  if (!hoveredPre) return null;

  return createPortal(
    <button
      type="button"
      className="markora-code-copy is-visible"
      onMouseEnter={() => setHoveredPre(hoveredPre)}
      onMouseLeave={(e) => {
        // Fix #2: only clear hover when the pointer actually left the pre (not just
        // transited from button back into the pre interior), to prevent flicker.
        if (!hoveredPre.contains(e.relatedTarget as Node)) setHoveredPre(null);
      }}
      onClick={handleCopy}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>,
    hoveredPre,
  );
}
