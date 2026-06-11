import { describe, it, expect } from 'vitest';
import { BlockNoteEditor } from '@blocknote/core';
import { schema } from '../../editor/schema';
import {
  splitRuns, stripQuotePrefix, parseMarkdownWithBlockquotes,
  serializeBlocksWithBlockquotes,
} from '../blockquote';
import { postParse, preSerialize } from '../customParse';

describe('splitRuns', () => {
  it('blockquote 줄과 일반 줄을 연속 구간으로 분리', () => {
    const body = 'para\n> q1\n> q2\nafter';
    expect(splitRuns(body)).toEqual([
      { kind: 'plain', text: 'para' },
      { kind: 'quote', text: '> q1\n> q2' },
      { kind: 'plain', text: 'after' },
    ]);
  });

  it('앞 공백 ≤3까지는 blockquote로 인정', () => {
    expect(splitRuns('   > q')).toEqual([{ kind: 'quote', text: '   > q' }]);
  });

  it('코드펜스 내부의 > 줄은 blockquote로 오인하지 않음', () => {
    const body = '```\n> not a quote\n```';
    expect(splitRuns(body)).toEqual([
      { kind: 'plain', text: '```\n> not a quote\n```' },
    ]);
  });
});

describe('stripQuotePrefix', () => {
  it('> 와 뒤따르는 공백 1개만 제거하고 들여쓰기는 보존', () => {
    const text = '> - a\n>   - a1\n>';
    expect(stripQuotePrefix(text)).toBe('- a\n  - a1\n');
  });

  it('> 없는 줄은 그대로', () => {
    expect(stripQuotePrefix('plain')).toBe('plain');
  });

  it('> 뒤 탭 1개도 제거', () => {
    expect(stripQuotePrefix('>\t- a')).toBe('- a');
  });
});

describe('parseMarkdownWithBlockquotes', () => {
  it('> - a / > - b 를 quote + bullet children 로 파싱', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const blocks: any = await parseMarkdownWithBlockquotes(editor, '> - a\n> - b');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('quote');
    expect(blocks[0].children.map((c: any) => c.type))
      .toEqual(['bulletListItem', 'bulletListItem']);
  });

  it('선행 단락 + 리스트: 단락은 content, 리스트는 children', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const md = '> 링크\n>\n> - 범위\n> - 근거';
    const blocks: any = await parseMarkdownWithBlockquotes(editor, md);
    expect(blocks[0].type).toBe('quote');
    expect(blocks[0].content[0].text).toBe('링크');
    expect(blocks[0].children).toHaveLength(2);
    expect(blocks[0].children[0].type).toBe('bulletListItem');
  });

  it('numbered list 지원', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const blocks: any = await parseMarkdownWithBlockquotes(editor, '> 1. a\n> 2. b');
    expect(blocks[0].children[0].type).toBe('numberedListItem');
  });

  it('중첩 리스트 지원', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const blocks: any = await parseMarkdownWithBlockquotes(editor, '> - a\n>   - a1');
    const top = blocks[0].children[0];
    expect(top.type).toBe('bulletListItem');
    expect(top.children[0].type).toBe('bulletListItem');
  });

  it('CRLF 줄바꿈도 LF 와 동일하게 quote + bullet children 로 파싱', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const blocks: any = await parseMarkdownWithBlockquotes(editor, '> - a\r\n> - b');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('quote');
    expect(blocks[0].children.map((c: any) => c.type))
      .toEqual(['bulletListItem', 'bulletListItem']);
  });

  it('빈 줄로 구분된 두 quote 는 별개의 quote 블록', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const blocks: any = await parseMarkdownWithBlockquotes(editor, '> a\n\n> b');
    expect(blocks.map((b: any) => b.type)).toEqual(['quote', 'quote']);
  });

  it('빈 입력은 빈 배열', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const blocks: any = await parseMarkdownWithBlockquotes(editor, '');
    expect(blocks).toEqual([]);
  });

  it('blockquote 없는 문서는 BlockNote 기본 파싱과 동일하게 동작', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const blocks: any = await parseMarkdownWithBlockquotes(editor, '# T\n\n- a\n- b');
    expect(blocks.map((b: any) => b.type))
      .toEqual(['heading', 'bulletListItem', 'bulletListItem']);
  });
});

describe('serializeBlocksWithBlockquotes', () => {
  it('quote + children 를 > 접두사 붙은 리스트로 직렬화', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const blocks: any = [{
      type: 'quote',
      props: { backgroundColor: 'default', textColor: 'default' },
      content: [{ type: 'text', text: '링크', styles: {} }],
      children: [
        { type: 'bulletListItem', content: [{ type: 'text', text: 'a', styles: {} }] },
        { type: 'bulletListItem', content: [{ type: 'text', text: 'b', styles: {} }] },
      ],
    }];
    const md = await serializeBlocksWithBlockquotes(editor, blocks);
    expect(md).toContain('> 링크');
    expect(md).toContain('> * a');
    expect(md).toContain('> * b');
    // 리스트 줄이 blockquote 밖으로 탈출하지 않는다
    expect(md).not.toMatch(/^\* a/m);
  });

  it('children 없는 일반 quote 는 기존처럼 직렬화', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const blocks: any = [{
      type: 'quote',
      props: { backgroundColor: 'default', textColor: 'default' },
      content: [{ type: 'text', text: 'hello', styles: {} }],
      children: [],
    }];
    const md = await serializeBlocksWithBlockquotes(editor, blocks);
    expect(md.trim()).toBe('> hello');
  });
});

async function roundtrip(md: string): Promise<any[]> {
  const editor = BlockNoteEditor.create({ schema });
  const parsed = postParse(await parseMarkdownWithBlockquotes(editor, md) as any);
  editor.replaceBlocks(editor.document, parsed as any);
  const out = await serializeBlocksWithBlockquotes(editor, preSerialize(editor.document as any) as any);
  // 두 번째 파싱
  const editor2 = BlockNoteEditor.create({ schema });
  return postParse(await parseMarkdownWithBlockquotes(editor2, out) as any) as any[];
}

describe('blockquote 라운드트립', () => {
  it('선행 단락 + 리스트 구조가 md→blocks→md→blocks 후 보존', async () => {
    const md = '> 링크\n>\n> - 범위\n> - 근거';
    const blocks: any = await roundtrip(md);
    expect(blocks[0].type).toBe('quote');
    expect(blocks[0].content[0].text).toBe('링크');
    expect(blocks[0].children.map((c: any) => c.type))
      .toEqual(['bulletListItem', 'bulletListItem']);
  });

  it('중첩 리스트가 라운드트립 후 보존', async () => {
    const blocks: any = await roundtrip('> - a\n>   - a1');
    expect(blocks[0].children[0].children[0].type).toBe('bulletListItem');
  });

  it('코드펜스 내부 > 줄은 quote 로 변하지 않는다', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const blocks: any = await parseMarkdownWithBlockquotes(editor, '```\n> x\n```');
    expect(blocks[0].type).toBe('codeBlock');
  });
});
