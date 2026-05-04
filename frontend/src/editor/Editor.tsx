import React, { useEffect, useRef, useState } from 'react';
import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import '@blocknote/mantine/style.css';
import type { MarkoraBridge, Theme } from '../types';
import { schema } from './schema';
import { postParse, preSerialize } from '../markdown/customParse';

interface Props {
  bridge: MarkoraBridge;
}

export function Editor({ bridge }: Props) {
  const editor = useCreateBlockNote({ schema });
  const [theme, setTheme] = useState<Theme>(bridge.getContext().initialTheme);
  const [status, setStatus] = useState<string>('Ready');
  const isDirtyRef = useRef(false);
  const lastKnownContentRef = useRef<string>('');
  const saveTimerRef = useRef<number | null>(null);

  // 초기 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const md = await bridge.loadFile();
        if (cancelled) return;
        const blocks = await editor.tryParseMarkdownToBlocks(md);
        editor.replaceBlocks(editor.document, postParse(blocks as any) as any);
        lastKnownContentRef.current = md;
        isDirtyRef.current = false;
        setStatus('Ready');
      } catch (e) {
        console.error(e);
        setStatus('Load failed');
      }
    })();
    return () => { cancelled = true; };
  }, [bridge, editor]);

  // onChange → 디바운스 저장
  useEffect(() => {
    return editor.onChange(() => {
      isDirtyRef.current = true;
      setStatus('Modified');
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(async () => {
        try {
          setStatus('Saving...');
          const md = await editor.blocksToMarkdownLossy(preSerialize(editor.document as any) as any);
          await bridge.saveFile(md);
          lastKnownContentRef.current = md;
          isDirtyRef.current = false;
          setStatus('Saved');
          window.setTimeout(() => {
            if (!isDirtyRef.current) setStatus('Ready');
          }, 2000);
        } catch (e) {
          console.error(e);
          setStatus('Save failed (kept previous)');
        }
      }, 1000);
    });
  }, [editor, bridge]);

  // 외부 변경 감지 (focus)
  useEffect(() => {
    const handler = async () => {
      if (isDirtyRef.current) return;
      try {
        const md = await bridge.loadFile();
        if (md === lastKnownContentRef.current) return;
        const blocks = await editor.tryParseMarkdownToBlocks(md);
        editor.replaceBlocks(editor.document, postParse(blocks as any) as any);
        lastKnownContentRef.current = md;
      } catch { /* 무시 */ }
    };
    window.addEventListener('focus', handler);
    return () => window.removeEventListener('focus', handler);
  }, [bridge, editor]);

  // 테마 동기화
  useEffect(() => {
    return bridge.onThemeChange((t) => setTheme(t));
  }, [bridge]);

  return (
    <div className="markora-shell">
      <BlockNoteView editor={editor} theme={theme} />
      <div className="markora-status" data-status={status}>{status}</div>
    </div>
  );
}
