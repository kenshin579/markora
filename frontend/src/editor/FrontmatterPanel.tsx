import React, { useEffect, useRef, useState } from 'react';

interface Props {
  value: string;                   // 펜스 안쪽 inner YAML
  onChange: (next: string) => void;
}

// BlockNote 바깥에서 frontmatter(inner YAML)를 raw 텍스트로 편집하는 접이식 패널.
// 상태는 부모(Editor)가 소유하는 컨트롤드 컴포넌트다.
export function FrontmatterPanel({ value, onChange }: Props) {
  const hasContent = value.trim() !== '';
  // 로드된 frontmatter는 접힌 채(▸)로 시작한다. 펼침/접힘은 전적으로 사용자가 제어.
  // (+ Add frontmatter로 새로 추가할 때는 토글 클릭 자체가 setOpen(true)를 태운다.)
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // 6-dot 메뉴: 바깥 클릭 / Esc 로 닫는다.
  const menuWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  // frontmatter가 비면 핸들/메뉴 자체가 사라지므로 열려있던 메뉴도 닫는다.
  useEffect(() => {
    if (!hasContent) setMenuOpen(false);
  }, [hasContent]);

  const handleDelete = () => {
    onChange('');        // 비우면 저장 시 frontmatter 블록이 통째로 삭제된다
    setMenuOpen(false);
  };

  return (
    <div className="markora-frontmatter" data-empty={!hasContent}>
      <div className="markora-frontmatter-header">
        {hasContent && (
          <div className="markora-frontmatter-menu-wrap" ref={menuWrapRef}>
            <button
              type="button"
              className="markora-frontmatter-handle"
              aria-label="Frontmatter 메뉴"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              ⠿
            </button>
            {menuOpen && (
              <div className="markora-frontmatter-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="markora-frontmatter-menu-item"
                  onClick={handleDelete}
                >
                  Frontmatter 삭제
                </button>
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          className="markora-frontmatter-toggle"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="markora-frontmatter-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
          <span>{hasContent ? 'Frontmatter' : '+ Add frontmatter'}</span>
        </button>
      </div>
      {open && (
        <textarea
          className="markora-frontmatter-input"
          value={value}
          spellCheck={false}
          autoFocus={!value}
          rows={Math.max(3, value.split('\n').length + 1)}
          placeholder={'title: ...\ntags: [...]'}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
