import { useEffect, useRef, useState } from 'preact/hooks';
import { formatClock } from '../core/time';
import type { SummaryItem } from '../core/types';
import { seek, watchPlayback } from '../content/sync';

interface Props {
  items?: SummaryItem[];
  getVideo: () => HTMLVideoElement | null;
}

/** 按话题分段的摘要：当前话题高亮，点击跳到该话题开头。 */
export function SummaryTab({ items, getVideo }: Props) {
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
      {items.map((item, i) => (
        <button
          key={item.start}
          type="button"
          class={`summary-item${i === active ? ' active' : ''}`}
          onClick={() => {
            const video = getVideo();
            if (video) seek(video, item.start);
            userScrolledAt.current = 0;
          }}
        >
          <span class="time">{formatClock(item.start)}</span>
          <span class="summary-body">
            <strong>{item.title}</strong>
            {item.summary && <span>{item.summary}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
