# Code Block Syntax Highlighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** BlockNote `codeBlock`에 shiki lazy-load 하이라이터를 연결해 syntax highlighting을 활성화하고, 23개 큐레이션 언어 픽커와 코드 복사 버튼을 추가한다.

**Architecture:** BlockNote 0.49의 `createCodeBlockSpec(options)` API를 그대로 사용해 `createHighlighter`(shiki dynamic import) + `supportedLanguages`를 채워준다. 듀얼 테마는 shiki의 `themes: { light, dark }` 모드 + CSS 변수 토글로 IDE 테마와 동기화한다. 코드 복사 버튼은 BlockNote 외부에서 MutationObserver로 코드 블록을 관찰해 호버 시 portal로 오버레이한다.

**Tech Stack:** TypeScript, React 18, BlockNote 0.49, shiki (lazy import), Vite, Vitest, happy-dom, Mantine, JCEF

**Spec:** `docs/superpowers/specs/2026-05-09-code-highlight-design.md`

**Branch:** `feature/code-highlight` (이미 생성됨, spec commit `c1fc9c6` 위)

**Working dir for all commands:** `markora/frontend/` (Vitest/npm) 또는 `markora/` (Gradle). 각 step에 명시.

## File Structure

| 경로 | 책임 |
|---|---|
| `frontend/package.json` (수정) | shiki dependency 추가 |
| `frontend/src/editor/codeBlock.ts` (신규) | `SUPPORTED_LANGUAGES` 맵 + `codeBlockOptions` (defaultLanguage, supportedLanguages, lazy createHighlighter) |
| `frontend/src/editor/__tests__/codeBlock.test.ts` (신규) | codeBlock 옵션/언어 맵 단위 테스트 |
| `frontend/src/editor/schema.ts` (수정) | `defaultBlockSpecs.codeBlock`을 `createCodeBlockSpec(codeBlockOptions)`로 교체 |
| `frontend/src/markdown/__tests__/roundtrip.test.ts` (확장) | 다언어 코드 블록 round-trip 회귀 |
| `frontend/src/styles.css` (수정) | shiki 듀얼 테마 CSS 변수 토글 + copy 버튼 스타일 |
| `frontend/src/blocks/CodeBlockCopy.tsx` (신규) | `<pre>` 호버 시 copy 버튼 portal |
| `frontend/src/blocks/__tests__/CodeBlockCopy.test.tsx` (신규) | CodeBlockCopy 컴포넌트 단위 테스트 |
| `frontend/src/editor/Editor.tsx` (수정) | shell ref + `<CodeBlockCopy>` 마운트 |

각 파일은 단일 책임이며, 테스트와 구현이 한 쌍을 이룬다.

---

### Task 1: shiki 의존성 추가

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: package.json에 shiki 추가**

`frontend/package.json`의 `dependencies` 객체에 shiki 한 줄 추가. 기존 정렬을 따라 `react`/`react-dom` 다음, `katex` 앞에 배치.

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
    "shiki": "^1.24.0",
    "katex": "^0.16.11",
    "mermaid": "^11.4.0"
  }
}
```

(devDependencies는 변경 없음.)

- [ ] **Step 2: 의존성 설치**

Run (from `frontend/`): `npm install`

Expected: shiki와 transitive deps(`@shikijs/core`, `@shikijs/engine-oniguruma`, `@shikijs/langs`, `@shikijs/themes` 등) 추가, package-lock.json 변경.

- [ ] **Step 3: import 가능 여부 검증**

Run (from `frontend/`): `node -e "import('shiki').then(m => console.log(typeof m.createHighlighter))"`

Expected output: `function`

- [ ] **Step 4: Commit**

```bash
cd frontend && git add package.json package-lock.json
cd ..
git commit -m "$(cat <<'EOF'
chore(frontend): add shiki dependency for code highlighting

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: codeBlock 옵션 모듈 (TDD)

