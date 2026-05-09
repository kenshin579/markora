import { useRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

  afterEach(() => {
    // Prevent fake-timer leakage between tests; the "Copied" test uses vi.useFakeTimers()
    // and must not leave them active for subsequent tests.
    vi.useRealTimers();
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
    // Use real timers — render and hover before switching to fake timers to avoid
    // waitFor / findByRole deadlocks that occur when timers are faked from the start.
    render(<Harness pres={[{ lang: 'js', text: 'hi' }]} />);
    const pre = document.querySelector('pre')!;
    fireEvent.mouseEnter(pre);
    // Button appears synchronously after fireEvent (React flushes synchronously)
    const button = screen.getByRole('button', { name: /copy/i });

    // Switch to fake timers only for the timeout assertion
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(button);
      // Flush the clipboard promise microtask so setCopied(true) runs
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(button.textContent?.toLowerCase()).toContain('copied');
    act(() => { vi.advanceTimersByTime(2000); });
    expect(button.textContent?.toLowerCase()).toContain('copy');
    expect(button.textContent?.toLowerCase()).not.toContain('copied');
    vi.useRealTimers();
  });

  it('클립보드에 버튼 라벨("Copy"/"Copied") 텍스트가 포함되지 않는다', async () => {
    // This test would FAIL if the implementation reverted to `hoveredPre.innerText`
    // because the portal button is rendered inside <pre>, so innerText would include
    // the "Copy" label. The component must read from <code> only.
    render(<Harness pres={[{ lang: 'js', text: 'const y = 2;' }]} />);
    const pre = document.querySelector('pre')!;
    fireEvent.mouseEnter(pre);
    const button = await screen.findByRole('button', { name: /copy/i });
    fireEvent.click(button);
    await waitFor(() => {
      const writtenText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(writtenText).toBe('const y = 2;');
      expect(writtenText).not.toMatch(/copy/i);
      expect(writtenText).not.toMatch(/copied/i);
    });
  });

  it('동적으로 추가된 pre도 인식한다 (MutationObserver)', async () => {
    const { rerender } = render(<Harness pres={[]} />);
    // Rerender inside act so React flushes its own state.
    await act(async () => {
      rerender(<Harness pres={[{ lang: 'py', text: 'print(1)' }]} />);
    });
    // happy-dom fires MutationObserver callbacks after the microtask queue,
    // so a second act() call lets them run before we fire mouseEnter.
    await act(async () => {
      await Promise.resolve();
    });
    const pre = document.querySelector('pre')!;
    fireEvent.mouseEnter(pre);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copy/i })).toBeVisible();
    });
  });
});
