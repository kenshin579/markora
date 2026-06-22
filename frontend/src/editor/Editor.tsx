import React, { useEffect, useRef, useState } from 'react';
import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote, SuggestionMenuController, getDefaultReactSlashMenuItems } from '@blocknote/react';
import '@blocknote/mantine/style.css';
import type { MarkoraBridge, Theme } from '../types';
import { schema } from './schema';
import { postParse, preSerialize, splitInlineMath, escapeSingleTildes, unescapeSingleTildes } from '../markdown/customParse';
import { reinitOnThemeChange } from '../blocks/MermaidBlock';

interface Props {
  bridge: MarkoraBridge;
}

const INLINE_MATH_BLOCK_TYPES = new Set([
  'paragraph', 'heading', 'bulletListItem', 'numberedListItem', 'checkListItem', 'quote',
]);

export function Editor({ bridge }: Props) {
  const editor = useCreateBlockNote({
    schema,
    uploadFile: async (file: File) => {
      const { url } = await bridge.uploadImage(file);
      return url;
    },
  });
  const [theme, setTheme] = useState<Theme>(bridge.getContext().initialTheme);
  const [status, setStatus] = useState<string>('Ready');
  const isDirtyRef = useRef(false);
  const lastKnownContentRef = useRef<string>('');
  const saveTimerRef = useRef<number | null>(null);
  const loadedRef = useRef(false);   // 초기 load 완료 여부 (load-induced onChange를 user edit과 구분)

  // 초기 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const md = await bridge.loadFile();
        if (cancelled) return;
        const blocks = await editor.tryParseMarkdownToBlocks(escapeSingleTildes(md));
        editor.replaceBlocks(editor.document, postParse(blocks as any) as any);
        lastKnownContentRef.current = md;
        isDirtyRef.current = false;
        // replaceBlocks가 트리거한 onChange는 user edit이 아님 — 다음 tick 이후로 onChange를 user edit으로 인정
        window.setTimeout(() => { loadedRef.current = true; }, 0);
        setStatus('Ready');
      } catch (e) {
        console.error('loadFile failed:', e);
        const msg = e instanceof Error ? e.message : String(e);
        setStatus(`Load failed: ${msg.substring(0, 80)}`);
      }
    })();
    return () => { cancelled = true; };
  }, [bridge, editor]);

  // onChange → 디바운스 저장
  useEffect(() => {
    return editor.onChange(() => {
      // 초기 load가 트리거한 onChange는 무시 (user edit만 dirty 처리)
      if (!loadedRef.current) return;
      isDirtyRef.current = true;
      setStatus('Modified');
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(async () => {
        try {
          setStatus('Saving...');
          const md = unescapeSingleTildes(
            await editor.blocksToMarkdownLossy(preSerialize(editor.document as any) as any)
          );
          await bridge.saveFile(md);
          lastKnownContentRef.current = md;
          isDirtyRef.current = false;
          setStatus('Saved');
          window.setTimeout(() => {
            if (!isDirtyRef.current) setStatus('Ready');
          }, 2000);
        } catch (e) {
          console.error('saveFile failed:', e);
          const msg = e instanceof Error ? e.message : String(e);
          setStatus(`Save failed: ${msg.substring(0, 80)}`);
        }
      }, 1000);
    });
  }, [editor, bridge]);

  // 인라인 수식 자동 변환: 사용자가 블록을 떠날 때 직전 블록의 텍스트에서 $...$ 패턴을 인라인 KaTeX 노드로 split
  useEffect(() => {
    let lastBlockId: string | null = null;
    return editor.onSelectionChange(() => {
      try {
        const currentBlockId = editor.getTextCursorPosition().block?.id ?? null;
        if (lastBlockId !== null && lastBlockId !== currentBlockId) {
          const prevBlock = editor.getBlock(lastBlockId);
          if (prevBlock && INLINE_MATH_BLOCK_TYPES.has(prevBlock.type) && Array.isArray(prevBlock.content)) {
            const hasDollarText = (prevBlock.content as any[]).some(
              (n) => n?.type === 'text' && typeof n.text === 'string' && n.text.includes('$')
            );
            if (hasDollarText) {
              const splitContent = splitInlineMath(prevBlock.content as any);
              const before = JSON.stringify(prevBlock.content);
              const after = JSON.stringify(splitContent);
              if (before !== after) {
                editor.updateBlock(prevBlock, { content: splitContent } as any);
              }
            }
          }
        }
        lastBlockId = currentBlockId;
      } catch (e) {
        console.error('inline math split failed:', e);
      }
    });
  }, [editor]);

  // 외부 변경 감지 (focus)
  useEffect(() => {
    const handler = async () => {
      if (isDirtyRef.current) return;
      try {
        const md = await bridge.loadFile();
        if (md === lastKnownContentRef.current) return;
        const blocks = await editor.tryParseMarkdownToBlocks(escapeSingleTildes(md));
        editor.replaceBlocks(editor.document, postParse(blocks as any) as any);
        lastKnownContentRef.current = md;
      } catch { /* 무시 */ }
    };
    window.addEventListener('focus', handler);
    return () => window.removeEventListener('focus', handler);
  }, [bridge, editor]);

  // 테마 동기화
  useEffect(() => {
    return bridge.onThemeChange((t) => {
      setTheme(t);
      reinitOnThemeChange(t);
    });
  }, [bridge]);

  // 마운트 시 initialTheme 즉시 반영
  useEffect(() => {
    reinitOnThemeChange(bridge.getContext().initialTheme);
  }, [bridge]);

  return (
    <div className="markora-shell">
      <BlockNoteView editor={editor} theme={theme} slashMenu={false}>
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) => {
            const defaults = getDefaultReactSlashMenuItems(editor as any);
            const customs = [
              {
                title: 'Math (block)',
                aliases: ['math', 'latex', 'equation', '수식'],
                group: 'Advanced',
                onItemClick: () => {
                  editor.insertBlocks([{ type: 'katex', props: { source: '' } } as any], editor.getTextCursorPosition().block, 'after');
                },
              },
              {
                title: 'Math (inline)',
                aliases: ['equation', 'inline', '인라인'],
                group: 'Advanced',
                onItemClick: () => {
                  editor.insertInlineContent([{ type: 'katexInline', props: { source: 'x' } } as any]);
                },
              },
              {
                title: 'Mermaid',
                aliases: ['mermaid', 'diagram', 'flowchart', '다이어그램'],
                group: 'Advanced',
                onItemClick: () => {
                  editor.insertBlocks(
                    [{ type: 'mermaid', props: { source: '' } } as any],
                    editor.getTextCursorPosition().block,
                    'after'
                  );
                },
              },
            ];
            const all = [...defaults, ...customs];
            const q = query.toLowerCase();
            return all.filter(it =>
              it.title.toLowerCase().includes(q) ||
              (it as any).aliases?.some((a: string) => a.toLowerCase().includes(q))
            );
          }}
        />
      </BlockNoteView>
      <div className="markora-status" data-status={status}>{status}</div>
    </div>
  );
}