**Files:**
- Create: `frontend/src/editor/codeBlock.ts`
- Create: `frontend/src/editor/__tests__/codeBlock.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `frontend/src/editor/__tests__/codeBlock.test.ts`:

```ts
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
    for (const [id, entry] of Object.entries(SUPPORTED_LANGUAGES)) {
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
    const fakeHighlighter = { __fake: true };
    const createHighlighterMock = vi.fn().mockResolvedValue(fakeHighlighter);
    vi.doMock('shiki', () => ({ createHighlighter: createHighlighterMock }));

    const { codeBlockOptions: fresh } = await import('../codeBlock');
    const result = await fresh.createHighlighter!();

    expect(createHighlighterMock).toHaveBeenCalledTimes(1);
    const callArg = createHighlighterMock.mock.calls[0][0];
    expect(callArg.themes).toEqual(['github-light', 'github-dark']);
    expect(callArg.langs).toHaveLength(23);
    expect(callArg.langs).toContain('javascript');
    expect(callArg.langs).toContain('kotlin');
    expect(result).toBe(fakeHighlighter);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run (from `frontend/`): `npm test -- codeBlock.test.ts`

Expected: FAIL — `Cannot find module '../codeBlock'`.

- [ ] **Step 3: 구현 작성**

Create `frontend/src/editor/codeBlock.ts`:

```ts
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
    return createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: Object.keys(SUPPORTED_LANGUAGES),
    });
  },
};
```

- [ ] **Step 4: 테스트 통과 확인**

Run (from `frontend/`): `npm test -- codeBlock.test.ts`

Expected: 모든 테스트 PASS.

- [ ] **Step 5: 타입 체크**

Run (from `frontend/`): `npx tsc --noEmit`

Expected: 에러 없음.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/editor/codeBlock.ts frontend/src/editor/__tests__/codeBlock.test.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add codeBlock options with shiki lazy highlighter

23개 큐레이션 언어 + github-light/github-dark 듀얼 테마.
SUPPORTED_LANGUAGES 맵과 codeBlockOptions(defaultLanguage,
supportedLanguages, lazy createHighlighter) export.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: schema에 codeBlock spec 교체

**Files:**
- Modify: `frontend/src/editor/schema.ts`

- [ ] **Step 1: 회귀 방지 — 기존 테스트 baseline 확인**

Run (from `frontend/`): `npm test -- --run`

Expected: 전체 vitest suite 통과 (기존 roundtrip 등). 실패하는 테스트가 있으면 본 task 진행 전 원인 파악.

- [ ] **Step 2: schema.ts 교체**

Replace the entire content of `frontend/src/editor/schema.ts`:

```ts
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
```

- [ ] **Step 3: 타입 체크**

Run (from `frontend/`): `npx tsc --noEmit`

Expected: 에러 없음. 만약 `createCodeBlockSpec`이 `@blocknote/core` 메인 entry에서 직접 export되지 않으면, `import { createCodeBlockSpec } from '@blocknote/core/blocks/Code/block'`로 deep import 시도. 다만 본 패키지의 `types/src/index.d.ts`에 `export * from "./blocks/index.js"`가 있고 blocks/index가 Code/block을 re-export하므로 메인 entry로 충분.

- [ ] **Step 4: 전체 테스트 재실행**

Run (from `frontend/`): `npm test -- --run`

Expected: 전체 PASS, 회귀 없음.

- [ ] **Step 5: build 검증 (Vite 번들이 깨지지 않는지)**

Run (from `frontend/`): `npm run build`

Expected: 성공. shiki는 lazy chunk로 분리되어 별도 .js 파일로 출력됨. `../src/main/resources/blocknote/dist/` 하위에 `shiki-*.js` 류 청크가 생성되는지 확인.

```bash
ls ../src/main/resources/blocknote/dist/ | grep -i shiki
```

Expected: shiki 관련 청크 1개 이상 존재.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/editor/schema.ts
git commit -m "$(cat <<'EOF'
feat(frontend): wire shiki highlighter into BlockNote schema

defaultBlockSpecs.codeBlock을 createCodeBlockSpec(codeBlockOptions)로
교체하여 shiki 기반 syntax highlighting과 23개 언어 픽커 활성화.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: round-trip 회귀 테스트 확장

**Files:**
- Modify: `frontend/src/markdown/__tests__/roundtrip.test.ts`

기존 테스트의 "다른 언어 코드블록은 그대로" 케이스를 다양한 언어로 확장하여 customParse가 일반 codeBlock에 영향을 주지 않음을 회귀 보장.

- [ ] **Step 1: 실패할 만한 새 테스트 추가**

`frontend/src/markdown/__tests__/roundtrip.test.ts`의 마지막 `describe('regressions: children key 보존', ...)` 다음에 새 describe 블록 추가:

```ts
describe('regressions: 다양한 언어 코드블록 보존', () => {
  const cases: Array<[string, string]> = [
    ['javascript', 'let x = 1;'],
    ['typescript', 'const x: number = 1;'],
    ['kotlin', 'fun main() {}'],
    ['python', 'x = 1'],
    ['java', 'class A {}'],
    ['go', 'func main() {}'],
    ['rust', 'fn main() {}'],
    ['shellscript', 'echo hi'],
    ['json', '{"a":1}'],
    ['yaml', 'a: 1'],
    ['html', '<p>x</p>'],
    ['css', 'a{color:red}'],
    ['sql', 'SELECT 1'],
    ['markdown', '# heading'],
    ['dockerfile', 'FROM scratch'],
  ];

  for (const [lang, source] of cases) {
    it(`postParse는 ${lang} 코드블록을 그대로 보존`, () => {
      const blocks = [{
        type: 'codeBlock',
        props: { language: lang },
        content: [{ type: 'text', text: source, styles: {} }],
      }];
      expect(postParse(blocks as any)).toEqual(blocks);
    });

    it(`preSerialize는 ${lang} 코드블록을 그대로 보존`, () => {
      const blocks = [{
        type: 'codeBlock',
        props: { language: lang },
        content: [{ type: 'text', text: source, styles: {} }],
      }];
      expect(preSerialize(blocks as any)).toEqual(blocks);
    });
  }

  it('빈 language 문자열 코드블록도 보존', () => {
    const blocks = [{
      type: 'codeBlock',
      props: { language: '' },
      content: [{ type: 'text', text: 'plain', styles: {} }],
    }];
    expect(postParse(blocks as any)).toEqual(blocks);
    expect(preSerialize(blocks as any)).toEqual(blocks);
  });

  it('미지원 언어(elixir)도 customParse 단계에서는 보존', () => {
    const blocks = [{
      type: 'codeBlock',
      props: { language: 'elixir' },
      content: [{ type: 'text', text: 'IO.puts "hi"', styles: {} }],
    }];
    expect(postParse(blocks as any)).toEqual(blocks);
    expect(preSerialize(blocks as any)).toEqual(blocks);
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run (from `frontend/`): `npm test -- roundtrip.test.ts`

Expected: 새 테스트 포함 전체 PASS. 기존 customParse는 math/mermaid만 변환하고 일반 codeBlock은 그대로 통과시키므로 추가 구현 없이 모든 케이스가 통과한다.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/markdown/__tests__/roundtrip.test.ts
git commit -m "$(cat <<'EOF'
test(frontend): cover code block round-trip across languages

shiki 통합으로 codeBlock 처리 경로가 변경됐을 때 customParse가
math/mermaid 외 일반 codeBlock에 영향을 주지 않는지 회귀 방어.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 듀얼 테마 CSS

**Files:**
- Modify: `frontend/src/styles.css`

shiki 듀얼 테마 모드는 토큰에 `style="--shiki-light:#xxx;--shiki-dark:#yyy"`를 부여한다. CSS 변수만 토글하면 IDE 테마 전환 시 즉시 색상이 바뀐다.

- [ ] **Step 1: styles.css에 코드 블록 테마 규칙 추가**

`frontend/src/styles.css` 끝에 다음 블록을 추가 (mermaid 규칙 다음 줄):

```css

/* ----- Code block syntax highlighting (shiki dual theme) ----- */
.markora-shell .bn-block-content[data-content-type="codeBlock"] pre,
.markora-shell pre.bn-inline-content {
  position: relative;
}
.markora-shell pre code .line { display: block; }
.markora-shell pre code [style*="--shiki-light"] {
  color: var(--shiki-light);
  background-color: var(--shiki-light-bg, transparent);
}
[data-mantine-color-scheme="dark"] .markora-shell pre code [style*="--shiki-dark"] {
  color: var(--shiki-dark);
  background-color: var(--shiki-dark-bg, transparent);
}

/* ----- Code copy button overlay ----- */
.markora-code-copy {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 2px 8px;
  font-size: 11px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: rgba(255, 255, 255, 0.85);
  color: #444;
  border: 1px solid #d0d4d9;
  border-radius: 3px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
  z-index: 1;
}
.markora-code-copy:hover { background: #fff; }
.markora-code-copy.is-visible { opacity: 1; }
[data-mantine-color-scheme="dark"] .markora-code-copy {
  background: rgba(43, 45, 48, 0.9);
  color: #ddd;
  border-color: #4a4d52;
}
[data-mantine-color-scheme="dark"] .markora-code-copy:hover { background: #2b2d30; }
```

(주석 라인은 한 줄짜리 그대로 유지. 기존 styles.css의 마지막 라인이 mermaid edit textarea이므로 그 다음 빈 줄을 두고 위 블록 추가.)

- [ ] **Step 2: 빌드 확인**

Run (from `frontend/`): `npm run build`

Expected: 성공. CSS는 main 번들에 포함되며 lazy chunk와 무관.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles.css
git commit -m "$(cat <<'EOF'
style(frontend): dual-theme CSS for shiki + code copy button

shiki light/dark 토큰을 IDE 테마(data-mantine-color-scheme)에
맞춰 전환. Copy 버튼 호버 노출 스타일도 같이 정의.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: CodeBlockCopy 컴포넌트 (TDD)

**Files:**
- Create: `frontend/src/blocks/CodeBlockCopy.tsx`
- Create: `frontend/src/blocks/__tests__/CodeBlockCopy.test.tsx`

BlockNote 외부에서 동작하는 React 컴포넌트. editor root DOM ref로 받은 컨테이너 내부의 `pre[data-content-type="codeBlock"]` 요소를 MutationObserver로 감지하고, 호버 시 우상단에 Copy 버튼을 띄운다. 클릭 시 `pre` 내부 텍스트를 클립보드에 복사하고 짧은 시간 동안 "Copied" 라벨로 변경한다.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `frontend/src/blocks/__tests__/CodeBlockCopy.test.tsx`:

```tsx
import React, { useRef, useEffect } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CodeBlockCopy, CODE_BLOCK_SELECTOR } from '../CodeBlockCopy';

function Harness({ pres = [] as Array<{ lang: string; text: string }> }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div>
      <div ref={ref} className="markora-shell">
        {pres.map((p, i) => (
          <pre key={i} data-content-type="codeBlock">
            <code>
              <span className="line">
                <span>{p.text}</span>
              </span>
            </code>
          </pre>
        ))}
      </div>
      <CodeBlockCopy editorRoot={ref} />
    </div>
  );
}

describe('CodeBlockCopy', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it('CODE_BLOCK_SELECTOR 상수가 노출된다', () => {
    expect(CODE_BLOCK_SELECTOR).toBe('pre[data-content-type="codeBlock"]');
  });

  it('초기 렌더 시 pre가 없으면 버튼도 없다', () => {
    render(<Harness pres={[]} />);
    expect(screen.queryByRole('button', { name: /copy/i })).toBeNull();
  });

  it('pre 호버 시 copy 버튼이 나타난다', async () => {
    render(<Harness pres={[{ lang: 'js', text: 'let x = 1;' }]} />);
    const pre = document.querySelector('pre')!;
    fireEvent.mouseEnter(pre);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copy/i })).toBeVisible();
    });
  });

  it('copy 버튼 클릭 시 pre 텍스트를 클립보드에 쓴다', async () => {
    render(<Harness pres={[{ lang: 'js', text: 'let x = 1;' }]} />);
    const pre = document.querySelector('pre')!;
    fireEvent.mouseEnter(pre);
    const button = await screen.findByRole('button', { name: /copy/i });
    fireEvent.click(button);
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('let x = 1;');
    });
  });

  it('복사 후 일시적으로 라벨이 "Copied"로 바뀐다', async () => {
    vi.useFakeTimers();
    render(<Harness pres={[{ lang: 'js', text: 'hi' }]} />);
    const pre = document.querySelector('pre')!;
    fireEvent.mouseEnter(pre);
    const button = await screen.findByRole('button', { name: /copy/i });
    fireEvent.click(button);
    await waitFor(() => {
      expect(button.textContent?.toLowerCase()).toContain('copied');
    });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(button.textContent?.toLowerCase()).toContain('copy');
    expect(button.textContent?.toLowerCase()).not.toContain('copied');
    vi.useRealTimers();
  });

  it('동적으로 추가된 pre도 인식한다 (MutationObserver)', async () => {
    const { rerender } = render(<Harness pres={[]} />);
    rerender(<Harness pres={[{ lang: 'py', text: 'print(1)' }]} />);
    const pre = await waitFor(() => document.querySelector('pre')!);
    fireEvent.mouseEnter(pre);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copy/i })).toBeVisible();
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run (from `frontend/`): `npm test -- CodeBlockCopy.test.tsx`

