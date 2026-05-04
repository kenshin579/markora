# BlockNote 마이그레이션 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Markora의 WYSIWYG 에디터를 Vditor 3.11.2에서 BlockNote 0.49.0로 원샷 교체하고, KaTeX(블록·인라인)와 Mermaid를 커스텀 블록으로 추가한다.

**Architecture:** `frontend/` Vite 서브프로젝트에서 React + BlockNote 번들을 빌드해 `src/main/resources/blocknote/dist/`에 산출. Kotlin 측 `PreviewStaticServer`가 이를 JCEF에 서빙. 기존 컨트롤러(파일 I/O, 이미지 업로드)는 그대로 재사용. 마크다운 라운드트립은 `customParse`의 preSerialize/postParse 훅으로 표준 코드블록 ↔ 커스텀 블록을 변환.

**Tech Stack:** Kotlin · IntelliJ Platform SDK · JCEF · Gradle · gradle-node-plugin 7.0.2 · Node 20.18.0 · Vite 5 · React 18 · TypeScript 5 · @blocknote/{core,react,mantine} 0.49 · KaTeX 0.16 · Mermaid 11 · Vitest · Testing Library

**Spec:** `docs/superpowers/specs/2026-05-04-blocknote-migration-design.md`

---

## File Structure

### Created

```
frontend/
├── .gitignore
├── package.json
├── package-lock.json                       (npm install 산출)
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── vitest.config.ts
├── index.html                              Vite 진입점
├── src/
│   ├── main.tsx                            React 부트스트랩
│   ├── styles.css                          전역 스타일 + BlockNote/Mantine import
│   ├── types.ts                            shared 타입 (BridgeContext, Theme 등)
│   ├── editor/
│   │   ├── Editor.tsx                      useCreateBlockNote + BlockNoteView + 라이프사이클
│   │   └── schema.ts                       BlockNoteSchema 합성
│   ├── blocks/
│   │   ├── KatexBlock.tsx                  블록 수식 (createReactBlockSpec)
│   │   ├── MermaidBlock.tsx                Mermaid 다이어그램
│   │   ├── ErrorBox.tsx                    공통 경고 박스 + Edit/Convert 액션
│   │   └── __tests__/
│   │       ├── katex.test.ts
│   │       ├── mermaid.test.ts
│   │       └── error-state.test.tsx
│   ├── inline/
│   │   ├── KatexInline.tsx                 인라인 수식 (createReactInlineContentSpec)
│   │   └── __tests__/
│   │       └── katex-inline.test.ts
│   ├── markdown/
│   │   ├── customParse.ts                  preSerialize/postParse + 인라인 $...$ 분리
│   │   └── __tests__/
│   │       └── roundtrip.test.ts
│   └── bridge/
│       ├── markora.ts                      Kotlin API 래퍼 + dev mock
│       └── __tests__/
│           └── markora.test.ts

docs/superpowers/poc/editor-comparison/     (poc/editor-comparison/에서 이동)
src/main/resources/blocknote/dist/          (Vite 산출물, gitignore)
```

### Modified

- `build.gradle.kts` — gradle-node-plugin 적용, buildFrontend/frontendTest 태스크
- `.gitignore` — frontend/node_modules, dist, .gradle/nodejs 등 추가
- `src/main/kotlin/.../editor/MarkdownHtmlPanel.kt` — 진입점 URL을 정적 서버 URL로 교체, query string으로 `filePath`/`dark` 전달
- `src/main/kotlin/.../editor/MarkdownFileEditor.kt` — 테마 변경 시 `window.markora.applyTheme(...)` 호출
- `src/main/kotlin/.../service/EditorSettingsService.kt` — `defaultMode`, `typewriterMode`, `showLineNumbers` 필드 제거
- `src/main/kotlin/.../settings/MarkdownEditorConfigurable.kt` — UI 항목 정리
- `src/main/kotlin/.../controller/ExportController.kt` — 호출처 제거(클래스는 유지)
- `README.md` — BlockNote, KaTeX/Mermaid만 언급, 사라진 기능 정리

### Deleted

- `src/main/resources/vditor/` (전체)
- `src/main/resources/template/editor.html`
- `MarkdownEditorConfigurable.kt` 안의 `defaultMode`/`showLineNumbers` UI 코드

---

## Pre-implementation 확인

- [ ] **현재 브랜치 확인**: `git branch --show-current` → `feature/blocknote-migration`
- [ ] **설계 spec 위치 확인**: `docs/superpowers/specs/2026-05-04-blocknote-migration-design.md` 존재
- [ ] **Node 버전 호환**: 시스템 node가 없어도 OK (gradle-node-plugin이 다운로드)

---

## Task 1: gradle-node-plugin 적용

**Files:**
- Modify: `build.gradle.kts`

- [ ] **Step 1: build.gradle.kts에 plugin과 node 설정 추가**

Edit `build.gradle.kts` — `plugins` 블록에 다음 한 줄을 추가:

```kotlin
plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.25"
    id("org.jetbrains.intellij.platform")
    id("com.github.node-gradle.node") version "7.0.2"   // 추가
}
```

`intellijPlatform { ... }` 블록 뒤(파일 끝부분)에 다음 추가:

```kotlin
node {
    version.set("20.18.0")
    npmVersion.set("10.8.2")
    download.set(true)
    workDir.set(file("${project.projectDir}/.gradle/nodejs"))
    nodeProjectDir.set(file("${project.projectDir}/frontend"))
}
```

- [ ] **Step 2: 플러그인이 인식되는지 검증**

Run: `./gradlew tasks --group=node`

Expected: `nodeSetup`, `npmSetup`, `npmInstall` 등 node 관련 태스크가 출력됨. 에러 없이 완료.

- [ ] **Step 3: 커밋**

```bash
git add build.gradle.kts
git commit -m "chore: gradle-node-plugin 7.0.2 추가

Vite 빌드 자동화를 위한 Node.js 통합. 시스템 Node 없이도
.gradle/nodejs/에 자동 다운로드(20.18.0)되어 CI 친화적.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Vite 서브프로젝트 스캐폴딩 + 빈 React 앱

**Files:**
- Create: `frontend/.gitignore`
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/styles.css`
- Modify: `build.gradle.kts` (buildFrontend 태스크)
- Modify: `.gitignore` (루트)

- [ ] **Step 1: frontend/.gitignore 작성**

```
node_modules/
.vite/
dist/
*.log
```

- [ ] **Step 2: frontend/package.json 작성**

```json
{
  "name": "markora-frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest"
  },
  "dependencies": {
    "@blocknote/core": "^0.49.0",
    "@blocknote/react": "^0.49.0",
    "@blocknote/mantine": "^0.49.0",
    "@mantine/core": "^8.3.11",
    "@mantine/hooks": "^8.3.11",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "katex": "^0.16.11",
    "mermaid": "^11.4.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "@testing-library/react": "^16.1.0",
    "@testing-library/jest-dom": "^6.6.3",
    "happy-dom": "^15.11.7",
    "typescript": "^5.7.2",
    "vite": "^5.4.11",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 3: frontend/tsconfig.json 작성**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "allowImportingTsExtensions": false,
    "noEmit": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: frontend/tsconfig.node.json 작성**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 5: frontend/vite.config.ts 작성**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '../src/main/resources/blocknote/dist'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          mermaid: ['mermaid'],
          katex: ['katex'],
        },
      },
    },
  },
  base: './',
  server: { port: 5173 },
});
```

- [ ] **Step 6: frontend/vitest.config.ts 작성**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
    css: false,
  },
});
```

- [ ] **Step 7: frontend/src/test-setup.ts 작성**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 8: frontend/index.html 작성**

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Markora Editor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 9: frontend/src/styles.css 작성 (최소)**

```css
html, body, #root { height: 100%; margin: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
```

- [ ] **Step 10: frontend/src/main.tsx 작성 (최소 — 빈 컴포넌트)**

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  return <div>Markora editor — bootstrapping...</div>;
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
```

- [ ] **Step 11: 루트 .gitignore 갱신**

기존 `.gitignore` 끝에 다음 추가:

```
# BlockNote 빌드 산출물 (Gradle이 항상 재생성)
src/main/resources/blocknote/dist/

# gradle-node-plugin이 다운로드한 node 바이너리
.gradle/nodejs/
```

- [ ] **Step 12: build.gradle.kts에 buildFrontend 태스크 추가**

`node { ... }` 블록 다음에 추가:

