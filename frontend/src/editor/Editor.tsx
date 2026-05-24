import React, { useEffect, useRef, useState } from 'react';
import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote, SuggestionMenuController, getDefaultReactSlashMenuItems } from '@blocknote/react';
import '@blocknote/mantine/style.css';
import type { MarkoraBridge, Theme } from '../types';
import { schema } from './schema';
import { postParse, preSerialize, splitInlineMath } from '../markdown/customParse';
import { checkSaveSafety } from '../markdown/saveGuard';
import { reinitOnThemeChange } from '../blocks/MermaidBlock';
import { handleLineNavigationKeydown } from './lineNavigation';
import { SearchBar } from '../search/SearchBar';
import {
  createSearchPlugin,
  setSearch as pmSetSearch,
  gotoNext as pmGotoNext,
  gotoPrev as pmGotoPrev,
  clearSearch as pmClearSearch,
  type SearchSummary,
} from '../search/searchPlugin';
import type { MatchOptions } from '../search/findMatches';

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
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchSummary, setSearchSummary] = useState<SearchSummary>({ count: 0, current: 0 });
  const isDirtyRef = useRef(false);
  const lastKnownContentRef = useRef<string>('');
  const saveTimerRef = useRef<number | null>(null);
  const loadedRef = useRef(false);   // 초기 load 완료 여부 (load-induced onChange를 user edit과 구분)
  // 외부 변경 reload가 트리거하는 onChange를 user edit과 구분 (reload된 내용을 즉시 lossy 저장으로 되덮는 것 방지)
  const applyingRemoteRef = useRef(false);

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
      // 외부 변경 reload(replaceBlocks)가 트리거한 onChange도 user edit이 아니므로 무시.
      // (이게 없으면 reload 직후 1초 뒤 lossy 직렬화로 방금 불러온 외부 내용을 되덮어쓴다)
      if (applyingRemoteRef.current) return;
      isDirtyRef.current = true;
      setStatus('Modified');
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(async () => {
        try {
          setStatus('Saving...');
          const md = await editor.blocksToMarkdownLossy(preSerialize(editor.document as any) as any);
          // 저장 직전 디스크 현재 본문을 부작용 없이 읽어 외부 편집(터미널/다른 프로세스)을 확인한다.
          // 읽기에 실패하면 disk=undefined로 두어 기존 가드(2-인자)로만 검사한다.
          let disk: string | undefined;
          try { disk = await bridge.peekFile(); } catch { disk = undefined; }
          // 손실 가드: 직렬화 결과가 마지막 정상 내용/디스크 대비 frontmatter·대량 내용을
          // 잃었다면 파일을 덮어쓰지 않고 경고만 표시한다 (데이터 파괴/외부 편집 클로버 방지).
          const guard = checkSaveSafety(lastKnownContentRef.current, md, disk);
          if (!guard.safe) {
            console.warn('save blocked by guard:', guard.reason, { md });
            isDirtyRef.current = true; // 미저장 상태 유지
            setStatus(`⚠ Save blocked: ${guard.reason}`);
            return;
          }
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

  // 외부 변경 reload 핸들러: JCEF 'focus' 이벤트(불안정)와 Kotlin이 IDE 활성화/VFS 변경 시
  // 호출하는 bridge.onReloadRequest 양쪽에 바인딩한다.
  useEffect(() => {
    const reload = async () => {
      if (isDirtyRef.current) return;
      try {
        const md = await bridge.loadFile();
        if (md === lastKnownContentRef.current) return;
        // reload가 트리거하는 onChange를 user edit으로 오인해 되저장하지 않도록 억제.
        // (loadedRef와 동일한 패턴: replaceBlocks 동안 플래그 on, 다음 tick에 off)
        applyingRemoteRef.current = true;
        const blocks = await editor.tryParseMarkdownToBlocks(md);
        editor.replaceBlocks(editor.document, postParse(blocks as any) as any);
        lastKnownContentRef.current = md;
        isDirtyRef.current = false;
        window.setTimeout(() => { applyingRemoteRef.current = false; }, 0);
      } catch { applyingRemoteRef.current = false; /* 무시 */ }
    };
    window.addEventListener('focus', reload);
    const unsub = bridge.onReloadRequest(reload);
    return () => {
      window.removeEventListener('focus', reload);
      unsub();
    };
  }, [bridge, editor]);

  // macOS Cmd+←/→ 줄 처음/끝 이동, Shift+Cmd+←/→ 줄 단위 선택.
  // JCEF에서 막히는 동작이라 직접 잡아 네이티브 Selection.modify로 처리한다.
  useEffect(() => {
    const target: HTMLElement =
      editor.domElement ?? document.querySelector<HTMLElement>('.markora-shell') ?? document.body;
    const onKeyDown = (e: KeyboardEvent) => {
      if (handleLineNavigationKeydown(e, window.getSelection())) {
        e.stopPropagation();
      }
    };
    target.addEventListener('keydown', onKeyDown, true);
    return () => target.removeEventListener('keydown', onKeyDown, true);
  }, [editor]);

  // 검색 플러그인을 ProseMirror view에 한 번 등록 (데코레이션 전용 — 문서 변경 없음).
  useEffect(() => {
    const view = editor.prosemirrorView;
    if (!view) return;
    const plugin = createSearchPlugin(setSearchSummary);
    view.updateState(
      view.state.reconfigure({ plugins: [...view.state.plugins, plugin] }),
    );
    // 언마운트 시 플러그인 제거.
    return () => {
      const v = editor.prosemirrorView;
      if (!v) return;
      v.updateState(
        v.state.reconfigure({ plugins: v.state.plugins.filter((p) => p !== plugin) }),
      );
    };
  }, [editor]);

  // Cmd/Ctrl+F 로 검색 바 열기 (열려 있으면 SearchBar 자체가 입력 포커스를 처리).
  useEffect(() => {
    const target: HTMLElement =
      editor.domElement ?? document.querySelector<HTMLElement>('.markora-shell') ?? document.body;
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.altKey && !e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        e.stopPropagation();
        setSearchOpen(true);
      }
    };
    target.addEventListener('keydown', onKeyDown, true);
    return () => target.removeEventListener('keydown', onKeyDown, true);
  }, [editor]);

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

  const handleSearch = (query: string, options: MatchOptions) => {
    const view = editor.prosemirrorView;
    if (view) pmSetSearch(view, query, options);
  };
  const handleNext = () => {
    const view = editor.prosemirrorView;
    if (view) pmGotoNext(view);
  };
  const handlePrev = () => {
    const view = editor.prosemirrorView;
    if (view) pmGotoPrev(view);
  };
  const handleCloseSearch = () => {
    const view = editor.prosemirrorView;
    if (view) pmClearSearch(view);
    setSearchOpen(false);
    editor.prosemirrorView?.focus();
  };

  return (
    <div className="markora-shell">
      {searchOpen && (
        <SearchBar
          summary={searchSummary}
          onSearch={handleSearch}
          onNext={handleNext}
          onPrev={handlePrev}
          onClose={handleCloseSearch}
        />
      )}
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
