# Cmd+Arrow 줄 단위 커서 이동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** macOS에서 `Cmd+←/→`(줄 처음/끝 이동)와 `Shift+Cmd+←/→`(줄 처음/끝까지 선택)가 markora 에디터(JCEF 안의 BlockNote)에서 동작하도록 한다.

**Architecture:** 키 처리 로직을 순수 함수 `handleLineNavigationKeydown`로 분리해 단위 테스트하고, `Editor.tsx`의 `useEffect`에서 에디터 DOM에 capture 단계 `keydown` 리스너로 연결한다. 실제 커서 이동은 네이티브 `Selection.modify(alter, direction, 'lineboundary')`에 위임해 시각적(줄바꿈 wrap 반영) 줄 경계를 따른다.

**Tech Stack:** TypeScript, React 18, BlockNote(ProseMirror), Vitest(happy-dom), 네이티브 `Selection.modify`.

---

## File Structure

- Create: `frontend/src/editor/lineNavigation.ts` — 순수 키 처리 함수. 키 이벤트와 selection을 받아 처리 여부를 결정하고 `selection.modify`를 호출.
- Create: `frontend/src/editor/__tests__/lineNavigation.test.ts` — 위 함수의 단위 테스트.
- Modify: `frontend/src/editor/Editor.tsx` — 에디터 DOM에 keydown 리스너를 거는 `useEffect` 추가.

---

### Task 1: 순수 키 처리 함수 `handleLineNavigationKeydown`

**Files:**
- Create: `frontend/src/editor/lineNavigation.ts`
- Test: `frontend/src/editor/__tests__/lineNavigation.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/editor/__tests__/lineNavigation.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { handleLineNavigationKeydown } from '../lineNavigation';

type EvtOverrides = Partial<{
  metaKey: boolean; altKey: boolean; ctrlKey: boolean; shiftKey: boolean; key: string;
}>;

function makeEvent(o: EvtOverrides) {
  return {
    metaKey: o.metaKey ?? false,
    altKey: o.altKey ?? false,
    ctrlKey: o.ctrlKey ?? false,
    shiftKey: o.shiftKey ?? false,
    key: o.key ?? '',
    preventDefault: vi.fn(),
  };
}

function makeSelection() {
  return { modify: vi.fn() };
}

describe('handleLineNavigationKeydown', () => {
  it('Cmd+Left → move backward lineboundary, preventDefault, returns true', () => {
    const e = makeEvent({ metaKey: true, key: 'ArrowLeft' });
    const sel = makeSelection();
    const handled = handleLineNavigationKeydown(e, sel);
    expect(handled).toBe(true);
    expect(e.preventDefault).toHaveBeenCalledOnce();
    expect(sel.modify).toHaveBeenCalledWith('move', 'backward', 'lineboundary');
  });

  it('Cmd+Right → move forward lineboundary', () => {
    const e = makeEvent({ metaKey: true, key: 'ArrowRight' });
    const sel = makeSelection();
    handleLineNavigationKeydown(e, sel);
    expect(sel.modify).toHaveBeenCalledWith('move', 'forward', 'lineboundary');
  });

  it('Shift+Cmd+Left → extend backward lineboundary', () => {
    const e = makeEvent({ metaKey: true, shiftKey: true, key: 'ArrowLeft' });
    const sel = makeSelection();
    handleLineNavigationKeydown(e, sel);
    expect(sel.modify).toHaveBeenCalledWith('extend', 'backward', 'lineboundary');
  });

  it('Shift+Cmd+Right → extend forward lineboundary', () => {
    const e = makeEvent({ metaKey: true, shiftKey: true, key: 'ArrowRight' });
    const sel = makeSelection();
    handleLineNavigationKeydown(e, sel);
    expect(sel.modify).toHaveBeenCalledWith('extend', 'forward', 'lineboundary');
  });

  it('Alt+Cmd+Left → 무시 (단어 이동은 범위 밖)', () => {
    const e = makeEvent({ metaKey: true, altKey: true, key: 'ArrowLeft' });
    const sel = makeSelection();
    const handled = handleLineNavigationKeydown(e, sel);
    expect(handled).toBe(false);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(sel.modify).not.toHaveBeenCalled();
  });

  it('Cmd 없는 화살표 → 무시', () => {
    const e = makeEvent({ key: 'ArrowLeft' });
    const sel = makeSelection();
    expect(handleLineNavigationKeydown(e, sel)).toBe(false);
    expect(sel.modify).not.toHaveBeenCalled();
  });

  it('Cmd+Up 등 다른 키 → 무시', () => {
    const e = makeEvent({ metaKey: true, key: 'ArrowUp' });
    const sel = makeSelection();
    expect(handleLineNavigationKeydown(e, sel)).toBe(false);
    expect(sel.modify).not.toHaveBeenCalled();
  });

  it('selection이 null이어도 매칭 키면 preventDefault 하고 true 반환 (크래시 없음)', () => {
    const e = makeEvent({ metaKey: true, key: 'ArrowLeft' });
    const handled = handleLineNavigationKeydown(e, null);
    expect(handled).toBe(true);
    expect(e.preventDefault).toHaveBeenCalledOnce();
  });

  it('selection.modify가 없으면 호출 시도 없이 true 반환 (크래시 없음)', () => {
    const e = makeEvent({ metaKey: true, key: 'ArrowLeft' });
    const handled = handleLineNavigationKeydown(e, {} as any);
    expect(handled).toBe(true);
    expect(e.preventDefault).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `cd frontend && npx vitest run src/editor/__tests__/lineNavigation.test.ts`
Expected: FAIL — `Failed to resolve import "../lineNavigation"` (모듈 없음).

- [ ] **Step 3: 최소 구현 작성**

`frontend/src/editor/lineNavigation.ts`:

```ts
// macOS 텍스트 에디터식 Cmd+화살표 줄 이동/선택 처리.
// JCEF(임베디드 Chromium)에서는 Cocoa 키 바인딩이 전파되지 않아 Cmd+←/→가 죽으므로
// 직접 잡아 네이티브 Selection.modify('lineboundary')로 시각적 줄 경계 이동을 재현한다.

