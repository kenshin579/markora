# Cmd+Arrow 줄 단위 커서 이동 (macOS 텍스트 에디터 동작)

날짜: 2026-05-24
상태: 설계 승인됨

## 배경 / 문제

markora 에디터는 JCEF(임베디드 Chromium) 안에서 동작하는 BlockNote(ProseMirror 기반) WYSIWYG 에디터다. macOS에서 `Cmd+←/→`를 누르면 일반 텍스트 에디터처럼 **현재 줄의 처음/끝으로 커서가 이동**해야 하는데, 현재는 **아무 반응이 없다**.

원인: macOS는 `Cmd+Left`를 Cocoa 텍스트 키 바인딩(`moveToBeginningOfLine:` 등)으로 변환해 에디터에 전달하는데, 임베디드 Chromium(JCEF)에서는 이 바인딩이 호스트 IDE를 거치며 contenteditable로 제대로 전파되지 않아 줄 처음/끝 이동이 동작하지 않는다.

## 범위

포함:
- `Cmd+←` → 현재 (시각적) 줄 처음으로 커서 이동
- `Cmd+→` → 현재 (시각적) 줄 끝으로 커서 이동
- `Shift+Cmd+←` → 줄 처음까지 선택 확장
- `Shift+Cmd+→` → 줄 끝까지 선택 확장

제외 (이번 범위 밖):
- `Cmd+↑/↓` (문서 처음/끝)
- `Option+←/→` (단어 단위 이동)

## 접근법

검토한 대안:
- **A. 프런트엔드 keydown 핸들러 + 네이티브 `Selection.modify('lineboundary')`** — 채택
- B. ProseMirror/BlockNote 키맵 확장: PM은 논리적 위치 기반이라 "시각적 줄 경계" 개념이 없어 wrap된 문단에서 부정확/복잡 → 탈락
- C. Kotlin/JCEF 레벨 키 가로채기 + JS 주입: 브리지 왕복·유지보수 부담으로 과함 → 탈락

A를 채택하는 이유: 브라우저가 원래 수행하던 동작을 그대로 재현하며, `'lineboundary'` 단위는 **줄바꿈(wrap)된 시각적 줄**을 기준으로 동작해 macOS 실제 동작과 일치한다. 코드가 작고 한 파일(`Editor.tsx`)에 모인다.

## 설계

위치: `frontend/src/editor/Editor.tsx` — 새 `useEffect` 하나 추가 (기존 키 처리 코드 없음, 독립적).

동작:
- BlockNote 에디터 DOM 요소(`editor.domElement`, 없으면 `.markora-shell` 컨테이너)에 **capture 단계** `keydown` 리스너 등록.
- 매칭 조건: `e.metaKey === true` && `e.key`가 `ArrowLeft`/`ArrowRight` && `e.altKey === false` && `e.ctrlKey === false`.
- 매칭 시:
  - `e.preventDefault()` (JCEF 기본 동작 차단)
  - `const sel = window.getSelection()`
  - 가드: `sel`가 없거나 `typeof sel.modify !== 'function'`이면 무시
  - `const alter = e.shiftKey ? 'extend' : 'move'`
  - `const dir = e.key === 'ArrowLeft' ? 'backward' : 'forward'`
  - `sel.modify(alter, dir, 'lineboundary')`
- cleanup에서 리스너 제거.

### 키 매핑

| 키 | 동작 |
|---|---|
| `Cmd+←` | 시각적 줄 처음으로 커서 이동 |
| `Cmd+→` | 시각적 줄 끝으로 커서 이동 |
| `Shift+Cmd+←` | 줄 처음까지 선택 |
| `Shift+Cmd+→` | 줄 끝까지 선택 |

### 엣지 / 안전

- `Alt` 조합(단어 이동)은 건드리지 않음 → 향후 확장 여지.
- `Cmd+↑/↓`도 미건드림 (이번 범위 밖).
- KaTeX/Mermaid 등 커스텀 블록 내부 입력은 별도 입력 요소를 써 메인 contenteditable 셀렉션과 분리되므로 영향 없음.
- ProseMirror는 `selectionchange` 이벤트로 DOM 셀렉션 변경을 자동 동기화하므로 추가 처리 불필요.

## 테스트

- Vitest 단위 테스트: 핸들러가 키 조합별로 `sel.modify`를 **올바른 인자**(`alter`, `dir`, `'lineboundary'`)로 호출하는지 mock으로 검증. (`Selection.modify`는 jsdom에 없으므로 실제 커서 이동은 검증 불가)
- 수동 검증: `./gradlew runIde`로 샌드박스 IDE 실행 후 `.md` 파일에서 4개 키 조합 실제 동작 확인 — wrap된 긴 문단에서 시각적 줄 기준 이동 포함.
