import { cleanText } from './text';
import { formatClock, formatSrtTime, parseTimestamp } from './time';
import type { Cue } from './types';

const CJK = /[㐀-鿿豈-﫿]/g;

function isCjkLine(line: string): boolean {
  const n = line.match(CJK)?.length ?? 0;
  return n > 0 && n >= line.replace(/\s/g, '').length / 3;
}

export interface ParsedSrt {
  cues: Cue[];
  /** 原文是否为中文（每条只有中文行时） */
  origIsCjk: boolean;
  hasTrans: boolean;
}

/**
 * 解析 SRT。双语 SRT（skill 的格式：原文行在前、中文行在后）按行的语言拆成原文和译文；
 * 全是中文的单语 SRT，中文作为原文。
 */
export function parseSrt(text: string): ParsedSrt {
  const blocks = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/);
  const raw: Array<{ start: number; end: number; orig: string[]; cjk: string[] }> = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim());
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at === -1) continue;
    const [a, b] = lines[at].split('-->').map((x) => x.trim().split(/\s+/)[0]);
    const start = parseTimestamp(a);
    const end = parseTimestamp(b);
    if (start === null || end === null) continue;
    const body = lines.slice(at + 1).map(cleanText).filter(Boolean);
    if (body.length === 0) continue;
    raw.push({
      start,
      end,
      orig: body.filter((l) => !isCjkLine(l)),
      cjk: body.filter(isCjkLine),
    });
  }

  raw.sort((x, y) => x.start - y.start);
  const origIsCjk = raw.length > 0 && raw.every((r) => r.orig.length === 0);
  const cues: Cue[] = raw.map((r, i) => {
    const text = origIsCjk ? r.cjk.join(' ') : r.orig.join(' ');
    const trans = origIsCjk ? '' : r.cjk.join('');
    return { id: i + 1, start: r.start, end: r.end, text, ...(trans ? { trans } : {}) };
  });
  return { cues, origIsCjk, hasTrans: cues.some((c) => c.trans) };
}

/** 导出 SRT：每条先原文、后译文（与 skill 的双语 SRT 格式一致）。 */
export function toSrt(cues: Cue[]): string {
  return (
    cues
      .map((c, i) => {
        const lines = [c.text, c.trans].filter(Boolean).join('\n');
        return `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${lines}`;
      })
      .join('\n\n') + '\n'
  );
}

/** 导出纯文本：每句一段，带时间。 */
export function toTxt(cues: Cue[]): string {
  return (
    cues
      .map((c) => [`[${formatClock(c.start)}] ${c.text}`, c.trans].filter(Boolean).join('\n'))
      .join('\n\n') + '\n'
  );
}
