import type { BridgeContext, MarkoraBridge, Theme, UploadResult } from '../types';

export function parseQueryContext(href: string): BridgeContext {
  const url = new URL(href);
  const filePath = url.searchParams.get('filePath') ?? '';
  const serverUrl = url.searchParams.get('serverUrl') ?? `${url.origin}/`;
  const dark = url.searchParams.get('dark') === 'true';
  return { filePath, serverUrl, initialTheme: dark ? 'dark' : 'light' };
}

export function createBridge(ctx: BridgeContext): MarkoraBridge {
  const themeListeners = new Set<(t: Theme) => void>();

  // Window-level callback Kotlin이 호출
  if (typeof window !== 'undefined') {
    window.markora = {
      applyTheme: (t: Theme) => {
        themeListeners.forEach(cb => cb(t));
      },
    };
  }

  return {
    getContext: () => ctx,

    async loadFile() {
      const res = await fetch(
        `${ctx.serverUrl}api/file/read?path=${encodeURIComponent(ctx.filePath)}`
      );
      if (!res.ok) throw new Error(`loadFile failed: ${res.status}`);
      const data = await res.json();
      return data.content ?? '';
    },

    async saveFile(markdown: string) {
      const res = await fetch(`${ctx.serverUrl}api/file/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: ctx.filePath, content: markdown }),
      });
      if (!res.ok) throw new Error(`saveFile failed: ${res.status}`);
    },

    async uploadImage(file: File): Promise<UploadResult> {
      const fd = new FormData();
      fd.append('file[]', file);
      const res = await fetch(
        `${ctx.serverUrl}api/upload?filePath=${encodeURIComponent(ctx.filePath)}`,
        { method: 'POST', body: fd }
      );
      if (!res.ok) throw new Error(`uploadImage failed: ${res.status}`);
      const json = await res.json();
      const succMap = json?.data?.succMap ?? {};
      const firstKey = Object.keys(succMap)[0];
      if (!firstKey) {
        throw new Error(`uploadImage: server returned no succMap entries (code=${json?.code})`);
      }
      const relativePath = succMap[firstKey] as string;
      const normalized = ctx.filePath.replace(/\\/g, '/');
      const dir = normalized.substring(0, normalized.lastIndexOf('/'));
      const absolutePath = `${dir}/${relativePath}`;
      const url = `${ctx.serverUrl}api/local-image?path=${encodeURIComponent(absolutePath)}`;
      return { url };
    },

    onThemeChange(cb) {
      themeListeners.add(cb);
      return () => themeListeners.delete(cb);
    },
  };
}

// 개발 환경(`vite`)에서 단독 실행 시 사용하는 mock
export function createMockBridge(): MarkoraBridge {
  let storedMd = '# Markora dev mock\n\n*편집 가능합니다.*\n';
  const themeListeners = new Set<(t: Theme) => void>();
  if (typeof window !== 'undefined') {
    window.markora = {
      applyTheme: (t: Theme) => themeListeners.forEach(cb => cb(t)),
    };
  }
  return {
    getContext: () => ({ filePath: '/dev/mock.md', serverUrl: 'http://localhost:5173/', initialTheme: 'light' }),
    async loadFile() { return storedMd; },
    async saveFile(md: string) { storedMd = md; console.log('[mock] saved', md.length, 'bytes'); },
    async uploadImage(file: File) { return { url: URL.createObjectURL(file) }; },
    onThemeChange(cb) { themeListeners.add(cb); return () => themeListeners.delete(cb); },
  };
}
