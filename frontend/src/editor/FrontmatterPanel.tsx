import React, { useEffect, useRef, useState } from 'react';

interface Props {
  value: string;                   // 펜스 안쪽 inner YAML
  onChange: (next: string) => void;
}

// BlockNote 바깥에서 frontmatter(inner YAML)를 raw 텍스트로 편집하는 접이식 패널.
// 상태는 부모(Editor)가 소유하는 컨트롤드 컴포넌트다.
export function FrontmatterPanel({ value, onChange }: Props) {
  const hasContent = value.trim() !== '';
  const [open, setOpen] = useState(false);
  // 파일 로드로 frontmatter가 처음 들어오면 한 번 펼친다. 이후엔 사용자가 토글을 제어.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current && value.trim() !== '') {
      setOpen(true);
      initializedRef.current = true;
    }
  }, [value]);

  return (
    <div className="markora-frontmatter" data-empty={!hasContent}>
      <button
        type="button"
        className="markora-frontmatter-header"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="markora-frontmatter-caret">{open ? '▾' : '▸'}</span>
        <span>{hasContent ? 'Frontmatter' : '+ Add frontmatter'}</span>
      </button>
      {open && (
        <textarea
          className="markora-frontmatter-input"
          value={value}
          spellCheck={false}
          rows={Math.max(3, value.split('\n').length + 1)}
          placeholder={'title: ...\ntags: [...]'}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
