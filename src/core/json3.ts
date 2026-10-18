import type { Fragment } from './types';

interface Json3Seg {
  utf8?: string;
  tOffsetMs?: number;
}

interface Json3Event {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Json3Seg[];
}

export interface Json3 {
  events?: Json3Event[];
}

/** 自动字幕里一个词的最长持续时间，用来识别说话停顿。 */
const WORD_MAX_MS = 500;

/**
 * 解析 YouTube timedtext 的 json3 格式。
 * 自动字幕的事件带逐词偏移（tOffsetMs），拆成一个词一个片段；
 * 人工字幕一个事件就是一行，整行作为一个片段。
 */
export function parseJson3(data: Json3): Fragment[] {
  const out: Fragment[] = [];
  const wordIdx: number[] = [];
  const wordEventEnd: number[] = [];

  for (const ev of data.events ?? []) {
    if (!ev.segs?.length) continue;
    const t0 = ev.tStartMs ?? 0;
    const evEnd = t0 + (ev.dDurationMs ?? 0);
    const wordLevel = ev.segs.some((s) => s.tOffsetMs !== undefined);

    if (wordLevel) {
      for (const seg of ev.segs) {
        const text = clean(seg.utf8);
        if (!text) continue;
        wordIdx.push(out.length);
        wordEventEnd.push(evEnd);
        out.push({ start: t0 + (seg.tOffsetMs ?? 0), end: evEnd, text });
      }
    } else {
      const text = clean(ev.segs.map((s) => s.utf8 ?? '').join(''));
      if (text) out.push({ start: t0, end: evEnd, text });
    }
  }

  // 逐词片段没有结束时间，用「下一个词的开始」和上限推算。
  for (let k = 0; k < wordIdx.length; k++) {
    const f = out[wordIdx[k]];
    const next = k + 1 < wordIdx.length ? out[wordIdx[k + 1]].start : Infinity;
    f.end = Math.max(f.start, Math.min(next, f.start + WORD_MAX_MS, wordEventEnd[k]));
  }

  out.sort((a, b) => a.start - b.start);
  return out;
}

function clean(s: string | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}
