import { describe, it, expect } from 'vitest';
import { BlockNoteEditor } from '@blocknote/core';
import { schema } from '../../editor/schema';
import { preSerialize, postParse, escapeSingleTildes, unescapeSingleTildes } from '../customParse';

async function roundtrip(md: string): Promise<string> {
  const editor = BlockNoteEditor.create({ schema });
  const blocks = await editor.tryParseMarkdownToBlocks(escapeSingleTildes(md));
  const transformed = postParse(blocks as any);
  editor.replaceBlocks(editor.document, transformed as any);
  const raw = await editor.blocksToMarkdownLossy(preSerialize(editor.document as any) as any);
  return unescapeSingleTildes(raw).trim();
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

describe('단일 틸드 취소선 회귀', () => {
  it('범위 표기는 취소선이 되지 않고 ~ 가 보존된다', async () => {
    const out = await roundtrip('속도(0.4~1.0), 대기(30~300s)');
    expect(out).toContain('0.4~1.0');
    expect(out).toContain('30~300s');
    expect(out).not.toContain('~~'); // 취소선 마크업 없음
  });

  it('이중 틸드 취소선은 보존된다', async () => {
    const out = await roundtrip('이건 ~~취소선~~ 입니다');
    expect(out).toContain('~~취소선~~');
  });

  it('인라인 수식 안의 틸드는 수식 소스로 보존된다', async () => {
    const out = await roundtrip('노름 $0.4~1.0$ 입니다');
    expect(out).toContain('$0.4~1.0$');
  });

  it('표 안의 여러 범위 표기 보존', async () => {
    const md = [
      '| 항목 | 범위 |',
      '| --- | --- |',
      '| 속도 | 0.4~1.0 |',
      '| 대기 | 30~300s |',
    ].join('\n');
    const out = await roundtrip(md);
    expect(out).toContain('0.4~1.0');
    expect(out).toContain('30~300s');
  });
});
