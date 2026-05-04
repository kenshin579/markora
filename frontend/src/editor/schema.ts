import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from '@blocknote/core';
import { KatexBlock } from '../blocks/KatexBlock';
import { MermaidBlock } from '../blocks/MermaidBlock';
import { KatexInline } from '../inline/KatexInline';

export const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, katex: KatexBlock, mermaid: MermaidBlock },
  inlineContentSpecs: { ...defaultInlineContentSpecs, katexInline: KatexInline },
});
