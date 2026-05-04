import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from '@blocknote/core';
import { KatexBlock } from '../blocks/KatexBlock';
import { KatexInline } from '../inline/KatexInline';

export const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, katex: KatexBlock },
  inlineContentSpecs: { ...defaultInlineContentSpecs, katexInline: KatexInline },
});
