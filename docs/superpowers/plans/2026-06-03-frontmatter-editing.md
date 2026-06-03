# YAML Frontmatter 편집 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** markora 에디터에서 markdown 파일 맨 위 YAML frontmatter를 BlockNote 바깥의 접이식 패널에서 raw 텍스트로 편집할 수 있게 한다.

**Architecture:** frontmatter는 지금처럼 BlockNote 직렬화를 거치지 않는다. load 시 `splitFrontmatter`가 펜스 안쪽 inner YAML을 떼어 `Editor.tsx`의 React state로 올리고, BlockNote 위 `FrontmatterPanel`이 그 값을 textarea로 편집한다. 저장 시 `joinFrontmatter`가 inner YAML을 `---` 펜스로 감싸 본문 앞에 붙인다(비어 있으면 frontmatter 삭제). 본문/패널 어느 쪽이 바뀌든 같은 debounce 자동저장을 호출한다.

**Tech Stack:** TypeScript, React 18, BlockNote v0.49, Vitest + @testing-library/react. 모든 작업은 `markora/frontend/`에서 수행하며 테스트는 `npm test`(vitest)로 돌린다. Kotlin 변경 없음(파일 read/save 컨트롤러는 전체 내용을 그대로 통과시킨다).

**작업 디렉토리:** `/Users/user/src/workspace_markora/markora/frontend`
**브랜치:** `feature/frontmatter-editing` (이미 생성됨)

---

## File Structure

- `src/bridge/transform.ts` (수정) — `splitFrontmatter`/`joinFrontmatter`의 의미를 "펜스 포함 블록"에서 "inner YAML"로 변경. 직렬화 시 펜스를 감싸고 빈값이면 삭제.
- `src/types.ts` (수정) — `MarkoraBridge.loadFile` 반환을 `{ body, frontmatter }`로, `saveFile`을 `(body, frontmatter)`로.
- `src/bridge/markora.ts` (수정) — `storedFrontmatter` 전역 제거. `loadFile`/`saveFile` 시그니처 변경. `createMockBridge`도 동일.
- `src/markdown/saveGuard.ts` (수정) — 죽은 레이어 1과 `hasFrontmatter`/`FRONTMATTER_RE` 제거.
- `src/editor/FrontmatterPanel.tsx` (신규) — 접이식 raw YAML textarea (컨트롤드).
- `src/editor/Editor.tsx` (수정) — frontmatter state/ref, 패널 렌더, 인라인 저장 로직을 `scheduleSave()`로 추출해 본문/패널 onChange 양쪽이 호출, reload 동기화.
- `src/styles.css` (수정) — 패널 스타일.
- 테스트: `src/bridge/__tests__/transform.test.ts`, `src/bridge/__tests__/markora.test.ts`, `src/markdown/__tests__/saveGuard.test.ts`, `src/editor/__tests__/FrontmatterPanel.test.tsx` (신규).

---

### Task 1: transform.ts — inner YAML split/join 의미 변경

**Files:**
- Modify: `src/bridge/transform.ts`
- Test: `src/bridge/__tests__/transform.test.ts`

- [ ] **Step 1: 테스트를 새 의미로 교체 (실패 유도)**

`src/bridge/__tests__/transform.test.ts` 전체를 아래로 교체한다. 핵심 변경: `frontmatter`는 이제 펜스/BOM 없는 inner YAML이고, `joinFrontmatter`는 inner YAML을 받아 펜스로 감싼다(LF 정규화, BOM 제거).

