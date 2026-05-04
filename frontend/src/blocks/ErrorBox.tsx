import React from 'react';

interface Props {
  kind: 'LaTeX' | 'Mermaid';
  message: string;
  onEdit: () => void;
  onConvertToCode: () => void;
}

export function ErrorBox({ kind, message, onEdit, onConvertToCode }: Props) {
  return (
    <div className="markora-error-box" role="alert">
      <div className="markora-error-title">⚠ {kind} 파싱 에러</div>
      <pre className="markora-error-message">{message}</pre>
      <div className="markora-error-hint">
        코드를 수정하거나 일반 코드블록으로 변환하세요.
      </div>
      <div className="markora-error-actions">
        <button onClick={onEdit}>Edit</button>
        <button onClick={onConvertToCode}>↓ Plain</button>
      </div>
    </div>
  );
}