Expected: FAIL — `Cannot find module '../CodeBlockCopy'`.

- [ ] **Step 3: 구현 작성**

Create `frontend/src/blocks/CodeBlockCopy.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export const CODE_BLOCK_SELECTOR = 'pre[data-content-type="codeBlock"]';

interface Props {
  editorRoot: React.RefObject<HTMLElement | null>;
}

export function CodeBlockCopy({ editorRoot }: Props) {
  const [hoveredPre, setHoveredPre] = useState<HTMLPreElement | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const root = editorRoot.current;
    if (!root) return;

    const handleMouseEnter = (e: Event) => {
      const target = e.currentTarget as HTMLPreElement;
      setHoveredPre(target);
    };
    const handleMouseLeave = (e: Event) => {
      const target = e.currentTarget as HTMLPreElement;
      setHoveredPre((curr) => (curr === target ? null : curr));
    };

    const attach = (pre: HTMLPreElement) => {
      pre.addEventListener('mouseenter', handleMouseEnter);
      pre.addEventListener('mouseleave', handleMouseLeave);
    };
    const detach = (pre: HTMLPreElement) => {
      pre.removeEventListener('mouseenter', handleMouseEnter);
      pre.removeEventListener('mouseleave', handleMouseLeave);
    };

    root.querySelectorAll<HTMLPreElement>(CODE_BLOCK_SELECTOR).forEach(attach);

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          if (n.matches?.(CODE_BLOCK_SELECTOR)) attach(n as HTMLPreElement);
          n.querySelectorAll?.<HTMLPreElement>(CODE_BLOCK_SELECTOR).forEach(attach);
        });
        m.removedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          if (n.matches?.(CODE_BLOCK_SELECTOR)) detach(n as HTMLPreElement);
          n.querySelectorAll?.<HTMLPreElement>(CODE_BLOCK_SELECTOR).forEach(detach);
        });
      }
    });
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      root.querySelectorAll<HTMLPreElement>(CODE_BLOCK_SELECTOR).forEach(detach);
    };
  }, [editorRoot]);

  const handleCopy = async () => {
    if (!hoveredPre) return;
    const text = hoveredPre.innerText;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error('Code copy failed:', e);
    }
  };

  if (!hoveredPre) return null;

  return createPortal(
    <button
      type="button"
      className="markora-code-copy is-visible"
      onMouseEnter={() => setHoveredPre(hoveredPre)}
      onMouseLeave={() => setHoveredPre(null)}
      onClick={handleCopy}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>,
    hoveredPre,
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run (from `frontend/`): `npm test -- CodeBlockCopy.test.tsx`

Expected: 모든 테스트 PASS. happy-dom은 기본적으로 MutationObserver와 navigator.clipboard mock을 지원한다 (clipboard는 위 테스트에서 명시적 mock).

- [ ] **Step 5: 타입 체크**

Run (from `frontend/`): `npx tsc --noEmit`

Expected: 에러 없음.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/blocks/CodeBlockCopy.tsx frontend/src/blocks/__tests__/CodeBlockCopy.test.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): add hover-triggered copy button for code blocks

MutationObserver로 pre[data-content-type="codeBlock"]을 감지하고
호버 시 portal로 우상단 Copy 버튼을 노출. 클릭 시 navigator.clipboard로
코드 텍스트 복사 후 일시적으로 "Copied" 라벨 표시.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Editor.tsx에 CodeBlockCopy 마운트

**Files:**
- Modify: `frontend/src/editor/Editor.tsx`

`markora-shell` div에 ref를 부착하고 `<BlockNoteView>` 형제로 `<CodeBlockCopy>`를 마운트.

- [ ] **Step 1: Editor.tsx 수정**

Edit `frontend/src/editor/Editor.tsx`:

먼저 import 블록 끝에 추가:

```ts
import { CodeBlockCopy } from '../blocks/CodeBlockCopy';
```

`Editor` 함수 본문 안, 다른 ref들 옆에 ref 선언 추가:

```ts
  const shellRef = useRef<HTMLDivElement>(null);
