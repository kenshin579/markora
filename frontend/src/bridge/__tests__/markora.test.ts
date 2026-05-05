import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBridge, parseQueryContext } from '../markora';

describe('parseQueryContext', () => {
  it('reads filePath, serverUrl, dark from URL query', () => {
    const ctx = parseQueryContext(
      'http://localhost:63342/resources/blocknote/dist/index.html?filePath=%2Ftmp%2Ffoo.md&serverUrl=http%3A%2F%2Flocalhost%3A63342%2F&dark=true'
    );
    expect(ctx).toEqual({
      filePath: '/tmp/foo.md',
      serverUrl: 'http://localhost:63342/',
      initialTheme: 'dark',
    });
  });

  it('defaults to light theme when dark missing', () => {
    const ctx = parseQueryContext(
      'http://localhost/?filePath=%2Ftmp%2Fa.md&serverUrl=http%3A%2F%2Flocalhost%2F'
    );
    expect(ctx.initialTheme).toBe('light');
  });
});

describe('createBridge (real fetch)', () => {
  const ctx: import('../../types').BridgeContext = {
    filePath: '/tmp/x.md',
    serverUrl: 'http://localhost:9000/',
    initialTheme: 'light',
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('loadFile calls /api/file/read with filePath', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ content: '# hello' }),
    });
    const b = createBridge(ctx);
    const md = await b.loadFile();
    expect(md).toBe('# hello');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:9000/api/file/read?path=%2Ftmp%2Fx.md'
    );
  });

  it('saveFile POSTs JSON', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => ({}) });
    const b = createBridge(ctx);
    await b.saveFile('# updated');
    const call = (globalThis.fetch as any).mock.calls[0];
    expect(call[0]).toBe('http://localhost:9000/api/file/save');
    expect(call[1].method).toBe('POST');
    expect(JSON.parse(call[1].body)).toEqual({ path: '/tmp/x.md', content: '# updated' });
  });

  it('uploadImage POSTs multipart', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ code: 0, data: { succMap: { 'a.png': 'images/a.png' } } }),
    });
    const b = createBridge(ctx);
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const result = await b.uploadImage(file);
    expect(result.url).toContain('/api/local-image?path=');
    expect(result.url).toContain('images%2Fa.png');
  });
});

describe('uploadImage edge cases', () => {
  it('throws when server returns empty succMap', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ code: 1, data: { succMap: {} } }),
    });
    const b = createBridge({
      filePath: '/tmp/x.md',
      serverUrl: 'http://localhost:9000/',
      initialTheme: 'light',
    });
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    await expect(b.uploadImage(file)).rejects.toThrow(/no succMap entries/);
  });

  it('normalizes Windows backslash paths', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ code: 0, data: { succMap: { 'a.png': 'images/a.png' } } }),
    });
    const b = createBridge({
      filePath: 'C:\\Users\\foo\\bar.md',
      serverUrl: 'http://localhost:9000/',
      initialTheme: 'light',
    });
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const result = await b.uploadImage(file);
    // Path should not contain undefined and should use forward slashes
    expect(result.url).not.toContain('undefined');
    expect(result.url).toContain('C%3A%2FUsers%2Ffoo%2Fimages%2Fa.png');
  });
});

describe('onThemeChange', () => {
  it('subscribes and unsubscribes via returned function', () => {
    const b = createBridge({
      filePath: '/tmp/x.md',
      serverUrl: 'http://localhost:9000/',
      initialTheme: 'light',
    });
    const cb = vi.fn();
    const unsub = b.onThemeChange(cb);
    window.markora.applyTheme('dark');
    expect(cb).toHaveBeenCalledWith('dark');
    cb.mockClear();
    unsub();
    window.markora.applyTheme('light');
    expect(cb).not.toHaveBeenCalled();
  });
});
