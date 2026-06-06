// HTML <img> 렌더링 + 무손실 저장 엔드투엔드 회귀 테스트.
// 실제 BlockNote로 parse/serialize 하여, loadFile의 rewrite가 <img>를 렌더 가능한
// image 블록으로 만들고, saveFile의 restore가 원본 <img>로 무손실 복원하는지 검증한다.
import { describe, it, expect } from 'vitest';
import { BlockNoteEditor } from '@blocknote/core';
import { schema } from '../../editor/schema';
import { rewriteImagePathsForDisplay, restoreImagePaths } from '../imageMap';

const SERVER = 'http://localhost:63342/markora/';
const DIR = '/Users/me/doc';

describe('HTML <img> 엔드투엔드 (실제 BlockNote)', () => {
  it('rewrite한 <img>는 BlockNote에서 image 블록으로 렌더된다', async () => {
    const editor = BlockNoteEditor.create({ schema } as any);
    const { body } = rewriteImagePathsForDisplay(
      '<img src="cover.png" alt="cover" width="75%" />',
      DIR,
      SERVER,
    );
    const blocks = await editor.tryParseMarkdownToBlocks(body);
    const img = blocks.find((b: any) => b.type === 'image') as any;
    expect(img).toBeTruthy();
    expect(img.props.url).toBe(body.match(/\((.*)\)/)![1]);
  });

  it('전체 라운드트립: 디스크 <img> → 로드 → BlockNote → 저장 직렬화 → 복원 === 원본', async () => {
    const editor = BlockNoteEditor.create({ schema } as any);
    const disk = '# 제목\n\n<img src="cover.png" alt="cover" width="75%" />\n\n본문\n';
    // 로드: rewrite
    const { body, map, htmlMap } = rewriteImagePathsForDisplay(disk, DIR, SERVER);
    // BlockNote in/out (편집 없이 그대로 직렬화)
    const blocks = await editor.tryParseMarkdownToBlocks(body);
    const serialized = await editor.blocksToMarkdownLossy(blocks as any);
    // 저장: restore
    const restored = restoreImagePaths(serialized, map, htmlMap);
    expect(restored).toContain('<img src="cover.png" alt="cover" width="75%" />');
  });
});