```

return 부분의 `<div className="markora-shell">`을 `<div className="markora-shell" ref={shellRef}>`로 바꾸고, 그 안에 `<CodeBlockCopy editorRoot={shellRef} />`를 `</BlockNoteView>` 다음 줄에 추가:

```tsx
  return (
    <div className="markora-shell" ref={shellRef}>
      <BlockNoteView editor={editor} theme={theme} slashMenu={false}>
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) => {
            // ... 기존 코드 그대로
          }}
        />
      </BlockNoteView>
      <CodeBlockCopy editorRoot={shellRef} />
      <div className="markora-status" data-status={status}>{status}</div>
    </div>
  );
```

(SuggestionMenuController 내부의 getItems 콜백은 변경 없음.)

- [ ] **Step 2: 타입 체크**

Run (from `frontend/`): `npx tsc --noEmit`

Expected: 에러 없음.

- [ ] **Step 3: 전체 테스트 재실행**

Run (from `frontend/`): `npm test -- --run`

Expected: 전체 PASS, 회귀 없음.

- [ ] **Step 4: Vite 빌드**

Run (from `frontend/`): `npm run build`

Expected: 성공.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/editor/Editor.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): mount CodeBlockCopy in Editor shell

markora-shell ref를 통해 코드 블록 복사 버튼을 BlockNoteView
형제로 마운트. 기존 BlockNote 동작에는 영향 없음.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 수동 검증 (runIde)

**Files:** none — 검증만, 코드 수정은 발견된 이슈에 대해서만.

- [ ] **Step 1: 플러그인 빌드 + sandbox IDE 기동**

Run (from `markora/`): `./gradlew runIde`

Expected: 빌드 통과, 새 sandbox IntelliJ IDE 윈도우가 뜸. 첫 실행 시 frontend도 함께 번들링됨.

- [ ] **Step 2: 기본 하이라이팅 확인**

sandbox IDE에서 임의 프로젝트 열고 새 .md 파일 생성. Markora 탭으로 전환 후 다음 입력:

````
```javascript
function hello(name) {
  console.log(`Hi ${name}`);
}
```
````

Expected: 키워드(`function`), 문자열(`Hi ${name}`), 함수명, 괄호 등이 색상으로 구분돼 표시됨.

- [ ] **Step 3: 다양한 언어 확인**

같은 파일에 `kotlin`, `python`, `rust`, `shellscript`(또는 `bash`), `json`, `yaml`, `sql` 코드 블록을 추가하고 각각 구문 색상이 표시되는지 시각 확인.

Expected: 각 언어가 적절한 토큰으로 색상화됨.

- [ ] **Step 4: 언어 픽커 UI 확인**

새 코드 블록 삽입 후 BlockNote의 언어 드롭다운(코드 블록 우측 상단 또는 toolbar)을 열어 23개 언어 항목이 노출되는지 확인.

Expected: 큐레이션된 23개 언어가 알파벳/SUPPORTED_LANGUAGES 정의 순으로 표시됨.

- [ ] **Step 5: 테마 전환 확인**

IDE 메뉴에서 라이트 ↔ 다크 테마 토글. 코드 블록 색상이 즉시 전환되는지(Vite 핫리로드 없이) 확인.

Expected: github-light → github-dark 토큰 컬러로 즉시 전환.

- [ ] **Step 6: copy 버튼 확인**

코드 블록 위에 마우스 호버 → 우상단에 Copy 버튼 노출. 클릭 후 다른 곳에 paste(Cmd+V).

Expected: 클립보드에 코드 본문이 정확히 복사됨. 버튼은 일시적으로 "Copied"로 변하고 1.5초 후 "Copy"로 복귀.

- [ ] **Step 7: round-trip 확인**

작성한 .md 파일을 저장(자동 저장 트리거 — 약 1초 대기) 후 IntelliJ 외부 텍스트 에디터로 동일 파일 열기.

Expected: 각 코드 블록이 ```` ```javascript ```` 같은 fenced 형태로 정확히 직렬화되어 있고, language 정보가 보존됨. (`shellscript`는 BlockNote 정규화에 따라 `shellscript`/`bash`/`sh` 중 하나로 출력될 수 있음 — round-trip 의미 보존만 확인.)

