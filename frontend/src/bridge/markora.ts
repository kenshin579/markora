import type { BridgeContext, MarkoraBridge, Theme, UploadResult } from '../types';
import { splitFrontmatter, joinFrontmatter } from './transform';
import { collectImageUrlMap, restoreImagePaths } from './imageMap';

export function parseQueryContext(href: string): BridgeContext {
  const url = new URL(href);
  const filePath = url.searchParams.get('filePath') ?? '';
  const serverUrl = url.searchParams.get('serverUrl') ?? `${url.origin}/`;
  const dark = url.searchParams.get('dark') === 'true';
  return { filePath, serverUrl, initialTheme: dark ? 'dark' : 'light' };
}

export function createBridge(ctx: BridgeContext): MarkoraBridge {
  const themeListeners = new Set<(t: Theme) => void>();
  // 로드 시 떼어낸 frontmatter를 보관했다가 저장 시 그대로 다시 붙인다.
  // (frontmatter는 BlockNote를 거치지 않으므로 손상되지 않는다)
  let storedFrontmatter = '';
  // (BlockNote가 재작성한 절대 이미지 URL → 원본 경로) 매핑. 저장 시 역변환에 사용.
  const imageMap = new Map<string, string>();

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
      const { frontmatter, body } = splitFrontmatter(data.content ?? '');
      storedFrontmatter = frontmatter;
      // 본문의 상대경로 이미지를 BlockNote가 재작성할 절대 URL로 미리 매핑해 둔다.
      const baseUri = typeof document !== 'undefined' ? document.baseURI : ctx.serverUrl;
      for (const [abs, original] of collectImageUrlMap(body, baseUri)) {
        imageMap.set(abs, original);
      }
      return body;
    },

    async saveFile(markdown: string) {
      const restored = restoreImagePaths(markdown, imageMap);
      const content = joinFrontmatter(storedFrontmatter, restored);
      const res = await fetch(`${ctx.serverUrl}api/file/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: ctx.filePath, content }),
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
      // 저장 시 이 절대 URL을 파일에는 상대경로로 기록하도록 매핑 등록
      imageMap.set(url, relativePath);
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
