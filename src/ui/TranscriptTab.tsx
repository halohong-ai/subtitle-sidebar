import { memo } from 'preact/compat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { formatClock } from '../core/time';
import type { Cue } from '../core/types';
import { seek, watchPlayback } from '../content/sync';
import type { LangMode } from '../storage';

interface Props {
  cues: Cue[];
  mode: LangMode;
  fontSize: number;
  getVideo: () => HTMLVideoElement | null;
}

export function TranscriptTab({ cues, mode, fontSize, getVideo }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);
  const [follow, setFollow] = useState(true);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

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
    <div class="transcript" style={{ '--fs': `${fontSize}px` }}>
      <div class="search">
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
  mode: LangMode;
  query: string;
  onSeek: (cue: Cue) => void;
}

const Row = memo(function Row({ cue, active, current, mode, query, onSeek }: RowProps) {
  const showOrig = mode !== 'trans' || !cue.trans;
  const showTrans = mode !== 'orig' && !!cue.trans;
  const cls = ['row', active && 'active', current && 'current'].filter(Boolean).join(' ');
  return (
    <div class={cls} onClick={() => onSeek(cue)}>
      <span class="time">{formatClock(cue.start)}</span>
      <div class="lines">
        {showOrig && <p class="orig">{highlight(cue.text, query)}</p>}
        {showTrans && <p class="trans">{highlight(cue.trans!, query)}</p>}
      </div>
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