```typescript
import { describe, it, expect } from 'vitest';
import { splitFrontmatter, joinFrontmatter } from '../transform';

describe('splitFrontmatter', () => {
  it('맨 앞 YAML frontmatter의 inner YAML만 떼어내고 본문을 분리', () => {
    const md = '---\ntitle: Post\ntags: [a, b]\n---\n\n# Body\n\ntext\n';
    const { frontmatter, body } = splitFrontmatter(md);
    expect(frontmatter).toBe('title: Post\ntags: [a, b]');
    expect(body).toBe('\n# Body\n\ntext\n');
  });

  it('frontmatter가 없으면 frontmatter는 빈 문자열, body는 원본', () => {
    const md = '# Just heading\n\ntext\n';
    const { frontmatter, body } = splitFrontmatter(md);
    expect(frontmatter).toBe('');
    expect(body).toBe(md);
  });

  it('본문 중간의 --- 구분선은 frontmatter로 보지 않는다', () => {
    const md = 'intro\n\n---\n\nmore\n';
    const { frontmatter, body } = splitFrontmatter(md);
    expect(frontmatter).toBe('');
    expect(body).toBe(md);
  });

  it('BOM이 앞에 있어도 inner YAML만 분리(BOM 제거)', () => {
    const md = '﻿---\ntitle: X\n---\nbody\n';
    const { frontmatter, body } = splitFrontmatter(md);
    expect(frontmatter).toBe('title: X');
    expect(body).toBe('body\n');
  });

  it('CRLF 입력도 inner YAML을 분리(본문은 그대로)', () => {
    const md = '---\r\ntitle: X\r\n---\r\nbody\r\n';
    const { frontmatter, body } = splitFrontmatter(md);
    expect(frontmatter).toBe('title: X');
    expect(body).toBe('body\r\n');
  });
});

describe('joinFrontmatter', () => {
  it('inner YAML을 --- 펜스로 감싸 body 앞에 붙인다', () => {
    expect(joinFrontmatter('title: X', '\n# Body\n')).toBe('---\ntitle: X\n---\n\n# Body\n');
  });

  it('frontmatter가 빈 문자열이면 body만 반환(frontmatter 삭제)', () => {
    expect(joinFrontmatter('', '# Body\n')).toBe('# Body\n');
  });

  it('frontmatter가 공백뿐이어도 body만 반환', () => {
    expect(joinFrontmatter('   \n  ', '# Body\n')).toBe('# Body\n');
  });

  it('split → join 라운드트립이 LF 본문 원본을 보존', () => {
    const md = '---\ntitle: Post\n---\n\n# Body\n\ntext\n';
    const { frontmatter, body } = splitFrontmatter(md);
    expect(joinFrontmatter(frontmatter, body)).toBe(md);
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npm test -- src/bridge/__tests__/transform.test.ts`
Expected: FAIL (현재 구현은 펜스 포함 frontmatter를 반환하므로 새 기대값과 불일치)

- [ ] **Step 3: transform.ts 구현 변경**

`src/bridge/transform.ts` 전체를 아래로 교체한다.

```typescript
// 브릿지 경계 문자열 변환 (옵션 B: 비편집 영역 보존 + raw 편집)
//
// BlockNote의 마크다운 라운드트립은 YAML frontmatter를 파괴한다(예: `---` → `***`).
// frontmatter는 BlockNote를 거치지 않는다: 로드 시 펜스(`---`) 안쪽 inner YAML만 떼어
// 패널에서 편집하고, 저장 시 다시 펜스로 감싸 본문 앞에 붙인다. inner YAML이 비어 있으면
// frontmatter를 통째로 생략한다(= 삭제). 펜스/BOM은 정규화되어 LF로 직렬화된다.

// 문서 맨 앞(BOM 허용)의 `---\n ... \n---\n` 블록만 frontmatter로 인정.
// 캡처 그룹 1 = 펜스 사이 inner YAML. 본문 중간의 --- 구분선은 매칭되지 않는다.
const FRONTMATTER_RE = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n/;

export interface SplitResult {
  frontmatter: string; // 펜스/BOM 없는 inner YAML, 없으면 ''
  body: string;
}

export function splitFrontmatter(md: string): SplitResult {
  const m = FRONTMATTER_RE.exec(md);
  if (!m) return { frontmatter: '', body: md };
  return { frontmatter: m[1], body: md.slice(m[0].length) };
}

export function joinFrontmatter(frontmatter: string, body: string): string {
  const inner = frontmatter.trim();
  if (inner === '') return body;
  return `---\n${inner}\n---\n${body}`;
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `npm test -- src/bridge/__tests__/transform.test.ts`
Expected: PASS (모든 케이스)

- [ ] **Step 5: 커밋**

```bash
cd /Users/user/src/workspace_markora/markora/frontend
git add src/bridge/transform.ts src/bridge/__tests__/transform.test.ts
git commit -m "refactor(frontend): splitFrontmatter/joinFrontmatter를 inner YAML 기준으로 변경"
```

---

### Task 2: bridge 타입/구현 — loadFile→{body,frontmatter}, saveFile(body,frontmatter)

**Files:**
- Modify: `src/types.ts`
- Modify: `src/bridge/markora.ts`
- Test: `src/bridge/__tests__/markora.test.ts`

- [ ] **Step 1: markora.test.ts를 새 시그니처로 교체 (실패 유도)**

`src/bridge/__tests__/markora.test.ts`에서 `loadFile`/`saveFile`을 사용하는 테스트들을 새 시그니처로 바꾼다. 아래 4개 `it` 블록을 찾아 각각 교체한다.

(a) "loadFile calls /api/file/read with filePath" 블록 교체:

```typescript
  it('loadFile calls /api/file/read with filePath', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ content: '# hello' }),
    });
    const b = createBridge(ctx);
    const { body, frontmatter } = await b.loadFile();
    expect(body).toBe('# hello');
    expect(frontmatter).toBe('');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:9000/api/file/read?path=%2Ftmp%2Fx.md'
    );
  });
