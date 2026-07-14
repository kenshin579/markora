import { describe, it, expect } from 'vitest';
import { BlockNoteEditor } from '@blocknote/core';
import { schema } from '../../editor/schema';
import { parseMarkdownWithBlockquotes, serializeBlocksWithBlockquotes } from '../blockquote';
import { postParse, preSerialize } from '../customParse';
import { maskTableImages, unmaskTableImages } from '../tableImage';
import { maskTableBreaks, unmaskBreakTokens } from '../tableLineBreak';

// Editor.tsx 의 로드/저장 파이프라인을 그대로 재현한다(마스킹 순서 포함).
async function load(editor: any, md: string) {
  const blocks = await parseMarkdownWithBlockquotes(editor, maskTableBreaks(maskTableImages(md)));
  return postParse(blocks as any);
}
async function save(editor: any): Promise<string> {
  return unmaskTableImages(unmaskBreakTokens(
    await serializeBlocksWithBlockquotes(editor, preSerialize(editor.document as any) as any),
  ));
}

describe('테이블 셀 개행 전체 라운드트립', () => {
  it('셀 <br> 가 유실 없이 라운드트립된다', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const md = ['| A | B |', '| --- | --- |', '| line1<br>line2 | plain |'].join('\n');
    const blocks: any = await load(editor, md);
    editor.replaceBlocks(editor.document, blocks);
    const out = await save(editor);
    expect(out).toContain('line1<br>line2');
    expect(out).not.toContain('MKRABR');
  });

  it('<br/> 와 <BR /> 는 <br> 로 정규화된다', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const md = ['| A |', '| --- |', '| a<br/>b |', '| c<BR />d |'].join('\n');
    const blocks: any = await load(editor, md);
    editor.replaceBlocks(editor.document, blocks);
    const out = await save(editor);
    expect(out).toContain('a<br>b');
    expect(out).toContain('c<br>d');
    expect(out).not.toMatch(/<br\/|<BR/);
  });

  it('이미지+개행 혼합 셀도 둘 다 보존된다', async () => {
    const editor = BlockNoteEditor.create({ schema });
    const md = ['| H |', '| --- |', '| ![a](docs/x.png)<br>caption |'].join('\n');
    const blocks: any = await load(editor, md);
    editor.replaceBlocks(editor.document, blocks);
    const out = await save(editor);
    expect(out).toContain('![a](docs/x.png)');
    expect(out).toContain('<br>caption');
    expect(out).not.toContain('MKRABR');
    expect(out).not.toContain('MKRAIMG');
  });

  it('테이블 밖 <br> 는 이 기능의 영향을 받지 않는다', async () => {
    const editor = BlockNoteEditor.create({ schema });
    // 테이블 밖 <br> 는 마스킹되지 않으므로 BlockNote 기존 동작대로 처리된다(범위 밖).
    // 여기서는 셀 <br> 만 라운드트립되고 그 외는 파이프라인이 깨지지 않음을 확인한다.
    const md = ['일반 문단', '', '| H |', '| --- |', '| x<br>y |'].join('\n');
    const blocks: any = await load(editor, md);
    editor.replaceBlocks(editor.document, blocks);
    const out = await save(editor);
    expect(out).toContain('x<br>y');
    expect(out).toContain('일반 문단');
  });
});