```kotlin
tasks.register<com.github.gradle.node.npm.task.NpmTask>("buildFrontend") {
    group = "build"
    description = "Bundle BlockNote editor with Vite"
    dependsOn("npmInstall")
    args.set(listOf("run", "build"))
    inputs.dir("frontend/src")
    inputs.file("frontend/package.json")
    inputs.file("frontend/package-lock.json")
    inputs.file("frontend/vite.config.ts")
    inputs.file("frontend/tsconfig.json")
    inputs.file("frontend/tsconfig.node.json")
    inputs.file("frontend/index.html")
    outputs.dir("src/main/resources/blocknote/dist")
}

tasks.named("processResources") {
    dependsOn("buildFrontend")
}

tasks.named("clean") {
    doLast {
        delete("src/main/resources/blocknote/dist")
    }
}
```

- [ ] **Step 13: 첫 빌드 실행**

Run: `./gradlew buildFrontend`

Expected: `npmInstall` 후 `vite build` 성공, `src/main/resources/blocknote/dist/index.html`과 `assets/` 생성됨. 첫 실행은 30~90초.

- [ ] **Step 14: 산출물 확인**

Run: `ls src/main/resources/blocknote/dist/`

Expected: `index.html`, `assets/` 디렉토리 존재.

- [ ] **Step 15: 커밋**

```bash
git add frontend/.gitignore frontend/package.json frontend/package-lock.json \
        frontend/tsconfig.json frontend/tsconfig.node.json \
        frontend/vite.config.ts frontend/vitest.config.ts \
        frontend/index.html frontend/src/main.tsx \
        frontend/src/styles.css frontend/src/test-setup.ts \
        build.gradle.kts .gitignore
git commit -m "feat(frontend): Vite + React 스캐폴딩

- Vite 5 + React 18 + TypeScript 5
- BlockNote/Mantine/KaTeX/Mermaid 의존성 선언
- Vitest + Testing Library 설정
- buildFrontend Gradle 태스크 (processResources에 연결)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: bridge/markora.ts (Kotlin API 래퍼 + dev mock)

**Files:**
- Create: `frontend/src/types.ts`
- Create: `frontend/src/bridge/markora.ts`
- Create: `frontend/src/bridge/__tests__/markora.test.ts`

- [ ] **Step 1: types.ts에 공통 타입 정의**

```ts
export type Theme = 'light' | 'dark';

export interface BridgeContext {
  filePath: string;
  serverUrl: string;
  initialTheme: Theme;
}

export interface UploadResult {
  url: string;
}

export interface MarkoraBridge {
  getContext(): BridgeContext;
  loadFile(): Promise<string>;
  saveFile(markdown: string): Promise<void>;
  uploadImage(file: File): Promise<UploadResult>;
  onThemeChange(cb: (t: Theme) => void): () => void;
}

declare global {
  interface Window {
    markora: {
      applyTheme: (t: Theme) => void;
    };
  }
}
```

- [ ] **Step 2: 실패하는 테스트 작성 (TDD red)**

`frontend/src/bridge/__tests__/markora.test.ts`:

```ts
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
```

- [ ] **Step 3: 테스트 실행해 실패 확인**

Run: `cd frontend && npx vitest run src/bridge/__tests__/markora.test.ts`

Expected: `Cannot find module '../markora'` 같은 에러로 FAIL.

- [ ] **Step 4: bridge/markora.ts 구현**

```ts
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
      const relativePath = succMap[firstKey] as string;
      const dir = ctx.filePath.substring(0, ctx.filePath.lastIndexOf('/'));
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
```

- [ ] **Step 5: 테스트 실행해 통과 확인**

Run: `cd frontend && npx vitest run src/bridge/__tests__/markora.test.ts`

Expected: 모든 테스트 PASS.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/types.ts frontend/src/bridge/
git commit -m "feat(frontend): bridge/markora.ts (Kotlin API 래퍼 + dev mock)

- parseQueryContext: URL query에서 filePath/serverUrl/theme 추출
- createBridge: load/save/upload/theme-change API
- createMockBridge: vite dev 서버용 mock 구현
- TDD: bridge/__tests__/markora.test.ts (4 케이스)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: BlockNote 기본 에디터 + Editor.tsx 라이프사이클

**Files:**
- Create: `frontend/src/editor/schema.ts`
- Create: `frontend/src/editor/Editor.tsx`
- Modify: `frontend/src/main.tsx` (mock/real bridge 분기 + Editor 마운트)
- Modify: `frontend/src/styles.css` (BlockNote/Mantine CSS import)

- [ ] **Step 1: schema.ts (초안 — 기본 spec만)**

```ts
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from '@blocknote/core';

// KaTeX/Mermaid는 Task 6,7에서 이 schema에 추가됨
export const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs },
  inlineContentSpecs: { ...defaultInlineContentSpecs },
});
```

- [ ] **Step 2: Editor.tsx 작성 (load/save/외부변경/테마)**

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import '@blocknote/mantine/style.css';
import type { MarkoraBridge, Theme } from '../types';
import { schema } from './schema';

interface Props {
  bridge: MarkoraBridge;
}

export function Editor({ bridge }: Props) {
  const editor = useCreateBlockNote({ schema });
  const [theme, setTheme] = useState<Theme>(bridge.getContext().initialTheme);
  const [status, setStatus] = useState<string>('Ready');
  const isDirtyRef = useRef(false);
  const lastKnownContentRef = useRef<string>('');
  const saveTimerRef = useRef<number | null>(null);

  // 초기 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const md = await bridge.loadFile();
        if (cancelled) return;
        const blocks = await editor.tryParseMarkdownToBlocks(md);
        editor.replaceBlocks(editor.document, blocks);
        lastKnownContentRef.current = md;
        isDirtyRef.current = false;
        setStatus('Ready');
      } catch (e) {
        console.error(e);
        setStatus('Load failed');
      }
    })();
    return () => { cancelled = true; };
  }, [bridge, editor]);

  // onChange → 디바운스 저장
  useEffect(() => {
    return editor.onChange(() => {
      isDirtyRef.current = true;
      setStatus('Modified');
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(async () => {
        try {
          setStatus('Saving...');
          const md = await editor.blocksToMarkdownLossy(editor.document);
          await bridge.saveFile(md);
          lastKnownContentRef.current = md;
          isDirtyRef.current = false;
          setStatus('Saved');
          window.setTimeout(() => {
            if (!isDirtyRef.current) setStatus('Ready');
          }, 2000);
        } catch (e) {
          console.error(e);
          setStatus('Save failed (kept previous)');
        }
      }, 1000);
    });
  }, [editor, bridge]);

  // 외부 변경 감지 (focus)
  useEffect(() => {
    const handler = async () => {
      if (isDirtyRef.current) return;
      try {
        const md = await bridge.loadFile();
        if (md === lastKnownContentRef.current) return;
        const blocks = await editor.tryParseMarkdownToBlocks(md);
        editor.replaceBlocks(editor.document, blocks);
        lastKnownContentRef.current = md;
      } catch { /* 무시 */ }
    };
    window.addEventListener('focus', handler);
    return () => window.removeEventListener('focus', handler);
  }, [bridge, editor]);

  // 테마 동기화
  useEffect(() => {
    return bridge.onThemeChange((t) => setTheme(t));
  }, [bridge]);

  return (
    <div className="markora-shell">
      <BlockNoteView editor={editor} theme={theme} />
      <div className="markora-status" data-status={status}>{status}</div>
    </div>
  );
}
```

- [ ] **Step 3: styles.css 갱신**

`frontend/src/styles.css`를 다음으로 교체:

```css
html, body, #root { height: 100%; margin: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }

.markora-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.markora-shell .bn-container { flex: 1; min-height: 0; overflow: auto; }
.markora-status {
  padding: 4px 12px;
  font-size: 12px;
  color: #777;
  border-top: 1px solid #e0e3e8;
  background: #fafbfc;
}
[data-mantine-color-scheme="dark"] .markora-status {
  color: #aaa;
  background: #2b2d30;
  border-top-color: #3c3f41;
}
```

- [ ] **Step 4: main.tsx 갱신 — bridge 분기 + Editor 마운트**

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import './styles.css';
import { createBridge, createMockBridge, parseQueryContext } from './bridge/markora';
import { Editor } from './editor/Editor';
import type { MarkoraBridge } from './types';

