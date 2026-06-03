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
