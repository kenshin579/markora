import { describe, it, expect } from 'vitest';
import { BlockNoteEditor } from '@blocknote/core';
import { schema } from '../../editor/schema';
import { preSerialize, postParse } from '../customParse';

async function roundtrip(md: string): Promise<string> {
  const editor = BlockNoteEditor.create({ schema });
  const blocks = await editor.tryParseMarkdownToBlocks(md);
  const transformed = postParse(blocks as any);
  editor.replaceBlocks(editor.document, transformed as any);
  const out = await editor.blocksToMarkdownLossy(preSerialize(editor.document as any) as any);
  return out.trim();
}

describe('markdown 라운드트립 (통합)', () => {
  it('표준 마크다운 보존', async () => {
    const md = '# Title\n\nHello **world**.\n\n- a\n- b\n';
    const out = await roundtrip(md);
    expect(out).toContain('# Title');
    expect(out).toContain('**world**');
    // BlockNote outputs '* ' (asterisk) for bullet list items instead of '- '
    expect(out).toContain('* a');
  });

  it('```math 블록 보존', async () => {
    const md = '```math\nx^2 + y^2 = z^2\n```\n';
    const out = await roundtrip(md);
    expect(out).toContain('```math');
    expect(out).toContain('x^2 + y^2 = z^2');
  });

  it('```mermaid 블록 보존', async () => {
    const md = '```mermaid\ngraph TD\nA-->B\n```\n';
    const out = await roundtrip(md);
    expect(out).toContain('```mermaid');
    expect(out).toContain('A-->B');
  });

  it('인라인 수식 보존', async () => {
    const md = '식: $x^2$ 끝.\n';
    const out = await roundtrip(md);
    expect(out).toContain('$x^2$');
  });
});
