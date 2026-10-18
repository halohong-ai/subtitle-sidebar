// summary.json 的校验和解析，规则与 bilingual-srt-translator skill 一致。

import { parseTimestamp } from './time';
import type { SummaryItem } from './types';

export class FormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormatError';
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * 解析 summary.json：{ items: [{ start, title, summary }] }。
 * start 须严格递增；给了视频时长时，不能超出时长。
 */
export function parseSummary(data: unknown, durationMs = 0): SummaryItem[] {
  const items = (data as { items?: unknown } | null)?.items;
  if (!Array.isArray(items) || items.length === 0) {
    throw new FormatError('摘要格式不对：需要 {"items": [...]}，且至少有一项');
  }
  let last = -1;
  return items.map((raw, i) => {
    const it = raw as Record<string, unknown>;
    const start = parseTimestamp(str(it.start));
    const n = i + 1;
    if (start === null) throw new FormatError(`摘要第 ${n} 项的 start 时间格式不对：${String(it.start)}`);
    if (start <= last) throw new FormatError(`摘要第 ${n} 项的时间没有按先后顺序排列`);
    if (durationMs && start > durationMs) throw new FormatError(`摘要第 ${n} 项的时间超出了视频时长`);
    const title = str(it.title);
    if (!title) throw new FormatError(`摘要第 ${n} 项缺少 title`);
    last = start;
    return { start, title, summary: str(it.summary) };
  });
}
