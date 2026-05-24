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