```

(b) "saveFile POSTs JSON" 블록 교체:

```typescript
  it('saveFile POSTs JSON', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => ({}) });
    const b = createBridge(ctx);
    await b.saveFile('# updated', '');
    const call = (globalThis.fetch as any).mock.calls[0];
    expect(call[0]).toBe('http://localhost:9000/api/file/save');
    expect(call[1].method).toBe('POST');
    expect(JSON.parse(call[1].body)).toEqual({ path: '/tmp/x.md', content: '# updated' });
  });
```

(c) "frontmatter를 본문에서 떼어 반환하고 저장 시 다시 붙인다" 블록 교체:

```typescript
  it('frontmatter를 본문에서 떼어 반환하고 저장 시 다시 붙인다', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ content: '---\ntitle: Post\n---\n\n# Body\n' }),
    });
    const b = createBridge(ctx);
    const { body, frontmatter } = await b.loadFile();
    expect(body).toBe('\n# Body\n');         // 본문만
    expect(frontmatter).toBe('title: Post'); // inner YAML
    await b.saveFile('\n# Body edited\n', 'title: Post');
    const saveCall = (globalThis.fetch as any).mock.calls.find(
      (c: any[]) => c[0] === 'http://localhost:9000/api/file/save'
    );
    expect(JSON.parse(saveCall[1].body).content).toBe('---\ntitle: Post\n---\n\n# Body edited\n');
  });
```

(d) "로드한 상대경로 이미지는 저장 시 ..." 블록의 `saveFile` 호출에 두 번째 인자 추가:

```typescript
  it('로드한 상대경로 이미지는 저장 시 절대 URL이 아닌 원본 상대경로로 기록된다', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ content: '![alt](images/foo.png)\n' }),
    });
    const b = createBridge(ctx);
    await b.loadFile();
    await b.saveFile('![alt](http://localhost:3000/images/foo.png)\n', '');
    const saveCall = (globalThis.fetch as any).mock.calls.find(
      (c: any[]) => c[0] === 'http://localhost:9000/api/file/save'
    );
    expect(JSON.parse(saveCall[1].body).content).toBe('![alt](images/foo.png)\n');
  });
```

(e) "peekFile은 read 엔드포인트에서 본문(frontmatter 제거)을 반환한다" 블록 교체(peekFile은 body string 그대로 유지):

```typescript
  it('peekFile은 read 엔드포인트에서 본문(frontmatter 제거)을 반환한다', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ content: '---\ntitle: Post\n---\n\n# Body\n' }),
    });
    const b = createBridge(ctx);
    const body = await b.peekFile();
    expect(body).toBe('\n# Body\n');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:9000/api/file/read?path=%2Ftmp%2Fx.md'
    );
  });
```

(f) "peekFile은 storedFrontmatter/imageMap을 변경하지 않는다 (부작용 없음)" 블록 교체 — `storedFrontmatter` 전역이 사라졌으므로, 이제 "frontmatter는 호출자가 넘긴 값으로 저장되고 peek은 영향 없음"을 검증한다:

```typescript
  it('frontmatter는 saveFile 호출자가 넘긴 값으로 기록되고 peekFile은 이에 영향 없음', async () => {
    const b = createBridge(ctx);
    // 1) 최초 load
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: '---\ntitle: F1\n---\n\n# Body\n' }),
    });
    const { frontmatter } = await b.loadFile();
    expect(frontmatter).toBe('title: F1');
    // 2) peekFile: 디스크가 다른 frontmatter F2로 바뀐 상태를 들여다봄(부작용 없어야 함)
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: '---\ntitle: F2\n---\n\n# Body changed externally\n' }),
    });
    await b.peekFile();
    // 3) save: 호출자가 load 때 받은 F1을 그대로 넘기면 F1으로 저장돼야 한다
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await b.saveFile('\n# Body\n', frontmatter);
    const saveCall = (globalThis.fetch as any).mock.calls.find(
      (c: any[]) => c[0] === 'http://localhost:9000/api/file/save'
    );
    expect(JSON.parse(saveCall[1].body).content).toBe('---\ntitle: F1\n---\n\n# Body\n');
  });
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npm test -- src/bridge/__tests__/markora.test.ts`
Expected: FAIL (loadFile이 string을 반환, saveFile이 1-인자 → 타입/런타임 불일치)

- [ ] **Step 3: types.ts 인터페이스 변경**

`src/types.ts`의 `MarkoraBridge`에서 두 메서드 시그니처를 교체한다.

```typescript
export interface MarkoraBridge {
  getContext(): BridgeContext;
  // 디스크 파일을 읽어 본문(body)과 펜스 안쪽 inner YAML(frontmatter)을 분리해 반환한다.
  loadFile(): Promise<{ body: string; frontmatter: string }>;
  // 디스크 현재 본문을 부작용 없이 읽어온다 (저장 직전 외부 편집 충돌 검출용).
  peekFile(): Promise<string>;
  // body와 frontmatter(inner YAML)를 합쳐 파일에 저장한다. frontmatter가 비면 삭제된다.
  saveFile(body: string, frontmatter: string): Promise<void>;
  uploadImage(file: File): Promise<UploadResult>;
  onThemeChange(cb: (t: Theme) => void): () => void;
  onReloadRequest(cb: () => void): () => void;
}
```

- [ ] **Step 4: markora.ts 구현 변경 (createBridge)**

`src/bridge/markora.ts`에서 `let storedFrontmatter = '';` 줄(주석 2줄 포함)을 삭제하고, `loadFile`/`saveFile`을 교체한다.

먼저 이 블록 삭제:

```typescript
  // 로드 시 떼어낸 frontmatter를 보관했다가 저장 시 그대로 다시 붙인다.
  // (frontmatter는 BlockNote를 거치지 않으므로 손상되지 않는다)
  let storedFrontmatter = '';
