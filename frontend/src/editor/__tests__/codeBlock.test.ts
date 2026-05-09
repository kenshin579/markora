import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SUPPORTED_LANGUAGES, codeBlockOptions } from '../codeBlock';

describe('SUPPORTED_LANGUAGES', () => {
  it('핵심 언어가 모두 포함된다', () => {
    const keys = Object.keys(SUPPORTED_LANGUAGES);
    for (const lang of [
      'text', 'javascript', 'typescript', 'jsx', 'tsx',
      'java', 'kotlin', 'python', 'go', 'rust',
      'c', 'cpp', 'shellscript', 'json', 'yaml',
      'html', 'css', 'scss', 'sql', 'xml',
      'markdown', 'dockerfile', 'properties',
    ]) {
      expect(keys).toContain(lang);
    }
  });

  it('총 23개 항목이다', () => {
    expect(Object.keys(SUPPORTED_LANGUAGES).length).toBe(23);
  });

  it('각 항목은 name 문자열을 가진다', () => {
    for (const [_id, entry] of Object.entries(SUPPORTED_LANGUAGES)) {
      expect(typeof entry.name).toBe('string');
      expect(entry.name.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.aliases)).toBe(true);
    }
  });

  it('alias 충돌이 없다 (각 alias는 단일 언어에만 매핑)', () => {
    const seen = new Map<string, string>();
    for (const [id, entry] of Object.entries(SUPPORTED_LANGUAGES)) {
      for (const alias of entry.aliases) {
        if (seen.has(alias)) {
          throw new Error(`alias "${alias}" 중복: ${seen.get(alias)} vs ${id}`);
        }
        seen.set(alias, id);
      }
    }
  });
});

describe('codeBlockOptions', () => {
  it('defaultLanguage는 "text"', () => {
    expect(codeBlockOptions.defaultLanguage).toBe('text');
  });

  it('indentLineWithTab은 true', () => {
    expect(codeBlockOptions.indentLineWithTab).toBe(true);
  });

  it('supportedLanguages는 SUPPORTED_LANGUAGES와 동일', () => {
    expect(codeBlockOptions.supportedLanguages).toBe(SUPPORTED_LANGUAGES);
  });

  it('createHighlighter는 함수다', () => {
    expect(typeof codeBlockOptions.createHighlighter).toBe('function');
  });
});

describe('codeBlockOptions.createHighlighter', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('shiki를 dynamic import하고 듀얼 테마/23개 lang으로 createHighlighter 호출', async () => {
    const fakeCodeToTokens = vi.fn().mockReturnValue({ tokens: [] });
    const fakeHighlighter = { codeToTokens: fakeCodeToTokens };
    const createHighlighterMock = vi.fn().mockResolvedValue(fakeHighlighter);
    vi.doMock('shiki', () => ({ createHighlighter: createHighlighterMock }));

    const { codeBlockOptions: fresh } = await import('../codeBlock');
    const result = await fresh.createHighlighter!();

    expect(createHighlighterMock).toHaveBeenCalledTimes(1);
    const callArg = createHighlighterMock.mock.calls[0][0];
    expect(callArg.themes).toEqual(['github-light', 'one-dark-pro']);
    expect(callArg.langs).toHaveLength(23);
    expect(callArg.langs).toContain('javascript');
    expect(callArg.langs).toContain('kotlin');
    expect(result).toBe(fakeHighlighter);
  });

  it('codeToTokens 호출 시 themes: { light, dark }을 자동 주입한다', async () => {
    const originalCodeToTokens = vi.fn().mockReturnValue({ tokens: [] });
    const fakeHighlighter = { codeToTokens: originalCodeToTokens };
    const createHighlighterMock = vi.fn().mockResolvedValue(fakeHighlighter);
    vi.doMock('shiki', () => ({ createHighlighter: createHighlighterMock }));

    const { codeBlockOptions: fresh } = await import('../codeBlock');
    const highlighter = await fresh.createHighlighter!();

    // BlockNote's prosemirror-highlight integration calls codeToTokens with only `lang` and `theme`.
    (highlighter as any).codeToTokens('let x = 1;', { lang: 'javascript', theme: 'github-light' });

    expect(originalCodeToTokens).toHaveBeenCalledTimes(1);
    const passedOptions = originalCodeToTokens.mock.calls[0][1];
    expect(passedOptions.themes).toEqual({ light: 'github-light', dark: 'one-dark-pro' });
    // Original options preserved
    expect(passedOptions.lang).toBe('javascript');
    expect(passedOptions.theme).toBe('github-light');
  });
});
