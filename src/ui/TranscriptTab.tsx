import { memo } from 'preact/compat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { formatClock } from '../core/time';
import type { Cue } from '../core/types';
import { loopSentence, seek, watchPlayback } from '../content/sync';
import type { LangMode } from '../storage';

interface Props {
  cues: Cue[];
  mode: LangMode;
  getVideo: () => HTMLVideoElement | null;
  /** 已收藏句子的开始时间 */
  notedStarts: Set<number>;
  onToggleNote: (cue: Cue) => void;
}

export function TranscriptTab({ cues, mode, getVideo, notedStarts, onToggleNote }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);
  const [follow, setFollow] = useState(true);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [looping, setLooping] = useState(false);
  const [loopIdx, setLoopIdx] = useState(-1);
  const activeRef = useRef(active);
  activeRef.current = active;

  // 跟随播放进度
  useEffect(() => {
    const video = getVideo();
    if (!video) return;
    return watchPlayback(video, cues.map((c) => c.start), setActive);
  }, [cues, getVideo]);

  const scrollToRow = useCallback((i: number, smooth: boolean) => {
    const list = listRef.current;
    const row = list?.children[i] as HTMLElement | undefined;
    if (!list || !row) return;
    list.scrollTo({
      top: row.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  const firstScroll = useRef(true);
  useEffect(() => {
    if (!follow || active < 0) return;
    scrollToRow(active, !firstScroll.current);
    firstScroll.current = false;
  }, [active, follow, scrollToRow]);

  const onSeek = useCallback(
    (cue: Cue) => {
      const video = getVideo();
      if (video) seek(video, cue.start);
      setFollow(true);
    },
    [getVideo],
  );

  // 单句循环
  useEffect(() => {
    const video = getVideo();
    if (!looping || !video) {
      setLoopIdx(-1);
      return;
    }
    return loopSentence(video, cues, Math.max(activeRef.current, 0), setLoopIdx);
  }, [looping, cues, getVideo]);

  const step = useCallback(
    (delta: number) => {
      const i = Math.min(cues.length - 1, Math.max(0, activeRef.current + delta));
      if (cues[i]) onSeek(cues[i]);
    },
    [cues, onSeek],
  );

  // 快捷键：[ 上一句，] 下一句，\ 开关单句循环。在输入框里打字时不响应。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const el = e.composedPath()[0] as HTMLElement | undefined;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const action =
        e.code === 'BracketLeft' ? () => step(-1)
        : e.code === 'BracketRight' ? () => step(1)
        : e.code === 'Backslash' ? () => setLooping((v) => !v)
        : null;
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      action();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [step]);

  // 用户手动滚动字幕列表时，暂停自动跟随。
  const stopFollow = () => setFollow(false);
  const onListPointerDown = (e: PointerEvent) => {
    if (e.target === listRef.current) stopFollow(); // 拖动滚动条
  };

  // 搜索
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return [];
    const out: number[] = [];
    cues.forEach((c, i) => {
      if (c.text.toLowerCase().includes(q) || c.trans?.toLowerCase().includes(q)) out.push(i);
    });
    return out;
  }, [cues, q]);

  const goToMatch = (n: number) => {
    if (!matches.length) return;
    const k = (n + matches.length) % matches.length;
    setCursor(k);
    setFollow(false);
    scrollToRow(matches[k], true);
  };

  const onSearchInput = (value: string) => {
    setQuery(value);
    setCursor(0);
  };

  useEffect(() => {
    if (matches.length) {
      setFollow(false);
      scrollToRow(matches[0], true);
    }
  }, [matches, scrollToRow]);

  const onSearchKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') goToMatch(cursor + (e.shiftKey ? -1 : 1));
    else if (e.key === 'Escape') onSearchInput('');
  };

  const matchSet = useMemo(() => new Set(matches), [matches]);
  const current = matches.length ? matches[cursor] : -1;

  return (
    <div class="transcript">
      <div class="search">
        <div class="player-controls" role="group" aria-label="逐句控制">
          <button type="button" title="上一句（[）" aria-label="上一句" onClick={() => step(-1)}>
            ‹
          </button>
          <button
            type="button"
            class={looping ? 'on' : ''}
            title={'单句循环（\\）'}
            aria-label="单句循环"
            aria-pressed={looping}
            onClick={() => setLooping((v) => !v)}
          >
            ⟲
          </button>
          <button type="button" title="下一句（]）" aria-label="下一句" onClick={() => step(1)}>
            ›
          </button>
        </div>
        <input
          type="search"
          placeholder="搜索字幕"
          value={query}
          onInput={(e) => onSearchInput(e.currentTarget.value)}
          onKeyDown={onSearchKey}
        />
        {q && (
          <span class="search-count">
            {matches.length ? `${cursor + 1}/${matches.length}` : '0'}
          </span>
        )}
        {matches.length > 1 && (
          <>
            <button type="button" title="上一个（Shift+Enter）" onClick={() => goToMatch(cursor - 1)}>
              ↑
            </button>
            <button type="button" title="下一个（Enter）" onClick={() => goToMatch(cursor + 1)}>
              ↓
            </button>
          </>
        )}
      </div>

      <div
        class="list"
        ref={listRef}
        onWheel={stopFollow}
        onTouchMove={stopFollow}
        onPointerDown={onListPointerDown}
      >
        {cues.map((cue, i) => (
          <Row
            key={cue.id}
            cue={cue}
            active={i === active}
            current={i === current}
            looping={i === loopIdx}
            noted={notedStarts.has(cue.start)}
            onToggleNote={onToggleNote}
            mode={mode}
            query={matchSet.has(i) ? q : ''}
            onSeek={onSeek}
          />
        ))}
      </div>

      {!follow && (
        <button type="button" class="follow" onClick={() => setFollow(true)}>
          回到当前
        </button>
      )}
    </div>
  );
}