- [ ] **Step 8: 미지원 언어 폴백**

````
```elixir
IO.puts "hi"
```
````

Expected: 색 없이 plain text로 렌더링되지만 에디터가 깨지지 않음. Console에 unhandled promise rejection 등 에러 없음. 저장 시 `elixir` language 문자열이 그대로 보존됨.

- [ ] **Step 9: 발견된 이슈 처리**

이슈가 있으면 별도 commit으로 fix하고 본 task 재수행. 일반적인 후보:

- 셀렉터 불일치: BlockNote가 실제 사용하는 attribute가 `data-content-type` 외 다른 이름이면 `CODE_BLOCK_SELECTOR` 상수만 갱신 후 단위 테스트 + 본 검증 재수행.
- 듀얼 테마 변수가 적용되지 않음: shiki 출력 inline style을 inspect element로 확인해 CSS 셀렉터 조정.
- copy 버튼이 코드 위에 가려짐: `z-index` / `position: relative`를 `pre`에 명시적 부여.

이슈 없으면 다음 step.

- [ ] **Step 10: 플러그인 빌드 검증**

Run (from `markora/`): `./gradlew buildPlugin`

Expected: `build/distributions/markora-*.zip` 생성. JS lazy chunk가 zip에 포함됐는지 확인:

```bash
unzip -l build/distributions/markora-*.zip | grep -i shiki | head -5
```