```

`loadFile` 교체:

```typescript
    async loadFile() {
      const res = await fetch(
        `${ctx.serverUrl}api/file/read?path=${encodeURIComponent(ctx.filePath)}`
      );
      if (!res.ok) throw new Error(`loadFile failed: ${res.status}`);
      const data = await res.json();
      const { frontmatter, body } = splitFrontmatter(data.content ?? '');
      // 본문의 상대경로 이미지를 BlockNote가 재작성할 절대 URL로 미리 매핑해 둔다.
      const baseUri = typeof document !== 'undefined' ? document.baseURI : ctx.serverUrl;
      for (const [abs, original] of collectImageUrlMap(body, baseUri)) {
        imageMap.set(abs, original);
      }
      return { body, frontmatter };
    },
```

`saveFile` 교체:

```typescript
    async saveFile(body: string, frontmatter: string) {
      const restored = restoreImagePaths(body, imageMap);
      const content = joinFrontmatter(frontmatter, restored);
      const res = await fetch(`${ctx.serverUrl}api/file/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: ctx.filePath, content }),
      });
      if (!res.ok) throw new Error(`saveFile failed: ${res.status}`);
    },
```

(`peekFile`은 그대로 둔다 — 여전히 body string을 반환한다.)

- [ ] **Step 5: markora.ts 구현 변경 (createMockBridge)**

`createMockBridge`의 `loadFile`/`saveFile`을 교체한다. 기존 `storedMd` 변수는 유지하되, frontmatter를 분리/병합한다.

```typescript
    async loadFile() {
      const { body, frontmatter } = splitFrontmatter(storedMd);
      return { body, frontmatter };
    },
    async peekFile() {
      const { body } = splitFrontmatter(storedMd);
      return body;
    },
    async saveFile(body: string, frontmatter: string) {
      storedMd = joinFrontmatter(frontmatter, body);
      console.log('[mock] saved', storedMd.length, 'bytes');
    },
```

`createMockBridge` 상단에 `import`가 이미 파일 최상단에 있으므로(`splitFrontmatter, joinFrontmatter`) 추가 import 불필요.

- [ ] **Step 6: 테스트 실행해 통과 확인**

Run: `npm test -- src/bridge/__tests__/markora.test.ts`
Expected: PASS (모든 케이스)

- [ ] **Step 7: 커밋**

```bash
git add src/types.ts src/bridge/markora.ts src/bridge/__tests__/markora.test.ts
git commit -m "feat(frontend): bridge loadFile/saveFile에 frontmatter를 명시 인자로 노출"
```

---

### Task 3: saveGuard.ts — 죽은 레이어 1 + hasFrontmatter 제거

**Files:**
- Modify: `src/markdown/saveGuard.ts`
- Test: `src/markdown/__tests__/saveGuard.test.ts`

- [ ] **Step 1: saveGuard.test.ts에서 frontmatter 관련 케이스 제거 (실패 유도)**

`src/markdown/__tests__/saveGuard.test.ts`에서 (a) `import` 줄을 교체, (b) `describe('hasFrontmatter', ...)` 블록 전체 삭제(줄 4–17), (c) "frontmatter가 사라지는 저장은 차단" `it` 블록 삭제(줄 20–27)한다.

(a) import 교체:

```typescript
import { checkSaveSafety } from '../saveGuard';
```

(b),(c) 삭제 후 `describe('checkSaveSafety', ...)`는 다음으로 시작해야 한다(첫 케이스가 "frontmatter가 보존되면 허용"):

```typescript
describe('checkSaveSafety', () => {
  it('frontmatter가 보존되면 허용', () => {
    const previous = '---\ntitle: Post\n---\n\n# Body\n';
    const next = '---\ntitle: Post\n---\n\n# Body edited\n';
    expect(checkSaveSafety(previous, next).safe).toBe(true);
  });
```

(나머지 케이스 — "frontmatter 없는 문서의 일반 편집", "내용 대부분 사라지는 저장 차단", "작은 문서 오탐 방지", "빈 previous", 그리고 "외부 편집 클로버 가드" describe 블록 전체 — 는 그대로 유지한다.)

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npm test -- src/markdown/__tests__/saveGuard.test.ts`
Expected: FAIL — `hasFrontmatter` import는 아직 존재하므로 이 단계에서는 통과할 수도 있다. 확실한 실패 신호를 위해 먼저 Step 3의 импл 변경 없이 실행하면, import는 유효하고 케이스만 빠져 PASS가 날 수 있다. 그 경우 Step 2는 "삭제 후에도 남은 케이스가 PASS"임을 확인하는 의미로 간주하고 Step 3로 진행한다. (이 Task는 코드 제거가 주목적이라 red→green이 약하다 — Step 4의 전체 통과가 검증 기준이다.)

Run: `npm test -- src/markdown/__tests__/saveGuard.test.ts`
Expected: PASS (남은 케이스), 단 `hasFrontmatter`는 아직 export되어 있음

- [ ] **Step 3: saveGuard.ts에서 레이어 1과 frontmatter 유틸 제거**

`src/markdown/saveGuard.ts`에서 다음을 제거한다.

(a) 파일 상단 주석 블록(줄 1–10)을 아래로 교체(frontmatter 언급 제거):

```typescript
// 저장 직전 손실 가드 (옵션 C: 즉시 출혈 방지)
//
// blocksToMarkdownLossy 라운드트립은 BlockNote가 모델링하지 못하는 구조(HTML 블록 등)를
// 삭제·파괴한다. Editor는 편집이 일어날 때마다 본문 전체를 이 손실 변환으로 재직렬화해
// 파일을 통째로 덮어쓰므로, 한 번의 사소한 편집만으로도 내용이 영구히 손실될 수 있다.
// (frontmatter는 BlockNote를 거치지 않으므로 이 가드의 대상이 아니다 — 패널에서 따로 다룬다.)
//
// 이 가드는 저장 직전 직렬화 결과(next)를 마지막으로 알려진 정상 본문(previous) 및
// 디스크 현재 본문(disk)과 비교하여 명백한 손실이 감지되면 저장을 차단한다.
```

(b) `FRONTMATTER_RE`와 `hasFrontmatter` 정의(줄 34–40) 삭제:

```typescript
// 문서 맨 앞(BOM 허용)의 `---\n ... \n---\n` 블록만 frontmatter로 인정.
// 본문 중간의 --- 구분선은 매칭되지 않는다.
const FRONTMATTER_RE = /^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n/;

export function hasFrontmatter(md: string): boolean {
  return FRONTMATTER_RE.test(md);
}
```

(c) `checkSaveSafety` 안의 레이어 1 블록(줄 50–53) 삭제:

```typescript
  // 1) frontmatter 파괴 감지: 원본엔 있었는데 저장본엔 사라짐/깨짐
  if (hasFrontmatter(previous) && !hasFrontmatter(next)) {
    return { safe: false, reason: 'frontmatter would be lost', lostChars, lostRatio };
  }
```

(d) 남은 주석의 레이어 번호는 의미 전달용이므로 그대로 둬도 무방하다(레이어 2/3 주석 유지).

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `npm test -- src/markdown/__tests__/saveGuard.test.ts`
Expected: PASS (남은 모든 케이스)

- [ ] **Step 5: 커밋**

```bash
git add src/markdown/saveGuard.ts src/markdown/__tests__/saveGuard.test.ts
git commit -m "refactor(frontend): saveGuard의 죽은 frontmatter 레이어 제거"
```

---

### Task 4: FrontmatterPanel 컴포넌트

**Files:**
- Create: `src/editor/FrontmatterPanel.tsx`
- Test: `src/editor/__tests__/FrontmatterPanel.test.tsx`

- [ ] **Step 1: 컴포넌트 테스트 작성 (실패 유도)**

`src/editor/__tests__/FrontmatterPanel.test.tsx` 생성:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FrontmatterPanel } from '../FrontmatterPanel';

describe('FrontmatterPanel', () => {
  it('frontmatter가 있으면 펼쳐진 채로 textarea에 inner YAML 표시', () => {
    render(<FrontmatterPanel value={'title: Post\ntags: [a]'} onChange={() => {}} />);
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(ta.value).toBe('title: Post\ntags: [a]');
  });

  it('빈 값이면 접혀 있어 textarea가 보이지 않고 헤더는 추가 라벨', () => {
    render(<FrontmatterPanel value={''} onChange={() => {}} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('button', { name: /add frontmatter/i })).toBeTruthy();
  });

  it('편집 시 onChange가 새 값으로 호출된다', () => {
    const onChange = vi.fn();
    render(<FrontmatterPanel value={'title: A'} onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'title: B' } });
    expect(onChange).toHaveBeenCalledWith('title: B');
  });

  it('빈 상태에서 헤더 클릭으로 펼치면 textarea가 나타난다', () => {
    render(<FrontmatterPanel value={''} onChange={() => {}} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /frontmatter/i }));
    expect(screen.getByRole('textbox')).toBeTruthy();
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npm test -- src/editor/__tests__/FrontmatterPanel.test.tsx`
Expected: FAIL ("Cannot find module '../FrontmatterPanel'")

- [ ] **Step 3: FrontmatterPanel 구현**

`src/editor/FrontmatterPanel.tsx` 생성:

```tsx
import React, { useEffect, useRef, useState } from 'react';

interface Props {
  value: string;                   // 펜스 안쪽 inner YAML
  onChange: (next: string) => void;
}

// BlockNote 바깥에서 frontmatter(inner YAML)를 raw 텍스트로 편집하는 접이식 패널.
// 상태는 부모(Editor)가 소유하는 컨트롤드 컴포넌트다.
export function FrontmatterPanel({ value, onChange }: Props) {
  const hasContent = value.trim() !== '';
  const [open, setOpen] = useState(false);
  // 파일 로드로 frontmatter가 처음 들어오면 한 번 펼친다. 이후엔 사용자가 토글을 제어.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current && value.trim() !== '') {
      setOpen(true);
      initializedRef.current = true;
    }
  }, [value]);

  return (
    <div className="markora-frontmatter" data-empty={!hasContent}>
      <button
        type="button"
        className="markora-frontmatter-header"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="markora-frontmatter-caret">{open ? '▾' : '▸'}</span>
        <span>{hasContent ? 'Frontmatter' : '+ Add frontmatter'}</span>
      </button>
      {open && (
        <textarea
          className="markora-frontmatter-input"
          value={value}
          spellCheck={false}
          rows={Math.max(3, value.split('\n').length + 1)}
          placeholder={'title: ...\ntags: [...]'}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `npm test -- src/editor/__tests__/FrontmatterPanel.test.tsx`
Expected: PASS (4개 케이스)

- [ ] **Step 5: 커밋**

```bash
git add src/editor/FrontmatterPanel.tsx src/editor/__tests__/FrontmatterPanel.test.tsx
git commit -m "feat(frontend): frontmatter raw YAML 편집 패널 컴포넌트 추가"
```

---

### Task 5: Editor.tsx 통합 + 패널 스타일

**Files:**
- Modify: `src/editor/Editor.tsx`
- Modify: `src/styles.css`

이 Task는 BlockNote/JCEF 의존성으로 단위 테스트가 어렵다. 검증은 (1) `npm run check`(타입), (2) `npm test`(기존 스위트 회귀), (3) Task 6의 빌드 + 수동 runIde로 한다.

- [ ] **Step 1: import 추가**

`src/editor/Editor.tsx` 상단 import 블록에 패널 import를 추가한다(다른 editor 로컬 import 근처).

```tsx
import { FrontmatterPanel } from './FrontmatterPanel';
```

- [ ] **Step 2: frontmatter state/ref 추가**

`const lastKnownContentRef = useRef<string>('');` 줄 바로 아래에 추가한다.

```tsx
  const [frontmatter, setFrontmatter] = useState('');
  // debounce 저장 타이머(1초 뒤 실행)가 stale 클로저를 잡지 않도록 최신 frontmatter를 ref로 보관.
  const frontmatterRef = useRef('');
```

- [ ] **Step 3: 저장 로직을 scheduleSave()로 추출**

기존 "onChange → 디바운스 저장" useEffect(현재 `editor.onChange(() => { ... })` 전체)를 아래로 교체한다. 저장 본문을 `scheduleSave` useCallback으로 빼고, `editor.onChange`는 그것을 호출만 한다. 저장 시 `bridge.saveFile(body, frontmatterRef.current)`로 frontmatter를 함께 넘긴다.

```tsx
  // 본문/패널 어느 쪽이 바뀌든 호출하는 공용 디바운스 저장.
  const scheduleSave = useCallback(() => {
    // 초기 load가 트리거한 변경은 무시 (user edit만 dirty 처리)
    if (!loadedRef.current) return;
    // 외부 변경 reload(replaceBlocks)가 트리거한 onChange도 user edit이 아니므로 무시.
    if (applyingRemoteRef.current) return;
    isDirtyRef.current = true;
    setStatus('Modified');
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        setStatus('Saving...');
        const body = await editor.blocksToMarkdownLossy(preSerialize(editor.document as any) as any);
        // 저장 직전 디스크 현재 본문을 부작용 없이 읽어 외부 편집(터미널 등)을 확인한다.
        let disk: string | undefined;
        try { disk = await bridge.peekFile(); } catch { disk = undefined; }
        // 손실 가드: 본문(body)이 마지막 정상 내용/디스크 대비 대량 손실이면 덮어쓰지 않는다.
        const guard = checkSaveSafety(lastKnownContentRef.current, body, disk);
        if (!guard.safe) {
          console.warn('save blocked by guard:', guard.reason, { body });
          isDirtyRef.current = true; // 미저장 상태 유지
          setStatus(`⚠ Save blocked: ${guard.reason}`);
          return;
        }
        await bridge.saveFile(body, frontmatterRef.current);
        lastKnownContentRef.current = body;
        isDirtyRef.current = false;
        setStatus('Saved');
        window.setTimeout(() => {
          if (!isDirtyRef.current) setStatus('Ready');
        }, 2000);
      } catch (e) {
        console.error('saveFile failed:', e);
        const msg = e instanceof Error ? e.message : String(e);
        setStatus(`Save failed: ${msg.substring(0, 80)}`);
      }
    }, 1000);
  }, [editor, bridge]);

  // 본문 편집 → 디바운스 저장
  useEffect(() => {
    return editor.onChange(() => scheduleSave());
  }, [editor, scheduleSave]);