const isDev = import.meta.env.DEV && !window.location.search.includes('filePath=');
const bridge: MarkoraBridge = isDev
  ? createMockBridge()
  : createBridge(parseQueryContext(window.location.href));

function App() {
  const [theme, setTheme] = React.useState(bridge.getContext().initialTheme);
  React.useEffect(() => bridge.onThemeChange(setTheme), []);
  return (
    <MantineProvider defaultColorScheme={theme} forceColorScheme={theme}>
      <Editor bridge={bridge} />
    </MantineProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
```

- [ ] **Step 5: 빌드 검증**

Run: `cd frontend && npm run build`

Expected: 에러 없이 완료, `../src/main/resources/blocknote/dist/`에 `index.html`, `assets/index-*.js`, `assets/index-*.css` 생성.

- [ ] **Step 6: dev 서버에서 mock으로 동작 확인 (수동)**

Run: `cd frontend && npm run dev`

브라우저로 `http://localhost:5173/` 접속. 빈 BlockNote 에디터가 떠야 하고 mock markdown(`# Markora dev mock`)이 보여야 함. 입력 후 1초 뒤 콘솔에 `[mock] saved`. Ctrl+C로 종료.

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/editor/ frontend/src/main.tsx frontend/src/styles.css
git commit -m "feat(frontend): BlockNote 기본 에디터 + 라이프사이클

- Editor.tsx: useCreateBlockNote + BlockNoteView
- 초기 로드, onChange 1초 디바운스 저장, focus 외부변경 reload
- 테마 동기화 (MantineProvider + BlockNoteView theme)
- main.tsx: dev mock vs real bridge 자동 분기

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: 마크다운 라운드트립 (preSerialize/postParse)

**Files:**
- Create: `frontend/src/markdown/customParse.ts`
- Create: `frontend/src/markdown/__tests__/roundtrip.test.ts`
- Modify: `frontend/src/editor/Editor.tsx` (변환 훅 적용)

KaTeX/Mermaid 블록 타입은 Task 6,7에서 정의되지만 변환 훅은 type 이름과 props 구조만 알면 작성 가능. customParse는 type 이름을 문자열 비교만 하므로 미리 작성 가능.

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/markdown/__tests__/roundtrip.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { preSerialize, postParse } from '../customParse';

describe('preSerialize: custom block → standard codeBlock', () => {
  it('katex 블록을 ```math 코드블록으로 치환', () => {
    const blocks = [{ type: 'katex', props: { source: 'x^2' } }];
    expect(preSerialize(blocks as any)).toEqual([
      {
        type: 'codeBlock',
        props: { language: 'math' },
        content: [{ type: 'text', text: 'x^2', styles: {} }],
      },
    ]);
  });

  it('mermaid 블록을 ```mermaid 코드블록으로 치환', () => {
    const blocks = [{ type: 'mermaid', props: { source: 'graph TD\nA-->B' } }];
    expect(preSerialize(blocks as any)).toEqual([
      {
        type: 'codeBlock',
        props: { language: 'mermaid' },
        content: [{ type: 'text', text: 'graph TD\nA-->B', styles: {} }],
      },
    ]);
  });

  it('표준 블록은 그대로 반환', () => {
    const blocks = [{ type: 'paragraph', content: [{ type: 'text', text: 'hi', styles: {} }] }];
    expect(preSerialize(blocks as any)).toEqual(blocks);
  });

  it('children 재귀 처리', () => {
    const blocks = [{
      type: 'bulletListItem',
      content: [{ type: 'text', text: 'top', styles: {} }],
      children: [{ type: 'katex', props: { source: 'a' } }],
    }];
    const out = preSerialize(blocks as any);
    expect((out[0] as any).children[0].type).toBe('codeBlock');
  });
});

describe('postParse: standard codeBlock → custom block', () => {
  it('```math 코드블록을 katex 블록으로', () => {
    const blocks = [{
      type: 'codeBlock',
      props: { language: 'math' },
      content: [{ type: 'text', text: 'x^2', styles: {} }],
    }];
    expect(postParse(blocks as any)).toEqual([
      { type: 'katex', props: { source: 'x^2' } },
    ]);
  });

  it('```mermaid 코드블록을 mermaid 블록으로', () => {
    const blocks = [{
      type: 'codeBlock',
      props: { language: 'mermaid' },
      content: [{ type: 'text', text: 'graph TD\nA-->B', styles: {} }],
    }];
    expect(postParse(blocks as any)).toEqual([
      { type: 'mermaid', props: { source: 'graph TD\nA-->B' } },
    ]);
  });

  it('다른 언어 코드블록은 그대로', () => {
    const blocks = [{
      type: 'codeBlock',
      props: { language: 'javascript' },
      content: [{ type: 'text', text: 'let x = 1;', styles: {} }],
    }];
    expect(postParse(blocks as any)).toEqual(blocks);
  });
});

describe('인라인 수식 분리', () => {
  // splitInlineMath 함수: 인라인 KaTeX 처리는 Task 6에서 추가
  // 여기서는 helper 형태로만 검증
  it('"text $a^2$ tail" → ["text ", katex(a^2), " tail"]', () => {
    const { splitInlineMath } = require('../customParse');
    const out = splitInlineMath([{ type: 'text', text: 'text $a^2$ tail', styles: {} }]);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ type: 'text', text: 'text ', styles: {} });
    expect(out[1]).toEqual({ type: 'katexInline', props: { source: 'a^2' } });
    expect(out[2]).toEqual({ type: 'text', text: ' tail', styles: {} });
  });

  it('수식 없으면 입력 그대로', () => {
    const { splitInlineMath } = require('../customParse');
    const input = [{ type: 'text', text: 'no math here', styles: {} }];
    expect(splitInlineMath(input)).toEqual(input);
  });

  it('직렬화: katexInline → "$source$" 텍스트', () => {
    const { joinInlineMath } = require('../customParse');
    const input = [
      { type: 'text', text: 'a ', styles: {} },
      { type: 'katexInline', props: { source: 'x^2' } },
      { type: 'text', text: ' b', styles: {} },
    ];
    expect(joinInlineMath(input)).toEqual([
      { type: 'text', text: 'a $x^2$ b', styles: {} },
    ]);
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `cd frontend && npx vitest run src/markdown`

Expected: import 실패로 FAIL.

- [ ] **Step 3: customParse.ts 구현**

```ts
type AnyBlock = {
  type: string;
  props?: Record<string, any>;
  content?: any;
  children?: AnyBlock[];
};

type InlineNode =
  | { type: 'text'; text: string; styles: Record<string, any> }
  | { type: 'link'; href: string; content: InlineNode[] }
  | { type: 'katexInline'; props: { source: string } };

const codeBlock = (language: string, source: string): AnyBlock => ({
  type: 'codeBlock',
  props: { language },
  content: [{ type: 'text', text: source, styles: {} }],
});

const codeContent = (b: AnyBlock): string => {
  if (Array.isArray(b.content) && b.content.length > 0 && b.content[0].type === 'text') {
    return b.content[0].text ?? '';
  }
  return '';
};

export function preSerialize(blocks: AnyBlock[]): AnyBlock[] {
  return blocks.map(b => {
    if (b.type === 'katex')   return codeBlock('math',    b.props?.source ?? '');
    if (b.type === 'mermaid') return codeBlock('mermaid', b.props?.source ?? '');
    if (Array.isArray(b.content)) {
      return { ...b, content: joinInlineMath(b.content as InlineNode[]),
               children: b.children ? preSerialize(b.children) : undefined };
    }
    if (b.children?.length) return { ...b, children: preSerialize(b.children) };
    return b;
  });
}

export function postParse(blocks: AnyBlock[]): AnyBlock[] {
  return blocks.map(b => {
    if (b.type === 'codeBlock' && b.props?.language === 'math') {
      return { type: 'katex',   props: { source: codeContent(b) } };
    }
    if (b.type === 'codeBlock' && b.props?.language === 'mermaid') {
      return { type: 'mermaid', props: { source: codeContent(b) } };
    }
    if (Array.isArray(b.content)) {
      return { ...b, content: splitInlineMath(b.content as InlineNode[]),
               children: b.children ? postParse(b.children) : undefined };
    }
    if (b.children?.length) return { ...b, children: postParse(b.children) };
    return b;
  });
}

const INLINE_MATH_RE = /\$([^$\n]+?)\$/g;

export function splitInlineMath(nodes: InlineNode[]): InlineNode[] {
  const out: InlineNode[] = [];
  for (const n of nodes) {
    if (n.type !== 'text') { out.push(n); continue; }
    INLINE_MATH_RE.lastIndex = 0;
    if (!INLINE_MATH_RE.test(n.text)) { out.push(n); continue; }
    INLINE_MATH_RE.lastIndex = 0;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = INLINE_MATH_RE.exec(n.text)) !== null) {
      if (m.index > last) out.push({ type: 'text', text: n.text.slice(last, m.index), styles: n.styles });
      out.push({ type: 'katexInline', props: { source: m[1] } });
      last = m.index + m[0].length;
    }
    if (last < n.text.length) out.push({ type: 'text', text: n.text.slice(last), styles: n.styles });
  }
  return out;
}

export function joinInlineMath(nodes: InlineNode[]): InlineNode[] {
  // 인라인 KaTeX 노드를 $source$ 텍스트로 직렬화하면서 인접 텍스트와 병합
  const result: InlineNode[] = [];
  for (const n of nodes) {
    let serialized: InlineNode;
    if (n.type === 'katexInline') {
      serialized = { type: 'text', text: `$${n.props.source}$`, styles: {} };
    } else {
      serialized = n;
    }
    const prev = result[result.length - 1];
    if (prev && prev.type === 'text' && serialized.type === 'text' &&
        JSON.stringify(prev.styles) === JSON.stringify(serialized.styles)) {
      prev.text += serialized.text;
    } else {
      result.push(serialized);
    }
  }
  return result;
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `cd frontend && npx vitest run src/markdown`

Expected: 모든 테스트 PASS.

- [ ] **Step 5: Editor.tsx에 변환 훅 적용**

`Editor.tsx`의 두 곳을 수정.

(1) 로드 시 `tryParseMarkdownToBlocks` 직후에 `postParse` 적용:

```tsx
import { postParse, preSerialize } from '../markdown/customParse';
// ...
const blocks = await editor.tryParseMarkdownToBlocks(md);
editor.replaceBlocks(editor.document, postParse(blocks as any) as any);
```

이 로직을 초기 로드 useEffect와 외부 변경 useEffect 둘 다에 적용.

(2) 저장 시 `blocksToMarkdownLossy` 직전에 `preSerialize` 적용:

```tsx
const md = await editor.blocksToMarkdownLossy(preSerialize(editor.document as any) as any);
```

- [ ] **Step 6: 빌드 확인**

Run: `cd frontend && npm run build`

Expected: 타입 에러 없이 빌드 성공.

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/markdown/ frontend/src/editor/Editor.tsx
git commit -m "feat(frontend): 마크다운 라운드트립 (preSerialize/postParse)

- preSerialize: katex/mermaid 블록 → ```math/```mermaid 코드블록
- postParse: 역방향 + paragraph inline content $...$ 분리
- splitInlineMath/joinInlineMath: 인라인 수식 분리/병합
- Editor.tsx에 훅 적용 (load/save/외부변경)
- TDD: 8 케이스 (블록/인라인/재귀/edge)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: KaTeX 블록 + 인라인 수식

**Files:**
- Create: `frontend/src/blocks/KatexBlock.tsx`
- Create: `frontend/src/inline/KatexInline.tsx`
- Create: `frontend/src/blocks/__tests__/katex.test.ts`
- Create: `frontend/src/inline/__tests__/katex-inline.test.ts`
- Modify: `frontend/src/editor/schema.ts` (블록 추가)
- Modify: `frontend/src/editor/Editor.tsx` (커스텀 슬래시 메뉴 통합)

- [ ] **Step 1: KatexBlock 단위 테스트 작성 (실패)**

`frontend/src/blocks/__tests__/katex.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderKatexToHtml } from '../KatexBlock';

describe('renderKatexToHtml', () => {
  it('valid LaTeX → KaTeX HTML', () => {
    const { html, error } = renderKatexToHtml('x^2 + y^2 = z^2');
    expect(error).toBeNull();
    expect(html).toContain('katex');
  });

  it('invalid LaTeX → error 반환', () => {
    const { html, error } = renderKatexToHtml('\\alfa^2');
    expect(error).not.toBeNull();
    expect(html).toBe('');
  });

  it('빈 source → 빈 HTML, 에러 없음', () => {
    const { html, error } = renderKatexToHtml('');
    expect(error).toBeNull();
    expect(html).toBe('');
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `cd frontend && npx vitest run src/blocks/__tests__/katex.test.ts`

Expected: import 실패로 FAIL.

- [ ] **Step 3: KatexBlock.tsx 구현**

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { ErrorBox } from './ErrorBox';

export function renderKatexToHtml(source: string): { html: string; error: string | null } {
  if (!source) return { html: '', error: null };
  try {
    const html = katex.renderToString(source, {
      throwOnError: true,
      displayMode: true,
    });
    return { html, error: null };
  } catch (e: any) {
    return { html: '', error: e?.message ?? 'KaTeX render error' };
  }
}

export const KatexBlock = createReactBlockSpec(
  {
    type: 'katex',
    propSchema: { source: { default: '' } },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const [editing, setEditing] = useState(!block.props.source);
      const [draft, setDraft] = useState(block.props.source);
      const [debounced, setDebounced] = useState(block.props.source);
      const timerRef = useRef<number | null>(null);

      useEffect(() => {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setDebounced(draft), 300);
        return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
      }, [draft]);

      const commit = () => {
        editor.updateBlock(block, { type: 'katex', props: { source: draft } } as any);
        setEditing(false);
      };

      if (editing) {
        return (
          <div className="markora-katex-edit">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
                  e.preventDefault(); commit();
                }
              }}
              rows={Math.max(2, draft.split('\n').length)}
              placeholder="LaTeX (예: \\sum_{i=0}^{n} i^2)"
            />
          </div>
        );
      }

      const { html, error } = renderKatexToHtml(debounced);
      if (error) {
        return (
          <ErrorBox
            kind="LaTeX"
            message={error}
            onEdit={() => setEditing(true)}
            onConvertToCode={() =>
              editor.updateBlock(block, {
                type: 'codeBlock',
                props: { language: 'math' },
                content: [{ type: 'text', text: block.props.source, styles: {} }],
              } as any)
            }
          />
        );
      }
      return (
        <div
          className="markora-katex-render"
          onClick={() => setEditing(true)}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    },
  }
);
```

- [ ] **Step 4: ErrorBox.tsx 작성 (Task 8에서도 재사용)**

```tsx
import React from 'react';

interface Props {
  kind: 'LaTeX' | 'Mermaid';
  message: string;
  onEdit: () => void;
  onConvertToCode: () => void;
}

export function ErrorBox({ kind, message, onEdit, onConvertToCode }: Props) {
  return (
    <div className="markora-error-box" role="alert">
      <div className="markora-error-title">⚠ {kind} 파싱 에러</div>
      <pre className="markora-error-message">{message}</pre>
      <div className="markora-error-hint">
        코드를 수정하거나 일반 코드블록으로 변환하세요.
      </div>
      <div className="markora-error-actions">
        <button onClick={onEdit}>Edit</button>
        <button onClick={onConvertToCode}>↓ Plain</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 인라인 수식 단위 테스트 작성**

`frontend/src/inline/__tests__/katex-inline.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { splitInlineMath, joinInlineMath } from '../../markdown/customParse';

describe('인라인 수식 라운드트립', () => {
  it('split 후 join으로 원본 텍스트 복원', () => {
    const original = [{ type: 'text', text: '식: $a+b$ 와 $c-d$', styles: {} }] as any;
    const split = splitInlineMath(original);
    expect(split).toHaveLength(4);
    const back = joinInlineMath(split);
    expect(back).toEqual([{ type: 'text', text: '식: $a+b$ 와 $c-d$', styles: {} }]);
  });
});
```

- [ ] **Step 6: KatexInline.tsx 작성**

```tsx
import React, { useState } from 'react';
import { createReactInlineContentSpec } from '@blocknote/react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export const KatexInline = createReactInlineContentSpec(
  {
    type: 'katexInline',
    propSchema: { source: { default: '' } },
    content: 'none',
  },
  {
    render: ({ inlineContent, updateInlineContent }) => {
      const [editing, setEditing] = useState(false);
      const [draft, setDraft] = useState(inlineContent.props.source);

      if (editing) {
        return (
          <span className="markora-katex-inline-edit">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                updateInlineContent({ type: 'katexInline', props: { source: draft }, content: undefined } as any);
                setEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
          </span>
        );
      }

      let html = '';
      let error: string | null = null;
      try {
        html = katex.renderToString(inlineContent.props.source, { displayMode: false, throwOnError: true });
      } catch (e: any) {
        error = e?.message ?? 'error';
      }
      if (error) {
        return (
          <span className="markora-katex-inline-error" onClick={() => setEditing(true)} title={error}>
            ⚠ ${inlineContent.props.source}$
          </span>
        );
      }
      return (
        <span
          className="markora-katex-inline"
          onClick={() => setEditing(true)}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    },
  }
);
```

- [ ] **Step 7: schema.ts에 KaTeX 추가**

```ts
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from '@blocknote/core';
import { KatexBlock } from '../blocks/KatexBlock';
import { KatexInline } from '../inline/KatexInline';

export const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, katex: KatexBlock },
  inlineContentSpecs: { ...defaultInlineContentSpecs, katexInline: KatexInline },
});
```

- [ ] **Step 8: Editor.tsx에 슬래시 메뉴 항목 추가**

`Editor.tsx` 상단에 import:

```tsx
import { SuggestionMenuController, getDefaultReactSlashMenuItems } from '@blocknote/react';
```

`<BlockNoteView ...>` 사용을 다음과 같이 변경 (slashMenu 비활성화 + 커스텀 controller):

```tsx
<BlockNoteView editor={editor} theme={theme} slashMenu={false}>
  <SuggestionMenuController
    triggerCharacter="/"
    getItems={async (query) => {
      const defaults = getDefaultReactSlashMenuItems(editor as any);
      const customs = [
        {
          title: 'Math (block)',
          aliases: ['math', 'latex', 'equation', '수식'],
          group: 'Advanced',
          onItemClick: () => {
            editor.insertBlocks([{ type: 'katex', props: { source: '' } } as any], editor.getTextCursorPosition().block, 'after');
          },
        },
        {
          title: 'Math (inline)',
          aliases: ['equation', 'inline', '인라인'],
          group: 'Advanced',
          onItemClick: () => {
            editor.insertInlineContent([{ type: 'katexInline', props: { source: 'x' } } as any]);
          },
        },
      ];
      const all = [...defaults, ...customs];
      const q = query.toLowerCase();
      return all.filter(it =>
        it.title.toLowerCase().includes(q) ||
        (it as any).aliases?.some((a: string) => a.toLowerCase().includes(q))
      );
    }}
  />
</BlockNoteView>
```

- [ ] **Step 9: KaTeX/인라인 CSS 추가**

`frontend/src/styles.css` 끝에 추가:

```css
.markora-katex-render { padding: 8px 0; cursor: pointer; }
.markora-katex-edit textarea { width: 100%; font-family: ui-monospace, monospace; padding: 8px; box-sizing: border-box; }
.markora-katex-inline { cursor: pointer; }
.markora-katex-inline-error { color: #c00; cursor: pointer; }
.markora-katex-inline-edit input { font-family: ui-monospace, monospace; padding: 1px 4px; min-width: 80px; }
.markora-error-box {
  border: 1px solid #f0c36d;
  background: #fff8e1;
  border-radius: 4px;
  padding: 10px 12px;
  font-size: 13px;
  color: #6b4f00;
  margin: 8px 0;
}
.markora-error-title { font-weight: 600; margin-bottom: 4px; }
.markora-error-message { font-family: ui-monospace, monospace; white-space: pre-wrap; margin: 4px 0; font-size: 12px; }
.markora-error-hint { font-size: 12px; color: #8a6d00; margin-bottom: 8px; }
.markora-error-actions { display: flex; gap: 8px; }
.markora-error-actions button { padding: 4px 12px; border: 1px solid #d6b35c; background: #fff; border-radius: 3px; cursor: pointer; font-size: 12px; }
.markora-error-actions button:hover { background: #fef3c7; }
[data-mantine-color-scheme="dark"] .markora-error-box { background: #3a2f0e; color: #f0d780; border-color: #8a6d00; }
[data-mantine-color-scheme="dark"] .markora-error-actions button { background: #2b2d30; color: #f0d780; border-color: #8a6d00; }
```

- [ ] **Step 10: 테스트 실행해 통과 확인**

Run: `cd frontend && npx vitest run src/blocks/__tests__/katex.test.ts src/inline/__tests__/katex-inline.test.ts`

Expected: 모든 테스트 PASS.

- [ ] **Step 11: 빌드 확인**

Run: `cd frontend && npm run build`

Expected: 빌드 성공, `assets/katex-*.js` 청크 생성.

- [ ] **Step 12: 커밋**

```bash
git add frontend/src/blocks/KatexBlock.tsx frontend/src/blocks/ErrorBox.tsx \
        frontend/src/inline/ frontend/src/blocks/__tests__/katex.test.ts \
        frontend/src/editor/schema.ts frontend/src/editor/Editor.tsx \
        frontend/src/styles.css
git commit -m "feat(frontend): KaTeX 블록 + 인라인 수식

- KatexBlock: createReactBlockSpec, 편집/렌더 토글, 300ms 디바운스
- KatexInline: createReactInlineContentSpec, 클릭→편집 popup
- ErrorBox: 공통 경고 박스 (Edit/Convert 액션)
- schema에 katex/katexInline 추가
- 슬래시 메뉴: /math (블록), /equation (인라인)
- TDD: 4 케이스

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Mermaid 블록

**Files:**
- Create: `frontend/src/blocks/MermaidBlock.tsx`
- Create: `frontend/src/blocks/__tests__/mermaid.test.ts`
- Modify: `frontend/src/editor/schema.ts`
- Modify: `frontend/src/editor/Editor.tsx` (슬래시 메뉴 항목 추가)

- [ ] **Step 1: 단위 테스트 작성 (실패)**

`frontend/src/blocks/__tests__/mermaid.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (id: string, source: string) => {
      if (source.includes('INVALID')) throw new Error('Parse error: INVALID');
      return { svg: `<svg id="${id}">${source}</svg>` };
    }),
  },
}));

