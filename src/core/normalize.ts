import type { Cue, Fragment } from './types';

const SENTENCE_END = /[.?!。？！…]["'”’)）]*$/;
/** 中文及全角标点：两侧都是这类字符时拼接不加空格 */
const CJK_OR_PUNCT = /[㐀-鿿豈-﫿　-〿＀-￯—…“”‘’]/;
const CJK = /[㐀-鿿豈-﫿]/;

/** 停顿多久算断句（自动字幕） */
const PAUSE_MS = 400;
/** 停顿这么久无论如何都断句 */
const LONG_PAUSE_MS = 2000;
/** 单句最长时长 */
const MAX_SENTENCE_MS = 15000;
/** 单句最多英文词数 / 中文字数（带标点的字幕） */
const MAX_WORDS = 40;
const MAX_CJK_CHARS = 60;
/** 无标点的自动字幕没有句子边界，单句上限收紧，便于阅读 */
const ASR_MAX_WORDS = 22;
const ASR_MAX_CJK_CHARS = 32;
/** 超过这个词数时，稍有停顿就断句 */
const SOFT_WORDS = 12;
const SOFT_PAUSE_MS = 100;

/** 拼接两段文字：中文之间不加空格，其余加一个空格。 */
export function joinText(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  if (CJK_OR_PUNCT.test(a.slice(-1)) && CJK_OR_PUNCT.test(b[0])) return a + b;
  return a + ' ' + b;
}

function size(text: string): { words: number; cjk: boolean } {
  const cjkChars = text.match(new RegExp(CJK.source, 'g'))?.length ?? 0;
  if (cjkChars > text.length / 3) return { words: cjkChars, cjk: true };
  return { words: text.split(' ').filter(Boolean).length, cjk: false };
}

/** 一条轨道里，以句末标点结尾的片段占比超过这个值，就认为它带标点。 */
export function hasPunctuation(frags: Fragment[]): boolean {
  if (frags.length === 0) return false;
  const ends = frags.filter((f) => SENTENCE_END.test(f.text)).length;
  return ends / frags.length >= 0.05;
}

/** 去掉连续重复的片段（自动字幕滚动时偶尔会重复一行）。 */
export function dedupe(frags: Fragment[]): Fragment[] {
  const out: Fragment[] = [];
  for (const f of frags) {
    const prev = out[out.length - 1];
    if (prev && prev.text === f.text && f.start < prev.end + 200) {
      prev.end = Math.max(prev.end, f.end);
      continue;
    }
    out.push({ ...f });
  }
  return out;
}

/**
 * 把片段合并成句子。
 * - 自动字幕（逐词）：带标点的按句末标点断句；无标点的按停顿断句。
 * - 人工 / 按行的字幕：见 mergeLines。
 */
export function mergeSentences(input: Fragment[], asr: boolean): Fragment[] {
  const frags = dedupe(input);
  const punctuated = hasPunctuation(frags);
  if (!asr) return mergeLines(frags, punctuated);

  const out: Fragment[] = [];
  let cur: Fragment | null = null;

  const flush = () => {
    if (cur && cur.text) out.push(cur);
    cur = null;
  };

  for (let i = 0; i < frags.length; i++) {
    const f = frags[i];
    if (cur) {
      const gap = f.start - cur.end;
      const { words, cjk } = size(cur.text);
      const limit = punctuated
        ? (cjk ? MAX_CJK_CHARS : MAX_WORDS)
        : (cjk ? ASR_MAX_CJK_CHARS : ASR_MAX_WORDS);
      const tooLong = f.end - cur.start > MAX_SENTENCE_MS || words >= limit;
      const pauseBreak = !punctuated && gap >= PAUSE_MS && words >= 5;
      const softBreak = !punctuated && words >= SOFT_WORDS && gap >= SOFT_PAUSE_MS;
      if (tooLong || gap >= LONG_PAUSE_MS || pauseBreak || softBreak) flush();
    }
    if (!cur) {
      cur = { ...f };
    } else {
      cur.text = joinText(cur.text, f.text);
      cur.end = Math.max(cur.end, f.end);
    }
    if (punctuated && SENTENCE_END.test(f.text) && size(cur.text).words >= 2) flush();
  }
  flush();
  return out;
}

/**
 * 按行的字幕：只在「一句话被拆到下一行」时合并。
 * - 无标点的轨道：每行保持原样（如 B站 AI 字幕，一行就是一句）。
 * - 带标点的轨道：本行没有以句末标点结尾，且下一行是接续时才合并。
 *   英文的接续 = 下一行小写开头；中文没有大小写，只看标点。
 */
function mergeLines(frags: Fragment[], punctuated: boolean): Fragment[] {
  if (!punctuated) return frags;
  const out: Fragment[] = [];
  for (const f of frags) {
    const prev = out[out.length - 1];
    if (prev && continues(prev, f)) {
      prev.text = joinText(prev.text, f.text);
      prev.end = Math.max(prev.end, f.end);
    } else {
      out.push({ ...f });
    }
  }
  return out;
}

function continues(prev: Fragment, next: Fragment): boolean {
  if (SENTENCE_END.test(prev.text)) return false;
  if (next.start - prev.end >= LONG_PAUSE_MS) return false;
  if (next.end - prev.start > MAX_SENTENCE_MS) return false;
  const { words, cjk } = size(prev.text);
  if (words >= (cjk ? MAX_CJK_CHARS : MAX_WORDS)) return false;
  return cjk || /^[a-z]/.test(next.text);
}

/**
 * 把第二条轨道（译文）的片段按「中点落在哪句的时间里」归到原文句子上。
 * 中点落在两句之间的空隙时，归到前一句。
 */
export function pairTranslation(sentences: Fragment[], secondary: Fragment[]): string[] {
  const trans = sentences.map(() => '');
  if (sentences.length === 0) return trans;
  const starts = sentences.map((s) => s.start);

  for (const f of dedupe(secondary)) {
    const mid = (f.start + f.end) / 2;
    const i = Math.max(0, lastAtOrBefore(starts, mid));
    trans[i] = joinText(trans[i], f.text);
  }
  return trans;
}

/** 有序数组里最后一个 ≤ t 的下标；都大于 t 时返回 -1。 */
export function lastAtOrBefore(sorted: number[], t: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

export function buildCues(
  primary: Fragment[],
  primaryAsr: boolean,
  secondary?: Fragment[],
): Cue[] {
  const sentences = mergeSentences(primary, primaryAsr);
  const trans = secondary?.length ? pairTranslation(sentences, secondary) : null;
  return sentences.map((s, i) => ({
    id: i + 1,
    start: s.start,
    end: s.end,
    text: s.text,
    ...(trans ? { trans: trans[i] } : {}),
  }));
}
