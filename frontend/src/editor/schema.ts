import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from '@blocknote/core';

// KaTeX/Mermaid는 Task 6,7에서 이 schema에 추가됨
export const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs },
  inlineContentSpecs: { ...defaultInlineContentSpecs },
});