import { renderMermaidToSvg, initMermaid } from '../MermaidBlock';

describe('renderMermaidToSvg', () => {
  beforeEach(() => initMermaid('light'));

  it('valid source → SVG 문자열', async () => {
    const { svg, error } = await renderMermaidToSvg('m1', 'graph TD\nA-->B');
    expect(error).toBeNull();
    expect(svg).toContain('<svg');
  });

  it('invalid source → 에러 메시지', async () => {
    const { svg, error } = await renderMermaidToSvg('m2', 'INVALID');
    expect(error).toContain('Parse error');
    expect(svg).toBe('');
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `cd frontend && npx vitest run src/blocks/__tests__/mermaid.test.ts`

Expected: import 실패로 FAIL.

- [ ] **Step 3: MermaidBlock.tsx 구현**

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import mermaid from 'mermaid';
import { ErrorBox } from './ErrorBox';

let initialized = false;
export function initMermaid(theme: 'light' | 'dark') {
  mermaid.initialize({
    startOnLoad: false,
    theme: theme === 'dark' ? 'dark' : 'default',
    securityLevel: 'strict',
  });
  initialized = true;
}

export async function renderMermaidToSvg(id: string, source: string): Promise<{ svg: string; error: string | null }> {
  if (!source.trim()) return { svg: '', error: null };
  if (!initialized) initMermaid('light');
  try {
    const { svg } = await mermaid.render(id, source);
    return { svg, error: null };
  } catch (e: any) {
    return { svg: '', error: e?.message ?? 'Mermaid render error' };
  }
}

let counter = 0;
const nextId = () => `markora-mermaid-${++counter}`;

export const MermaidBlock = createReactBlockSpec(
  {
    type: 'mermaid',
    propSchema: { source: { default: '' } },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const [editing, setEditing] = useState(!block.props.source);
      const [draft, setDraft] = useState(block.props.source);
      const [debounced, setDebounced] = useState(block.props.source);
      const [svg, setSvg] = useState<string>('');
      const [error, setError] = useState<string | null>(null);
      const timerRef = useRef<number | null>(null);
      const idRef = useRef<string>(nextId());

      useEffect(() => {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setDebounced(draft), 300);
        return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
      }, [draft]);

      useEffect(() => {
        let cancelled = false;
        (async () => {
          const r = await renderMermaidToSvg(idRef.current, debounced);
          if (!cancelled) { setSvg(r.svg); setError(r.error); }
        })();
        return () => { cancelled = true; };
      }, [debounced]);

      const commit = () => {
        editor.updateBlock(block, { type: 'mermaid', props: { source: draft } } as any);
        setEditing(false);
      };

      if (editing) {
        return (
          <div className="markora-mermaid-edit">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
                  e.preventDefault(); commit();
                }
              }}
              rows={Math.max(4, draft.split('\n').length)}
              placeholder="Mermaid (예: graph TD\nA-->B)"
            />
          </div>
        );
      }

      if (error) {
        return (
          <ErrorBox
            kind="Mermaid"
            message={error}
            onEdit={() => setEditing(true)}
            onConvertToCode={() =>
              editor.updateBlock(block, {
                type: 'codeBlock',
                props: { language: 'mermaid' },
                content: [{ type: 'text', text: block.props.source, styles: {} }],
              } as any)
            }
          />
        );
      }
      return (
        <div
          className="markora-mermaid-render"
          onClick={() => setEditing(true)}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      );
    },
  }
);
```

- [ ] **Step 4: schema.ts에 Mermaid 추가**

```ts
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from '@blocknote/core';
import { KatexBlock } from '../blocks/KatexBlock';
import { MermaidBlock } from '../blocks/MermaidBlock';
import { KatexInline } from '../inline/KatexInline';