```

- [ ] **Step 4: frontmatter 변경 핸들러 추가**

`scheduleSave` useCallback 아래에 추가한다.

```tsx
  // 패널에서 frontmatter가 바뀌면 ref를 갱신하고 본문과 동일한 저장 흐름을 태운다.
  const handleFrontmatterChange = useCallback((next: string) => {
    setFrontmatter(next);
    frontmatterRef.current = next;
    scheduleSave();
  }, [scheduleSave]);
```

- [ ] **Step 5: 초기 load에서 frontmatter 세팅**

초기 로드 useEffect의 `const md = await bridge.loadFile();` 이하를 교체한다. `loadFile`이 객체를 반환하므로 구조분해하고, frontmatter state/ref를 채운다.

기존:

```tsx
        const md = await bridge.loadFile();
        if (cancelled) return;
        const blocks = await editor.tryParseMarkdownToBlocks(md);
        editor.replaceBlocks(editor.document, postParse(blocks as any) as any);
        lastKnownContentRef.current = md;
        isDirtyRef.current = false;
```

교체 후:

```tsx
        const { body, frontmatter: fm } = await bridge.loadFile();
        if (cancelled) return;
        setFrontmatter(fm);
        frontmatterRef.current = fm;
        const blocks = await editor.tryParseMarkdownToBlocks(body);
        editor.replaceBlocks(editor.document, postParse(blocks as any) as any);
        lastKnownContentRef.current = body;
        isDirtyRef.current = false;