interface RowProps {
  cue: Cue;
  active: boolean;
  current: boolean;
  looping: boolean;
  noted: boolean;
  onToggleNote: (cue: Cue) => void;
  mode: LangMode;
  query: string;
  onSeek: (cue: Cue) => void;
}

const Row = memo(function Row({
  cue, active, current, looping, noted, onToggleNote, mode, query, onSeek,
}: RowProps) {
  const showOrig = mode !== 'trans' || !cue.trans;
  const showTrans = mode !== 'orig' && !!cue.trans;
  const cls = ['row', active && 'active', current && 'current', looping && 'looping']
    .filter(Boolean)
    .join(' ');
  return (
    <div class={cls} onClick={() => onSeek(cue)}>
      <span class="time">
        {formatClock(cue.start)}
        {looping && <span class="loop-mark" title="正在循环这一句">⟲</span>}
      </span>
      <div class="lines">
        {showOrig && <p class="orig">{highlight(cue.text, query)}</p>}
        {showTrans && <p class="trans">{highlight(cue.trans!, query)}</p>}
      </div>
      <button
        type="button"
        class={`star${noted ? ' on' : ''}`}
        title={noted ? '取消收藏' : '收藏到笔记'}
        aria-label={noted ? '取消收藏' : '收藏到笔记'}
        aria-pressed={noted}
        onClick={(e) => {
          e.stopPropagation();
          onToggleNote(cue);
        }}
      >
        {noted ? '★' : '☆'}
      </button>
    </div>
  );
});

function highlight(text: string, q: string) {
  if (!q) return text;
  const lower = text.toLowerCase();
  const parts: Array<string | preact.JSX.Element> = [];
  let from = 0;
  let at = lower.indexOf(q);
  while (at !== -1) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(<mark key={at}>{text.slice(at, at + q.length)}</mark>);
    from = at + q.length;
    at = lower.indexOf(q, from);
  }
  parts.push(text.slice(from));
  return parts;
}