interface KeydownLike {
  metaKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  key: string;
  preventDefault: () => void;
}

interface SelectionLike {
  modify?: (alter: string, direction: string, granularity: string) => void;
}

/**
 * Cmd+←/→ 및 Shift+Cmd+←/→를 처리한다.
 * @returns 이 이벤트를 처리했으면 true (호출부가 더 진행하지 않도록).
 */
export function handleLineNavigationKeydown(
  e: KeydownLike,
  selection: SelectionLike | null,
): boolean {
  if (!e.metaKey || e.altKey || e.ctrlKey) return false;
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return false;

  e.preventDefault();

  if (selection && typeof selection.modify === 'function') {
    const alter = e.shiftKey ? 'extend' : 'move';
    const direction = e.key === 'ArrowLeft' ? 'backward' : 'forward';
    selection.modify(alter, direction, 'lineboundary');
  }
  return true;
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `cd frontend && npx vitest run src/editor/__tests__/lineNavigation.test.ts`
Expected: PASS — 9개 테스트 통과.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/editor/lineNavigation.ts frontend/src/editor/__tests__/lineNavigation.test.ts
git commit -m "feat(frontend): add Cmd+Arrow line navigation key handler

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `Editor.tsx`에 keydown 리스너 연결

**Files:**
- Modify: `frontend/src/editor/Editor.tsx`

- [ ] **Step 1: import 추가**

`frontend/src/editor/Editor.tsx`의 import 블록(9번째 줄 `import { reinitOnThemeChange } ...` 다음)에 추가:

```ts
import { handleLineNavigationKeydown } from './lineNavigation';
```

- [ ] **Step 2: keydown 리스너 useEffect 추가**

`Editor.tsx`에서 "테마 동기화" `useEffect`(현재 159~164번째 줄, `return bridge.onThemeChange(...)`) **바로 앞**에 아래 `useEffect`를 삽입:

```tsx
  // macOS Cmd+←/→ 줄 처음/끝 이동, Shift+Cmd+←/→ 줄 단위 선택.
  // JCEF에서 막히는 동작이라 직접 잡아 네이티브 Selection.modify로 처리한다.
  useEffect(() => {
    const target: HTMLElement = editor.domElement ?? document.body;
    const onKeyDown = (e: KeyboardEvent) => {
      handleLineNavigationKeydown(e, window.getSelection());
    };
    target.addEventListener('keydown', onKeyDown, true);
    return () => target.removeEventListener('keydown', onKeyDown, true);
  }, [editor]);
```

설명: capture 단계(`true`)로 등록해 ProseMirror 기본 키 처리보다 먼저 실행되게 한다. `editor.domElement`가 아직 없으면 `document.body`로 폴백한다(해당 effect는 `editor` 의존성이라 도큐먼트 마운트 후 실행됨).

- [ ] **Step 3: 타입체크 + 전체 프런트 테스트 실행**

Run: `cd frontend && npm run build 2>&1 | tail -5 && npx vitest run`
Expected: 빌드 성공(타입 에러 없음), 모든 테스트 PASS.

(주: `npm run build`는 vite 번들까지 수행하며 TS 타입 에러가 있으면 실패한다. 타입체크만 빠르게 원하면 `npx tsc --noEmit` 사용 가능.)

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/editor/Editor.tsx
git commit -m "feat(frontend): wire Cmd+Arrow line navigation into editor

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 샌드박스 IDE 수동 검증

**Files:** 없음 (수동 검증 단계)

- [ ] **Step 1: 샌드박스 IDE 실행**

Run: `./gradlew runIde`
(JDK 21 필요. `buildFrontend`가 선행되어 최신 프런트 번들이 포함됨.)

- [ ] **Step 2: `.md` 파일을 Markora 탭으로 열고 4개 조합 확인**

긴 문단(에디터 폭을 넘겨 줄바꿈되는 텍스트) 안에 커서를 두고 확인:
- `Cmd+←` → 현재 시각적 줄의 처음으로 이동
- `Cmd+→` → 현재 시각적 줄의 끝으로 이동
- `Shift+Cmd+←` → 줄 처음까지 선택
- `Shift+Cmd+→` → 줄 끝까지 선택

Expected: 4개 모두 macOS 텍스트 에디터와 동일하게 동작. `Cmd+↑/↓`, `Option+←/→`는 기존과 동일(이번 변경 영향 없음).

- [ ] **Step 3: 검증 결과 기록**

수동 검증이 통과하면 PR 준비 완료. 실패 항목이 있으면 systematic-debugging으로 원인 분석.

---

## Notes

- 새 npm 의존성 없음.
- `Selection.modify`는 비표준이지만 모든 Chromium/WebKit에서 지원 — JCEF는 Chromium 기반이라 안전.
- happy-dom/jsdom에는 `Selection.modify`가 없으므로 단위 테스트는 mock으로 호출 인자만 검증하고, 실제 커서 이동은 Task 3 수동 검증으로 확인한다(설계 문서 명시).
