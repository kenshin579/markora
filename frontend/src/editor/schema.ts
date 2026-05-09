import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  createCodeBlockSpec,
} from '@blocknote/core';
import { KatexBlock } from '../blocks/KatexBlock';
import { MermaidBlock } from '../blocks/MermaidBlock';
import { KatexInline } from '../inline/KatexInline';
import { codeBlockOptions } from './codeBlock';

const { codeBlock: _ignoredDefaultCodeBlock, ...restDefaultBlockSpecs } = defaultBlockSpecs;

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...restDefaultBlockSpecs,
    codeBlock: createCodeBlockSpec(codeBlockOptions),
    katex: KatexBlock(),
    mermaid: MermaidBlock(),
  },
  inlineContentSpecs: { ...defaultInlineContentSpecs, katexInline: KatexInline },
});
