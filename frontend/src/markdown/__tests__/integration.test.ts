import { describe, it, expect } from 'vitest';
import { BlockNoteEditor } from '@blocknote/core';
import { schema } from '../../editor/schema';
import { preSerialize, postParse } from '../customParse';
import { parseMarkdownWithBlockquotes, serializeBlocksWithBlockquotes } from '../blockquote';

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

// 실제 Editor.tsx 의 로드/저장 파이프라인과 동일한 경로로 왕복한다.
async function roundtripViaWrapper(md: string): Promise<string> {
  const editor = BlockNoteEditor.create({ schema });
  const blocks = await parseMarkdownWithBlockquotes(editor, md);
  editor.replaceBlocks(editor.document, postParse(blocks as any) as any);
  const out = await serializeBlocksWithBlockquotes(
    editor,
    preSerialize(editor.document as any) as any,
  );
  return out.trim();
}

describe('strikethrough: 단일 틸드 round-trip', () => {
  it('범위 표현의 단일 틸드는 strike 가 아니라 리터럴로 보존', async () => {
    const out = await roundtripViaWrapper('속도(0.4~1.0), 시간(30~300s)\n');
    expect(out).toContain('0.4~1.0');
    expect(out).toContain('30~300s');
    expect(out).not.toContain('~~'); // strike 마크업으로 변질되지 않음
    expect(out).not.toContain('\\~'); // 이스케이프가 파일로 새어나가지 않음
  });

  it('~~strike~~ 취소선은 정상 보존', async () => {
    const out = await roundtripViaWrapper('진짜 ~~취소선~~ 입니다\n');
    expect(out).toContain('~~취소선~~');
  });

  it('표 셀 안의 단일 틸드도 리터럴 보존', async () => {
    const md = [
      '| 항목 | 범위 |',
      '| --- | --- |',
      '| 속도 | 0.4~1.0 |',
      '',
    ].join('\n');
    const out = await roundtripViaWrapper(md);
    expect(out).toContain('0.4~1.0');
    expect(out).not.toContain('\\~');
    expect(out).not.toContain('~~');
  });

  it('blockquote 내부 단일 틸드도 리터럴 보존', async () => {
    const out = await roundtripViaWrapper('> 범위(0.4~1.0) 참조\n');
    expect(out).toContain('0.4~1.0');
    expect(out).not.toContain('\\~');
  });
});
