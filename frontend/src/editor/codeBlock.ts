import type { CodeBlockOptions } from '@blocknote/core';

export const SUPPORTED_LANGUAGES = {
  text:        { name: 'Plain Text', aliases: ['plain', 'plaintext'] },
  javascript:  { name: 'JavaScript', aliases: ['js'] },
  typescript:  { name: 'TypeScript', aliases: ['ts'] },
  jsx:         { name: 'JSX',        aliases: [] as string[] },
  tsx:         { name: 'TSX',        aliases: [] as string[] },
  java:        { name: 'Java',       aliases: [] as string[] },
  kotlin:      { name: 'Kotlin',     aliases: ['kt', 'kts'] },
  python:      { name: 'Python',     aliases: ['py'] },
  go:          { name: 'Go',         aliases: ['golang'] },
  rust:        { name: 'Rust',       aliases: ['rs'] },
  c:           { name: 'C',          aliases: [] as string[] },
  cpp:         { name: 'C++',        aliases: ['c++'] },
  shellscript: { name: 'Shell',      aliases: ['sh', 'bash', 'zsh'] },
  json:        { name: 'JSON',       aliases: [] as string[] },
  yaml:        { name: 'YAML',       aliases: ['yml'] },
  html:        { name: 'HTML',       aliases: [] as string[] },
  css:         { name: 'CSS',        aliases: [] as string[] },
  scss:        { name: 'SCSS',       aliases: ['sass'] },
  sql:         { name: 'SQL',        aliases: [] as string[] },
  xml:         { name: 'XML',        aliases: [] as string[] },
  markdown:    { name: 'Markdown',   aliases: ['md'] },
  dockerfile:  { name: 'Dockerfile', aliases: ['docker'] },
  properties:  { name: 'Properties', aliases: [] as string[] },
} as const;

export const codeBlockOptions: CodeBlockOptions = {
  defaultLanguage: 'text',
  indentLineWithTab: true,
  supportedLanguages: SUPPORTED_LANGUAGES as unknown as CodeBlockOptions['supportedLanguages'],
  createHighlighter: async () => {
    const { createHighlighter } = await import('shiki');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: Object.keys(SUPPORTED_LANGUAGES),
    }) as any;
  },
};
