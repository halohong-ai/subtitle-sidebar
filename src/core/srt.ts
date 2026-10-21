import { cleanText } from './text';
import { formatSrtTime, parseTimestamp } from './time';
import type { Cue } from './types';

const CJK = /[㐀-鿿豈-﫿]/g;

const LATIN_WORD = /[A-Za-zÀ-ɏ]+(?:['’][A-Za-z]+)?/g;

/** 汉字数不少于外文单词数就算中文行：「我们投资了 Black Forest Labs」是中文，夹一两个汉字的英文句不是。 */
function isCjkLine(line: string): boolean {
  const n = line.match(CJK)?.length ?? 0;
  return n > 0 && n >= (line.match(LATIN_WORD)?.length ?? 0);
}

/** 绝大多数条目只有中文行时，整份按纯中文处理，个别认不准的行也算中文。 */
const CJK_ONLY_RATIO = 0.9;

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
  const raw: Array<{ start: number; end: number; body: string[]; orig: string[]; cjk: string[] }> = [];

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
      body,
      orig: body.filter((l) => !isCjkLine(l)),
      cjk: body.filter(isCjkLine),
    });
  }

  raw.sort((x, y) => x.start - y.start);
  const cjkOnly = raw.filter((r) => r.orig.length === 0).length;
  const origIsCjk = raw.length > 0 && cjkOnly >= raw.length * CJK_ONLY_RATIO;
  if (origIsCjk) {
    for (const r of raw) {
      r.cjk = r.body;
      r.orig = [];
    }
  }
  const cues: Cue[] = raw.map((r, i) => {
    const text = origIsCjk ? r.cjk.join(' ') : r.orig.join(' ');
    const trans = origIsCjk ? '' : r.cjk.join('');
    return { id: i + 1, start: r.start, end: r.end, text, ...(trans ? { trans } : {}) };
  });
  return { cues, origIsCjk, hasTrans: cues.some((c) => c.trans) };
}

/** 生成 SRT：每条先原文、后译文（与 skill 的双语 SRT 格式一致）。用于 AI 提示词。 */
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
