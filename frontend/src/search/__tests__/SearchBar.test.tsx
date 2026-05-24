import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchBar } from '../SearchBar';

function setup(overrides: Partial<React.ComponentProps<typeof SearchBar>> = {}) {
  const props = {
    summary: { count: 0, current: 0 },
    onSearch: vi.fn(),
    onNext: vi.fn(),
    onPrev: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<SearchBar {...props} />);
  return props;
}

describe('SearchBar', () => {
  it('fires onSearch with query and options as the user types', async () => {
    const props = setup();
    fireEvent.change(screen.getByPlaceholderText('Find'), { target: { value: 'cat' } });
    await vi.waitFor(() =>
      expect(props.onSearch).toHaveBeenCalledWith('cat', { caseSensitive: false, wholeWord: false }),
    );
  });

  it('toggles case-sensitive and re-fires onSearch', async () => {
    const props = setup();
    fireEvent.change(screen.getByPlaceholderText('Find'), { target: { value: 'cat' } });
    fireEvent.click(screen.getByRole('button', { name: /case sensitive/i }));
    await vi.waitFor(() =>
      expect(props.onSearch).toHaveBeenLastCalledWith('cat', { caseSensitive: true, wholeWord: false }),
    );
  });

  it('shows "n / total" when there are matches', () => {
    setup({ summary: { count: 12, current: 3 } });
    expect(screen.getByText('3 / 12')).toBeInTheDocument();
  });

  it('shows "No results" when query present but zero matches', () => {
    setup({ summary: { count: 0, current: 0 } });
    fireEvent.change(screen.getByPlaceholderText('Find'), { target: { value: 'zzz' } });
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('disables next/prev when there are no matches', () => {
    setup({ summary: { count: 0, current: 0 } });
    expect(screen.getByRole('button', { name: /next match/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /previous match/i })).toBeDisabled();
  });

  it('Enter triggers next, Shift+Enter triggers prev', () => {
    const props = setup({ summary: { count: 2, current: 1 } });
    const input = screen.getByPlaceholderText('Find');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onNext).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(props.onPrev).toHaveBeenCalledTimes(1);
  });

  it('Escape triggers onClose', () => {
    const props = setup();
    fireEvent.keyDown(screen.getByPlaceholderText('Find'), { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
