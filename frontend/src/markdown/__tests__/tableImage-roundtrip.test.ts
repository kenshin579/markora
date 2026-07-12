import { describe, it, expect } from 'vitest';
import { BlockNoteEditor } from '@blocknote/core';
import { schema } from '../../editor/schema';
import { parseMarkdownWithBlockquotes, serializeBlocksWithBlockquotes } from '../blockquote';
import { postParse, preSerialize } from '../customParse';
import { maskTableImages, unmaskTableImages } from '../tableImage';

// Editor.tsx 의 로드/저장 파이프라인을 그대로 재현한다.
async function load(editor: any, md: string) {
  const blocks = await parseMarkdownWithBlockquotes(editor, maskTableImages(md));
  return postParse(blocks as any);
}
async function save(editor: any): Promise<string> {
  return unmaskTableImages(
    await serializeBlocksWithBlockquotes(editor, preSerialize(editor.document as any) as any),
  );
}

describe('테이블 셀 이미지 전체 라운드트립', () => {
  it('로드하면 셀에 inlineImage 가 생기고, 저장하면 마크다운 이미지로 복원된다', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const md = [
      '| Annotation editor | Live page |',
      '| --- | --- |',
      '| ![shot](docs/a.png) | ![badge](docs/b.png) |',
    ].join('\n');

    const blocks: any = await load(editor, md);
    editor.replaceBlocks(editor.document, blocks);

    const flat = JSON.stringify(editor.document);
    expect(flat).toContain('inlineImage');
    expect(flat).toContain('docs/a.png');
    expect(flat).toContain('docs/b.png');

    const out = await save(editor);
    expect(out).toContain('![shot](docs/a.png)');
    expect(out).toContain('![badge](docs/b.png)');
    expect(out).not.toContain('MKRAIMG');
  });

  it('테이블 밖 블록 이미지는 영향받지 않는다', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const md = '![plain](docs/c.png)\n\n| H |\n| --- |\n| ![cell](docs/d.png) |';
    const blocks: any = await load(editor, md);
    editor.replaceBlocks(editor.document, blocks);
    const out = await save(editor);
    // 테이블 밖 블록 이미지는 이 기능(셀 이미지 마스킹/토큰화)의 영향을 받지 않는다:
    // 마스킹되지도, inlineImage 로 변환되지도 않아 원본 이미지가 그대로 보존된다.
    // (블록 image 노드의 src 는 BlockNote 가 baseURI 기준 절대 URL 로 직렬화하므로 —
    //  이는 셀 이미지 기능과 무관한 BlockNote 코어 동작 — 파일명 보존만 검증한다.)
    expect(out).toContain('docs/c.png');
    expect(out).not.toContain('MKRAIMG');
    // 반면 테이블 셀 이미지는 토큰 라운드트립으로 상대 경로 그대로 복원된다.
    expect(out).toContain('![cell](docs/d.png)');
  });

  it('CRLF 테이블의 셀 이미지도 유실 없이 라운드트립된다', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const md = '| H |\r\n| --- |\r\n| ![a](docs/z.png) |';
    const blocks: any = await load(editor, md);
    editor.replaceBlocks(editor.document, blocks);
    expect(JSON.stringify(editor.document)).toContain('inlineImage');
    const out = await save(editor);
    expect(out).toContain('![a](docs/z.png)');
    expect(out).not.toContain('MKRAIMG');
  });
});