Expected: shiki 관련 .js 청크 1개 이상 포함.

- [ ] **Step 11: 마무리 commit (이슈 수정이 있었다면)**

이 task에서 수정한 파일이 있으면 변경별로 의미 있는 commit 메시지로 묶어 commit. 없으면 commit 생략.

---

### Task 9: PR 생성

**Files:** none

- [ ] **Step 1: 브랜치 push**

```bash
git push -u origin feature/code-highlight
```

- [ ] **Step 2: PR 생성**

```bash
gh pr create --title "feat: code block syntax highlighting via shiki" --body "$(cat <<'EOF'
## Summary
- BlockNote `codeBlock`에 shiki lazy-load 하이라이터를 연결해 syntax highlighting 활성화
- 큐레이션된 23개 언어(SUPPORTED_LANGUAGES)와 BlockNote 내장 언어 픽커 UI 노출
- shiki 듀얼 테마(github-light/github-dark)를 IDE 다크/라이트 테마와 CSS 변수로 즉시 동기
- 코드 블록 호버 시 우상단 Copy 버튼 노출 (외부 MutationObserver portal)

기존 `.md` 파일에 대한 round-trip 보존, math/mermaid 변환 로직 영향 없음.

Spec: `docs/superpowers/specs/2026-05-09-code-highlight-design.md`
Plan: `docs/superpowers/plans/2026-05-09-code-highlight.md`

## Test plan
- [x] Vitest: codeBlock 옵션/언어 맵 단위 테스트
- [x] Vitest: CodeBlockCopy 컴포넌트 단위 테스트 (호버, 클릭, 클립보드, MutationObserver)
- [x] Vitest: 다양한 언어 round-trip 회귀 테스트
- [x] `./gradlew runIde` 수동 검증 (다크/라이트 전환, 23개 언어, copy 버튼, 미지원 언어 폴백)
- [x] `./gradlew buildPlugin` 산출물에 shiki lazy chunk 포함 확인

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" --reviewer kenshin579
```