```

- [ ] **Step 6: reload 핸들러에서 frontmatter 동기화**

외부 변경 reload useEffect의 `reload` 함수 안 `const md = await bridge.loadFile();` 이하를 교체한다. body가 같아도 frontmatter가 외부에서 바뀌었으면 패널을 갱신한다.

기존:

```tsx
        const md = await bridge.loadFile();
        if (md === lastKnownContentRef.current) return;
        // reload가 트리거하는 onChange를 user edit으로 오인해 되저장하지 않도록 억제.
        applyingRemoteRef.current = true;
        const blocks = await editor.tryParseMarkdownToBlocks(md);
        editor.replaceBlocks(editor.document, postParse(blocks as any) as any);
        lastKnownContentRef.current = md;
        isDirtyRef.current = false;
        window.setTimeout(() => { applyingRemoteRef.current = false; }, 0);
```

교체 후:

```tsx
        const { body, frontmatter: fm } = await bridge.loadFile();
        // 외부에서 frontmatter만 바뀐 경우에도 패널을 동기화 (setFrontmatter는 저장을 트리거하지 않음).
        if (fm !== frontmatterRef.current) {
          setFrontmatter(fm);
          frontmatterRef.current = fm;
        }
        if (body === lastKnownContentRef.current) return;
        // reload가 트리거하는 onChange를 user edit으로 오인해 되저장하지 않도록 억제.
        applyingRemoteRef.current = true;
        const blocks = await editor.tryParseMarkdownToBlocks(body);
        editor.replaceBlocks(editor.document, postParse(blocks as any) as any);
        lastKnownContentRef.current = body;
        isDirtyRef.current = false;
        window.setTimeout(() => { applyingRemoteRef.current = false; }, 0);
