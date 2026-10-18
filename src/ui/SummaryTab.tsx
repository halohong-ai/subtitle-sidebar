import { useEffect, useRef, useState } from 'preact/hooks';
import { formatClock } from '../core/time';
import type { SummaryItem } from '../core/types';
import { seek, watchPlayback } from '../content/sync';

interface Props {
  items?: SummaryItem[];
  getVideo: () => HTMLVideoElement | null;
  /** 已收藏到笔记的话题的开始时间 */
  notedStarts: Set<number>;
  onToggleNote: (item: SummaryItem) => void;
}

/** 按话题分段的摘要：当前话题高亮，点击跳到该话题开头，可收藏到笔记。 */
export function SummaryTab({ items, getVideo, notedStarts, onToggleNote }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);
  // 用户最近手动滚动过，就暂不自动滚动
  const userScrolledAt = useRef(0);

  useEffect(() => {
    const video = getVideo();
    if (!video || !items?.length) return;
    return watchPlayback(video, items.map((x) => x.start), setActive);
  }, [items, getVideo]);

  useEffect(() => {
    const list = listRef.current;
    const row = list?.children[active] as HTMLElement | undefined;
    if (!list || !row || Date.now() - userScrolledAt.current < 5000) return;
    list.scrollTo({ top: row.offsetTop - 12, behavior: 'smooth' });
  }, [active]);

  if (!items?.length) {
    return (
      <div class="empty">
        <p>还没有摘要。</p>
        <p>
          点右上角 ⋯ →「复制 AI 提示词」，粘贴到任意 AI；等它回复后，点 ⋯ →「导入」，把回复粘贴进去。
          也可以导入 bilingual-srt-translator 生成的 summary.json。
        </p>
      </div>
    );
  }

  return (
    <div
      class="summary list"
      ref={listRef}
      onWheel={() => (userScrolledAt.current = Date.now())}
      onTouchMove={() => (userScrolledAt.current = Date.now())}
    >
      {items.map((item, i) => {
        const jump = () => {
          const video = getVideo();
          if (video) seek(video, item.start);
          userScrolledAt.current = 0;
        };
        const noted = notedStarts.has(item.start);
        return (
          <div
            key={item.start}
            role="button"
            tabIndex={0}
            class={`summary-item row${i === active ? ' active' : ''}`}
            onClick={jump}
            onKeyDown={(e) => e.key === 'Enter' && jump()}
          >
            <span class="time">{formatClock(item.start)}</span>
            <span class="summary-body">
              <strong>{item.title}</strong>
              {item.summary && <span>{item.summary}</span>}
            </span>
            <button
              type="button"
              class={`star${noted ? ' on' : ''}`}
              title={noted ? '取消收藏' : '收藏到笔记'}
              aria-label={noted ? '取消收藏' : '收藏到笔记'}
              aria-pressed={noted}
              onClick={(e) => {
                e.stopPropagation();
                onToggleNote(item);
              }}
            >
              {noted ? '★' : '☆'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
