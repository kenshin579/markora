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
