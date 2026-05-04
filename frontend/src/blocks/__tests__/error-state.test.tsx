import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBox } from '../ErrorBox';

describe('ErrorBox', () => {
  it('kind/message가 화면에 표시됨', () => {
    render(<ErrorBox kind="LaTeX" message="Undefined control sequence" onEdit={() => {}} onConvertToCode={() => {}} />);
    expect(screen.getByText(/LaTeX 파싱 에러/)).toBeInTheDocument();
    expect(screen.getByText(/Undefined control sequence/)).toBeInTheDocument();
  });

  it('Edit 버튼 클릭 시 onEdit 콜백', () => {
    const onEdit = vi.fn();
    render(<ErrorBox kind="Mermaid" message="x" onEdit={onEdit} onConvertToCode={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
    expect(onEdit).toHaveBeenCalled();
  });

  it('↓ Plain 클릭 시 onConvertToCode 콜백', () => {
    const onConvert = vi.fn();
    render(<ErrorBox kind="LaTeX" message="x" onEdit={() => {}} onConvertToCode={onConvert} />);
    fireEvent.click(screen.getByRole('button', { name: /Plain/ }));
    expect(onConvert).toHaveBeenCalled();
  });
});
