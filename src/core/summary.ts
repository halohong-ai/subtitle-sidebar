// summary.json 与导图 spec 的校验和解析，规则与 bilingual-srt-translator skill 一致。

import { parseTimestamp } from './time';
import type { Mindmap, MindmapBranch, SummaryItem } from './types';

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

/** 解析导图 spec：{ title, center, branches: [{ title, icon, time, points }] } */
export function parseMindmap(data: unknown): Mindmap {
  const d = data as Record<string, unknown> | null;
  const branches = d?.branches;
  if (!d || !Array.isArray(branches) || branches.length === 0) {
    throw new FormatError('导图格式不对：需要 branches 数组，且至少有一个分支');
  }
  const center = str(d.center) || str(d.title);
  if (!center) throw new FormatError('导图缺少 center（中心主题）');
  return {
    title: str(d.title) || center.replace(/\n/g, ''),
    subtitle: str(d.subtitle) || undefined,
    center: center.replace(/\\n/g, '\n'),
    centerIcon: str(d.center_icon) || undefined,
    branches: branches.map((raw, i): MindmapBranch => {
      const b = raw as Record<string, unknown>;
      const title = str(b.title);
      if (!title) throw new FormatError(`导图第 ${i + 1} 个分支缺少 title`);
      const time = str(b.time) ? parseTimestamp(str(b.time)) : null;
      const points = Array.isArray(b.points) ? b.points.map(str).filter(Boolean) : [];
      return { title: title.replace(/\\n/g, '\n'), icon: str(b.icon) || undefined, time, points };
    }),
  };
}