export const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, katex: KatexBlock, mermaid: MermaidBlock },
  inlineContentSpecs: { ...defaultInlineContentSpecs, katexInline: KatexInline },
});
```

- [ ] **Step 5: Editor.tsx 슬래시 메뉴에 Mermaid 추가**

기존 `customs` 배열에 다음 객체를 추가:

```tsx
{
  title: 'Mermaid',
  aliases: ['mermaid', 'diagram', 'flowchart', '다이어그램'],
  group: 'Advanced',
  onItemClick: () => {
    editor.insertBlocks(
      [{ type: 'mermaid', props: { source: '' } } as any],
      editor.getTextCursorPosition().block,
      'after'
    );
  },
},
```

- [ ] **Step 6: Mermaid CSS 추가**

`frontend/src/styles.css` 끝에 추가:

```css
.markora-mermaid-render { padding: 12px; cursor: pointer; text-align: center; }
.markora-mermaid-render svg { max-width: 100%; }
.markora-mermaid-edit textarea { width: 100%; font-family: ui-monospace, monospace; padding: 8px; box-sizing: border-box; }
```

- [ ] **Step 7: 테스트 실행해 통과 확인**

Run: `cd frontend && npx vitest run src/blocks/__tests__/mermaid.test.ts`

Expected: 모든 테스트 PASS.

- [ ] **Step 8: 빌드 확인**

Run: `cd frontend && npm run build`

Expected: 빌드 성공, `assets/mermaid-*.js` 청크 생성.

- [ ] **Step 9: 커밋**

```bash
git add frontend/src/blocks/MermaidBlock.tsx \
        frontend/src/blocks/__tests__/mermaid.test.ts \
        frontend/src/editor/schema.ts \
        frontend/src/editor/Editor.tsx \
        frontend/src/styles.css
