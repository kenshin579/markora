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

  it('내용이 있으면 6-dot 핸들이 렌더되고, 클릭하면 삭제 메뉴가 열린다', () => {
    render(<FrontmatterPanel value={'title: A'} onChange={() => {}} />);
    const handle = screen.getByRole('button', { name: 'Frontmatter 메뉴' });
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(handle);
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Frontmatter 삭제' })).toBeTruthy();
  });

  it('삭제 메뉴 항목 클릭 시 onChange("")가 호출되고 메뉴가 닫힌다', () => {
    const onChange = vi.fn();
    render(<FrontmatterPanel value={'title: A'} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Frontmatter 메뉴' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Frontmatter 삭제' }));
    expect(onChange).toHaveBeenCalledWith('');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('빈 값이면 6-dot 핸들이 렌더되지 않는다 (삭제할 frontmatter가 없음)', () => {
    render(<FrontmatterPanel value={''} onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Frontmatter 메뉴' })).toBeNull();
  });
});
