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