git commit -m "feat(frontend): Mermaid 다이어그램 블록

- MermaidBlock: createReactBlockSpec + initMermaid/renderMermaidToSvg
- 300ms 디바운스, 비동기 렌더, lazy chunk
- 슬래시 메뉴 /mermaid (한국어 별칭 포함)
- TDD: 2 케이스 (mermaid 모듈 mock)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: 에러 박스 통합 검증 + 잔여 케이스

ErrorBox 자체는 Task 6에서 작성됨. 이 Task는 **에러 상태 RTL 테스트**와 톤 다듬기.

**Files:**
- Create: `frontend/src/blocks/__tests__/error-state.test.tsx`

- [ ] **Step 1: 에러 박스 RTL 테스트 작성 (실패)**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBox } from '../ErrorBox';

describe('ErrorBox', () => {
  it('kind/message가 화면에 표시됨', () => {
    render(<ErrorBox kind="LaTeX" message="Undefined control sequence" onEdit={() => {}} onConvertToCode={() => {}} />);
    expect(screen.getByText(/LaTeX 파싱 에러/)).toBeInTheDocument();
    expect(screen.getByText(/Undefined control sequence/)).toBeInTheDocument();
  });

  it('Edit 버튼 클릭 시 onEdit 콜백', () => {
    const onEdit = vi.fn();
    render(<ErrorBox kind="Mermaid" message="x" onEdit={onEdit} onConvertToCode={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
    expect(onEdit).toHaveBeenCalled();
  });

  it('↓ Plain 클릭 시 onConvertToCode 콜백', () => {
    const onConvert = vi.fn();
    render(<ErrorBox kind="LaTeX" message="x" onEdit={() => {}} onConvertToCode={onConvert} />);
    fireEvent.click(screen.getByRole('button', { name: /Plain/ }));
    expect(onConvert).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실행 (이번엔 ErrorBox가 이미 있으므로 통과해야 함)**

Run: `cd frontend && npx vitest run src/blocks/__tests__/error-state.test.tsx`

Expected: 모든 테스트 PASS. 만약 happy-dom 환경에서 toBeInTheDocument 매처 누락 등 문제가 있으면 `frontend/src/test-setup.ts`에 `'@testing-library/jest-dom/vitest'` 임포트가 있는지 확인.

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/blocks/__tests__/error-state.test.tsx
git commit -m "test(frontend): ErrorBox 컴포넌트 RTL 테스트

- kind/message 렌더링 검증
- Edit/Convert 버튼 콜백 검증

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: 테마 동기화 (BlockNote + Mermaid 다크 재초기화)

**Files:**
- Modify: `frontend/src/editor/Editor.tsx`
- Modify: `frontend/src/blocks/MermaidBlock.tsx`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Mermaid 테마 변경 시 reinitialize 훅 추가**

`MermaidBlock.tsx`에 export 추가:

```tsx
const themeReinitListeners = new Set<() => void>();
export function reinitOnThemeChange(theme: 'light' | 'dark') {
  initMermaid(theme);
  themeReinitListeners.forEach(cb => cb());
}
export function subscribeMermaidReinit(cb: () => void): () => void {
  themeReinitListeners.add(cb);
  return () => themeReinitListeners.delete(cb);
}
```

각 MermaidBlock의 render 안에서 마운트 시 subscribe하고 콜백에서 강제 리렌더 트리거 (state version 증가):

```tsx
const [, forceRerender] = useState(0);
useEffect(() => subscribeMermaidReinit(() => forceRerender(v => v + 1)), []);
```

이 useEffect를 다른 useEffect들 옆에 추가.

- [ ] **Step 2: Editor.tsx에서 테마 변경 시 Mermaid reinitialize 호출**

`Editor.tsx` 최상단에 import:

```tsx
import { reinitOnThemeChange } from '../blocks/MermaidBlock';
```

테마 동기화 useEffect 안에서:

```tsx
useEffect(() => {
  return bridge.onThemeChange((t) => {
    setTheme(t);
    reinitOnThemeChange(t);
  });
}, [bridge]);
```

또한 마운트 시점에도 한 번 초기화:

```tsx
useEffect(() => {
  reinitOnThemeChange(bridge.getContext().initialTheme);
}, [bridge]);
```

- [ ] **Step 3: main.tsx에서 MantineProvider colorScheme도 변경 반영**

기존 코드에서 `forceColorScheme={theme}`이 이미 적용되어 있는지 확인. theme state는 `bridge.onThemeChange`로 갱신되므로 Mantine도 즉시 반응.

- [ ] **Step 4: dev 환경 수동 검증**

Run: `cd frontend && npm run dev`

브라우저 콘솔에서 `window.markora.applyTheme('dark')` 실행 → BlockNote와 Mermaid가 다크로 전환되는지 확인.
다시 `window.markora.applyTheme('light')`로 전환 확인.

- [ ] **Step 5: 빌드 확인**

Run: `cd frontend && npm run build`

Expected: 에러 없이 성공.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/editor/Editor.tsx frontend/src/blocks/MermaidBlock.tsx
git commit -m "feat(frontend): 테마 동기화 (BlockNote + Mantine + Mermaid)

- bridge.onThemeChange → setTheme + reinitOnThemeChange
- Mermaid: pub/sub 패턴으로 모든 블록 강제 리렌더
- 마운트 시 initialTheme 즉시 반영

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: 테스트 gap 채우기 (라운드트립 통합)

Task 5~9에서 핵심 케이스는 커버됨. 이 Task는 **라운드트립 통합 테스트** — 실제 BlockNote editor 인스턴스로 markdown → blocks → markdown 검증.

**Files:**
- Create: `frontend/src/markdown/__tests__/integration.test.ts`

- [ ] **Step 1: 통합 테스트 작성**

```ts
import { describe, it, expect } from 'vitest';
import { BlockNoteEditor } from '@blocknote/core';
import { schema } from '../../editor/schema';
import { preSerialize, postParse } from '../customParse';

async function roundtrip(md: string): Promise<string> {
  const editor = BlockNoteEditor.create({ schema });
  const blocks = await editor.tryParseMarkdownToBlocks(md);
  const transformed = postParse(blocks as any);
  editor.replaceBlocks(editor.document, transformed as any);
  const out = await editor.blocksToMarkdownLossy(preSerialize(editor.document as any) as any);
  return out.trim();
}

describe('markdown 라운드트립 (통합)', () => {
  it('표준 마크다운 보존', async () => {
    const md = '# Title\n\nHello **world**.\n\n- a\n- b\n';
    const out = await roundtrip(md);
    expect(out).toContain('# Title');
    expect(out).toContain('**world**');
    expect(out).toContain('- a');
  });

  it('```math 블록 보존', async () => {
    const md = '```math\nx^2 + y^2 = z^2\n```\n';
    const out = await roundtrip(md);
    expect(out).toContain('```math');
    expect(out).toContain('x^2 + y^2 = z^2');
  });

  it('```mermaid 블록 보존', async () => {
    const md = '```mermaid\ngraph TD\nA-->B\n```\n';
    const out = await roundtrip(md);
    expect(out).toContain('```mermaid');
    expect(out).toContain('A-->B');
  });

  it('인라인 수식 보존', async () => {
    const md = '식: $x^2$ 끝.\n';
    const out = await roundtrip(md);
    expect(out).toContain('$x^2$');
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `cd frontend && npx vitest run src/markdown/__tests__/integration.test.ts`

Expected: 모든 테스트 PASS. 만약 BlockNote 변환에서 약간의 차이(예: 빈 줄 개수)가 있으면 toContain으로 핵심 부분만 검증하므로 통과 가능.

- [ ] **Step 3: 전체 테스트 스위트 한 번 실행 (회귀 확인)**

Run: `cd frontend && npm test -- --run`

Expected: 모든 테스트 PASS.

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/markdown/__tests__/integration.test.ts
git commit -m "test(frontend): 라운드트립 통합 테스트

실제 BlockNote 인스턴스로 markdown → blocks → markdown 보존성 검증.
표준 마크다운, ```math, ```mermaid, 인라인 \$...\$ 4개 케이스.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Kotlin MarkdownHtmlPanel 진입점 변경

**Files:**
- Modify: `src/main/kotlin/com/github/kenshin579/markora/editor/MarkdownHtmlPanel.kt`
- Modify: `src/main/kotlin/com/github/kenshin579/markora/editor/MarkdownFileEditor.kt`
- Modify: `src/main/kotlin/com/github/kenshin579/markora/controller/PreviewStaticServer.kt` (필요 시)

- [ ] **Step 1: PreviewStaticServer 라우팅 검증**

기존 `PreviewStaticServer.kt`가 `/resources/<dir>/...` 경로를 classpath의 `<dir>/...`에 매핑하는지 확인. 만약 그렇다면 `/resources/blocknote/dist/index.html`이 자동으로 서빙됨. 변경 불필요.

만약 `/resources/vditor/...`로 하드코딩되어 있다면 `vditor` → `blocknote`로 일반화하거나 패턴 매칭으로 변경. 코드를 확인:

Run: `grep -n vditor src/main/kotlin/com/github/kenshin579/markora/controller/PreviewStaticServer.kt`

만약 매치가 있으면 해당 위치를 BlockNote와 호환되게 변경 (vditor 외 다른 디렉토리도 서빙되도록).

- [ ] **Step 2: MarkdownHtmlPanel 진입점 변경**

기존 `loadEditor()` 함수를 다음으로 교체:

```kotlin
private fun loadEditor() {
    val serverUrl = PreviewStaticServer.getServiceUrl()
    val isDark = EditorColorsManager.getInstance().isDarkEditor
    val params = listOf(
        "filePath=" + java.net.URLEncoder.encode(file.path, Charsets.UTF_8),
        "serverUrl=" + java.net.URLEncoder.encode(serverUrl, Charsets.UTF_8),
        "dark=$isDark"
    ).joinToString("&")
    val url = "${serverUrl}resources/blocknote/dist/index.html?$params"
    browser.loadURL(url)
}
```

`loadTemplate()` 함수는 더 이상 사용되지 않으므로 제거.

- [ ] **Step 3: MarkdownFileEditor 테마 호출 변경**

`MarkdownFileEditor.kt`에서 `panel.executeJavaScript("switchTheme($isDark)")` 부분을 다음으로 교체:

```kotlin
val themeName = if (isDark) "dark" else "light"
panel.executeJavaScript("if (window.markora) window.markora.applyTheme('$themeName')")
```

- [ ] **Step 4: 빌드 확인 (Kotlin + frontend 모두)**

Run: `./gradlew build`

Expected: 컴파일·빌드 성공. frontend도 함께 빌드되어 dist 산출물 갱신.

- [ ] **Step 5: 수동 검증 (runIde)**

Run: `./gradlew runIde`

샌드박스 IDE에서 .md 파일 열어 BlockNote 에디터 진입, 입력 가능, 저장 동작 확인. IDE 다크/라이트 토글로 테마 전환 동작 확인.

- [ ] **Step 6: 커밋**

```bash
git add src/main/kotlin/com/github/kenshin579/markora/editor/MarkdownHtmlPanel.kt \
        src/main/kotlin/com/github/kenshin579/markora/editor/MarkdownFileEditor.kt \
        src/main/kotlin/com/github/kenshin579/markora/controller/PreviewStaticServer.kt
git commit -m "feat(kotlin): MarkdownHtmlPanel BlockNote 진입점 전환

- loadEditor: 정적 서버 URL + query string으로 filePath/serverUrl/dark 전달
- 템플릿 substitution 제거 (Vite index.html 직접 로드)
- 테마 호출: switchTheme → window.markora.applyTheme

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: EditorSettingsService 필드 정리

**Files:**
- Modify: `src/main/kotlin/com/github/kenshin579/markora/service/EditorSettingsService.kt`
- Modify: `src/main/kotlin/com/github/kenshin579/markora/settings/MarkdownEditorConfigurable.kt`

- [ ] **Step 1: EditorSettingsService.State 단순화**

`State` data class를 다음으로 교체:

```kotlin
data class State(
    var fontSize: Int = 16,
    var autoSaveDelayMs: Int = 1000
)
```

기존 `defaultMode`, `typewriterMode`, `showLineNumbers` 필드 제거. (XML 직렬화는 모르는 필드를 무시하므로 기존 사용자 설정 파일과의 호환성 OK.)

- [ ] **Step 2: MarkdownEditorConfigurable에서 제거된 필드 UI 정리**

`MarkdownEditorConfigurable.kt`에서 `defaultMode`, `typewriterMode`, `showLineNumbers`를 참조하는 모든 줄 삭제. 남는 항목은 `fontSize`, `autoSaveDelayMs`만.

만약 콤보박스/체크박스 UI 코드가 있다면 함께 삭제. apply()/reset()/isModified() 메서드도 해당 필드 참조를 제거.

- [ ] **Step 3: 빌드**

Run: `./gradlew build`

Expected: 컴파일 성공. 만약 다른 곳(예: MarkdownHtmlPanel)에서 `defaultMode`를 참조하고 있다면 그 부분도 정리.

- [ ] **Step 4: 커밋**

```bash
git add src/main/kotlin/com/github/kenshin579/markora/service/EditorSettingsService.kt \
        src/main/kotlin/com/github/kenshin579/markora/settings/MarkdownEditorConfigurable.kt
git commit -m "feat(kotlin): EditorSettingsService 필드 정리

BlockNote 도입으로 무의미해진 설정 제거:
- defaultMode (Source 모드 토글 제거됨)
- typewriterMode (BlockNote 미지원)
- showLineNumbers (BlockNote 코드블록 라인번호 미지원)

남은 필드: fontSize, autoSaveDelayMs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Vditor 잔재 삭제

**Files:**
- Delete: `src/main/resources/vditor/` (전체)
- Delete: `src/main/resources/template/editor.html`

- [ ] **Step 1: 디렉토리 삭제 전 다른 참조가 없는지 확인**

Run: `grep -rn "vditor\|editor\.html\|template/editor" src/main/kotlin`

Expected: 매치 없음. 만약 있으면 모두 정리.

- [ ] **Step 2: vditor 디렉토리 삭제**

Run: `git rm -r src/main/resources/vditor/`

- [ ] **Step 3: editor.html 템플릿 삭제**

Run: `git rm src/main/resources/template/editor.html`

만약 `template/` 폴더가 비게 되면 함께 삭제: `rmdir src/main/resources/template/ 2>/dev/null || true`

- [ ] **Step 4: 빌드 + runIde 검증**

```
./gradlew build
./gradlew runIde
```

샌드박스에서 .md 열어 BlockNote 정상 동작 확인 (Vditor 삭제 후에도 깨지지 않음).

- [ ] **Step 5: 커밋**

```bash
git add -A src/main/resources/
git commit -m "chore: Vditor 잔재 삭제

- src/main/resources/vditor/ (~8MB)
- src/main/resources/template/editor.html

BlockNote 마이그레이션으로 더 이상 사용되지 않음.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: ExportController 비활성화

**Files:**
- Modify: 호출처 (예: 액션 등록부) — 코드 검색으로 위치 파악
- Keep: `src/main/kotlin/com/github/kenshin579/markora/controller/ExportController.kt` (클래스 자체는 유지, v1 이후 재사용)

- [ ] **Step 1: ExportController 호출처 식별**

Run: `grep -rn "ExportController\|api/export" src/main/kotlin src/main/resources`

호출처 (예: PreviewStaticServer 라우팅 또는 액션 클래스) 위치 확인.

- [ ] **Step 2: 라우팅 등록 제거**

`PreviewStaticServer.kt`에서 `/api/export` 라우트 등록 부분 제거. ExportController 클래스 import도 제거. 클래스 파일 자체는 남겨둠 (v1 이후 BlockNote HTML export 도입 시 재활용).

- [ ] **Step 3: 빌드 확인**

Run: `./gradlew build`

Expected: 컴파일 성공.

- [ ] **Step 4: 커밋**

```bash
git add src/main/kotlin/com/github/kenshin579/markora/controller/PreviewStaticServer.kt
git commit -m "chore: ExportController 비활성화

v1에서는 BlockNote HTML/PDF export 미지원. /api/export 라우트만 제거.
클래스 파일은 유지 (v1.1에서 BlockNote blocksToHTMLLossy 활용 시 재구현 예정).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: README 업데이트

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Features 섹션 재작성**

기존 README의 `## Features` 블록을 다음으로 교체:

```markdown
## Features

- **WYSIWYG Editing** — Notion-style block editor powered by [BlockNote](https://www.blocknotejs.org/)
- **Block UX** — Drag handle, slash menu (`/`), block transforms, inline formatting
- **Theme Sync** — Automatically matches your IDE's Dark/Light theme
- **Auto-Save** — Changes are saved automatically with a configurable debounce delay
- **Image Support** — Drag & drop or paste images from clipboard; stored in a local `images/` directory with relative paths
- **LaTeX Math** — Inline (`$...$`) and block (` ```math `) math rendering via KaTeX
- **Mermaid Diagrams** — Render flowcharts, sequence diagrams, gantt charts, and more (` ```mermaid `)
- **External Links** — Links open in your system browser
```

- [ ] **Step 2: Slash Commands 섹션 단순화**

기존 13개 표를 다음으로 교체:

```markdown
## Slash Commands

Type `/` in the editor to access BlockNote's default block menu (heading, list, quote, code, table, image, etc.) plus Markora-specific items:

| Command | Description |
|---------|-------------|
| `/math` | LaTeX math block (` ```math `) |
| `/equation` | Inline LaTeX (`$...$`) |
| `/mermaid` | Mermaid diagram block (` ```mermaid `) |

For the full list of standard blocks, see [BlockNote documentation](https://www.blocknotejs.org/docs/editor-basics/default-schema).
```

- [ ] **Step 3: Settings 섹션 단순화**

기존 표를 다음으로 교체:

```markdown
| Setting | Description | Default |
|---------|-------------|---------|
| Font Size | Editor font size (px) | 16 |
| Auto-Save Delay | Save debounce time (ms) | 1000 |
```

- [ ] **Step 4: Usage 섹션 단순화**

기존 4번 항목 ("Use the status bar buttons at the bottom to switch between WYSIWYG and Source mode") 제거.

- [ ] **Step 5: Tech Stack 갱신**

`Vditor` 줄을 다음으로 교체:

```markdown
- **BlockNote** — Notion-style React block editor
- **Vite + React** — Frontend bundle pipeline
- **KaTeX** — LaTeX math rendering
- **Mermaid** — Diagram rendering
```

- [ ] **Step 6: Building from Source 섹션에 Node 메모 추가**

`./gradlew build` 위에 다음 한 줄 추가:

```markdown
> First build downloads Node 20.18.0 to `.gradle/nodejs/` (managed by gradle-node-plugin). No system Node required.
```

- [ ] **Step 7: 커밋**

```bash
git add README.md
git commit -m "docs: README BlockNote 마이그레이션 반영

- Features: BlockNote 기반 표현으로 변경, Source 모드/13종 슬래시/emoji/HTML export 제거
- Slash Commands: 표준 BlockNote 메뉴 + /math, /equation, /mermaid 만 명시
- Settings: fontSize, autoSaveDelayMs 두 개로 축소
- Tech Stack: Vditor → BlockNote, Vite + React 추가
- Building: gradle-node-plugin Node 자동 다운로드 안내

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: PoC 폴더 이동

**Files:**
- Move: `poc/editor-comparison/` → `docs/superpowers/poc/editor-comparison/`

- [ ] **Step 1: 디렉토리 이동**

```bash
mkdir -p docs/superpowers/poc
git mv poc/editor-comparison docs/superpowers/poc/editor-comparison
rmdir poc/ 2>/dev/null || true
```

(주의: `poc/`가 untracked였다면 `git mv` 대신 일반 `mv` 사용. 현재 상태 확인 후 분기:)

```bash
if git ls-files --error-unmatch poc/editor-comparison >/dev/null 2>&1; then
  git mv poc/editor-comparison docs/superpowers/poc/editor-comparison
else
  mkdir -p docs/superpowers/poc
  mv poc/editor-comparison docs/superpowers/poc/editor-comparison
  rmdir poc/ 2>/dev/null || true
  git add docs/superpowers/poc/editor-comparison
fi
```

- [ ] **Step 2: spec 문서의 PoC 참조 경로 갱신**

`docs/superpowers/specs/2026-05-04-blocknote-migration-design.md`에서 `poc/editor-comparison/`를 `docs/superpowers/poc/editor-comparison/`로 치환:

Run: `grep -n "poc/editor-comparison" docs/superpowers/specs/2026-05-04-blocknote-migration-design.md`

매치되는 모든 줄을 새 경로로 수정.

- [ ] **Step 3: 커밋**

```bash
git add docs/superpowers/specs/ docs/superpowers/poc/
git commit -m "docs: PoC 폴더를 docs/superpowers/poc/로 이동

결정 근거 보존 차원에서 비교 PoC를 spec 옆으로 이동.
spec의 PoC 참조 경로도 함께 갱신.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## 최종 검증 (구현 완료 후 1회)

- [ ] **빌드**: `./gradlew clean build` — 모든 테스트 PASS, frontend 번들 생성
- [ ] **runIde**: `./gradlew runIde` — IDE 샌드박스에서 다음 체크리스트
  - [ ] .md 파일 열면 BlockNote 에디터 진입
  - [ ] 표준 블록(헤딩/리스트/표/코드/이미지/링크) 동작
  - [ ] 슬래시 메뉴에 `/math`, `/equation`, `/mermaid` 노출
  - [ ] KaTeX 블록 렌더 + invalid 입력 시 경고 박스
  - [ ] Mermaid 블록 렌더 + 다크 토글 시 색 동기화
  - [ ] 이미지 drag/drop → `images/` 저장
  - [ ] 1초 디바운스 저장 + 외부 변경 reload (dirty 아닐 때)
- [ ] **PR 생성**: `gh pr create` (HEREDOC body, 리뷰어 kenshin579)
