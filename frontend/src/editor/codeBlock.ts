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

const SHIKI_LIGHT_THEME = 'github-light';
const SHIKI_DARK_THEME = 'one-dark-pro';

export const codeBlockOptions: CodeBlockOptions = {
  defaultLanguage: 'text',
  indentLineWithTab: true,
  // `as const` produces readonly aliases arrays; CodeBlockOptions expects mutable string[].
  supportedLanguages: SUPPORTED_LANGUAGES as unknown as CodeBlockOptions['supportedLanguages'],
  createHighlighter: async () => {
    const { createHighlighter } = await import('shiki');
    const highlighter = await createHighlighter({
      themes: [SHIKI_LIGHT_THEME, SHIKI_DARK_THEME],
      langs: Object.keys(SUPPORTED_LANGUAGES),
    });
    // BlockNote's lazyShikiPlugin → prosemirror-highlight calls codeToTokens with only
    // a single `theme` option (the first loaded theme), which would render light-mode
    // colors in both modes. Inject `themes: { light, dark }` + `defaultColor: false` so
    // shiki emits ONLY CSS variables (--shiki-light / --shiki-dark), enabling our CSS
    // theme toggle. Without `defaultColor: false`, shiki's default ('light') emits a
    // direct `color`/`background-color` that overrides the dark variable in dark mode.
    const originalCodeToTokens = highlighter.codeToTokens.bind(highlighter);
    highlighter.codeToTokens = ((code: string, options: Record<string, unknown> | undefined) =>
      originalCodeToTokens(code, {
        ...(options ?? {}),
        themes: { light: SHIKI_LIGHT_THEME, dark: SHIKI_DARK_THEME },
        // defaultColor: false → shiki emits only CSS variables (no inline color/bg).
        // Without this, default 'light' produces direct color/bg that would override
        // our --shiki-dark variable in dark mode and create per-token bg banding.
        defaultColor: false,
      })) as unknown as typeof highlighter.codeToTokens;
    // shiki returns HighlighterGeneric<BundledLanguage, BundledTheme>; BlockNote expects
    // HighlighterGeneric<any, any>. Structurally compatible at runtime, incompatible at type level.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return highlighter as any;
  },
};