```

- [ ] **Step 7: 패널 렌더**

`return (...)` 안의 `<BlockNoteView ...>` 바로 위에 패널을 추가한다. (SearchBar 블록 다음, BlockNoteView 앞.)

```tsx
      <FrontmatterPanel value={frontmatter} onChange={handleFrontmatterChange} />
      <BlockNoteView editor={editor} theme={theme} slashMenu={false}>
```

- [ ] **Step 8: styles.css에 패널 스타일 추가**

`src/styles.css` 맨 아래에 추가한다(다크/라이트는 BlockNote 변수에 의존하지 않고 중립 색으로 둔다 — 최소 스타일).

```css
/* Frontmatter 편집 패널 */
.markora-frontmatter {
  max-width: var(--markora-content-width, 900px);
  margin: 8px auto 0;
  padding: 0 56px; /* BlockNote 본문 좌우 여백과 대략 정렬 */
  box-sizing: border-box;
}
.markora-frontmatter-header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 4px 6px;
  background: transparent;
  border: none;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  color: var(--mantine-color-dimmed, #888);
  text-align: left;
}
.markora-frontmatter-caret {
  display: inline-block;
  width: 1em;
}
.markora-frontmatter-input {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin: 4px 0 8px;
  padding: 8px 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
  border: 1px solid var(--mantine-color-default-border, #d0d0d0);
  border-radius: 6px;
  background: var(--mantine-color-default-hover, rgba(127,127,127,0.06));
  color: inherit;
  resize: vertical;
}
```

참고: `--markora-content-width`가 styles.css에 정의돼 있지 않으면 fallback(900px/56px)이 적용된다. 정렬이 본문과 어긋나면 Task 6 수동 확인 단계에서 패딩 값을 BlockNote 실제 여백에 맞춰 조정한다.

- [ ] **Step 9: 타입체크 + 전체 테스트 회귀 확인**

Run: `npm run check`
Expected: 타입 에러 없음 (0 errors)

Run: `npm test`
Expected: 전체 스위트 PASS (변경한 transform/markora/saveGuard/FrontmatterPanel 포함)

- [ ] **Step 10: 커밋**

```bash
git add src/editor/Editor.tsx src/styles.css
git commit -m "feat(frontend): Editor에 frontmatter 패널 통합 및 공용 저장 경로 연결"
```

---

### Task 6: 빌드 검증 및 수동 동작 확인

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 프론트엔드 번들 빌드**

Run: `cd /Users/user/src/workspace_markora/markora && ./gradlew buildFrontend`
Expected: BUILD SUCCESSFUL, `src/main/resources/blocknote/dist/`에 번들 갱신

- [ ] **Step 2: 샌드박스 IDE 실행 (수동)**

Run: `cd /Users/user/src/workspace_markora/markora && ./gradlew runIde`

수동 확인 체크리스트:
- [ ] frontmatter가 있는 .md 파일을 markora 탭으로 열면 본문 위에 "Frontmatter" 패널이 펼쳐져 inner YAML이 보인다.
- [ ] YAML을 수정하면 잠시 후 상태가 Saving→Saved로 바뀌고, 디스크 파일의 `---` 블록이 갱신된다(터미널 `cat`으로 확인).
- [ ] 본문 편집은 기존과 동일하게 동작하고 frontmatter는 그대로 보존된다.
- [ ] frontmatter가 없는 .md 파일은 "+ Add frontmatter"가 접힌 채 보이고, 펼쳐 입력 후 저장하면 파일 맨 위에 `---` 블록이 새로 생긴다.
- [ ] 패널 YAML을 전부 지우고 저장하면 파일에서 `---` 블록이 사라진다(본문은 유지).
- [ ] 패널 정렬이 본문 좌우 여백과 크게 어긋나지 않는다(어긋나면 styles.css 패딩 조정 후 Step 1 재실행).

- [ ] **Step 3: 수동 확인 결과 반영 후 최종 커밋 (필요 시)**

스타일/정렬 조정이 있었다면:

```bash
cd /Users/user/src/workspace_markora/markora/frontend
git add src/styles.css
git commit -m "style(frontend): frontmatter 패널 본문 정렬 조정"
```

---

## Self-Review (작성자 점검 완료)

- **Spec coverage:** raw YAML 편집(Task 4/5), BlockNote 바깥 패널(Task 4/5), 없는 파일에 추가(Task 4 빈 상태 + Task 1 join), 비우면 삭제(Task 1 join 빈값 처리 + Task 5), 본문과 동일 자동저장(Task 5 scheduleSave), 가드 정리(Task 3) — 모두 태스크에 매핑됨.
- **Placeholder scan:** TODO/TBD 없음. 모든 코드 스텝에 실제 코드 포함.
- **Type consistency:** `loadFile(): Promise<{ body, frontmatter }>`, `saveFile(body, frontmatter)`가 types.ts(Task2 S3)·markora.ts(Task2 S4/S5)·Editor.tsx(Task5 S5/S6)·테스트(Task2 S1)에서 일관. `splitFrontmatter`/`joinFrontmatter`(inner YAML)가 transform·bridge·mock에서 일관. `FrontmatterPanel` props(`value`/`onChange`)가 컴포넌트·테스트·Editor에서 일관.
- **알려진 약점:** Task 3은 죽은 코드 제거라 red→green이 약함(Step 2 주석에 명시). Task 5는 단위 테스트 불가 영역이라 typecheck+빌드+수동 검증으로 보완(Task 6).