- [ ] **Step 3: PR URL 사용자에게 보고**

PR URL을 출력으로 반환.

---

## Self-Review Notes (writer)

- 모든 task가 spec의 한 섹션에 매핑됨:
  - Task 1: package.json 변경 (spec "Architecture")
  - Task 2: SUPPORTED_LANGUAGES + codeBlockOptions (spec "Components / codeBlock.ts")
  - Task 3: schema 교체 (spec "Components / schema.ts")
  - Task 4: round-trip 회귀 (spec "Round-trip / 미지원 언어 처리" + "Testing / Round-trip")
  - Task 5: 듀얼 테마 CSS (spec "Theme Sync")
  - Task 6: CodeBlockCopy (spec "Components / CodeBlockCopy.tsx")
  - Task 7: Editor 마운트 (spec "Components / CodeBlockCopy.tsx")
  - Task 8: 수동 검증 (spec "Testing / 수동 검증")
- Type/이름 일관성: `SUPPORTED_LANGUAGES`, `codeBlockOptions`, `CODE_BLOCK_SELECTOR`가 모든 task에서 동일 표기.
- 미지원 언어 폴백 로직은 spec에서 "lazy createHighlighter 내 try/catch로 캐치"라고 했으나, 실제로는 `getLanguageId` 사전 정규화는 BlockNote 내부에서 처리하고 shiki는 langs 배열에 없는 언어를 plain text로 폴백한다(shiki의 기본 동작). 별도 try/catch 없이도 동작하므로 Task 8 Step 8에서 시각 검증으로 확인하고 이슈가 있으면 그때 추가 처리.
- Branch는 spec commit 위에 누적되며, Task 1~9 commit이 PR에 그대로 반영됨.
