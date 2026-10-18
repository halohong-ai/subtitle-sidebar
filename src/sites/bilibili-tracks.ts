// B站字幕轨道的选择、解析和校验（纯函数，便于单测）。

import type { Fragment } from '../core/types';

/** player/v2 接口 data.subtitle.subtitles 里的一项 */
export interface BiliSubtitleItem {
  lan: string;
  lan_doc: string;
  subtitle_url: string;
  /** 0 = 语音识别原文，1 = AI 翻译（字段可能不存在） */
  ai_type?: number;
}

export interface BiliTrackPlan {
  primary: BiliSubtitleItem;
  secondary?: BiliSubtitleItem;
}

const isAi = (t: BiliSubtitleItem) => t.lan.startsWith('ai-');
const base = (lan: string) => lan.replace(/^ai-/, '').toLowerCase().split('-')[0];

/**
 * 选原文轨道和译文轨道：
 * - 原文语言：以 AI 识别的原文轨道为准（ai_type 为 0），否则取第一条 AI 轨道，再否则取第一条。
 * - 同一语言里人工字幕优先于 AI 字幕。
 * - 译文：原文是中文时取英文，否则取中文；B站不提供机翻，没有就只显示原文。
 */
export function chooseBiliTracks(subs: BiliSubtitleItem[]): BiliTrackPlan | null {
  if (subs.length === 0) return null;
  const spokenTrack =
    subs.find((t) => isAi(t) && t.ai_type === 0) ?? subs.find(isAi) ?? subs[0];
  const spoken = base(spokenTrack.lan);

  const pick = (lang: string, exclude?: BiliSubtitleItem) => {
    const same = subs.filter((t) => t !== exclude && base(t.lan) === lang);
    return same.find((t) => !isAi(t)) ?? same.find(isAi);
  };

  const primary = pick(spoken) ?? subs[0];
  const secondary = pick(spoken === 'zh' ? 'en' : 'zh', primary);
  return secondary ? { primary, secondary } : { primary };
}

interface BiliSubtitleBody {
  body?: Array<{ from: number; to: number; content: string }>;
}

/** 解析字幕 JSON（时间单位是秒）。 */
export function parseBiliSubtitle(data: BiliSubtitleBody): Fragment[] {
  return (data.body ?? [])
    .map((x) => ({
      start: Math.round(x.from * 1000),
      end: Math.round(x.to * 1000),
      text: (x.content ?? '').replace(/\s+/g, ' ').trim(),
    }))
    .filter((f) => f.text)
    .sort((a, b) => a.start - b.start);
}

/**
 * B站接口偶尔返回别的视频的字幕。用字幕结束时间和视频时长比对：
 * 字幕明显超出视频，或长视频的字幕只覆盖很小一段，都视为对不上。
 * 时长未知（0）时不做判断。
 */
export function subtitleMatchesDuration(frags: Fragment[], durationSec: number): boolean {
  if (!durationSec || frags.length === 0) return true;
  const lastEnd = Math.max(...frags.map((f) => f.end));
  const duration = durationSec * 1000;
  if (lastEnd > duration + 30_000) return false;
  if (durationSec > 300 && lastEnd < duration * 0.2) return false;
  return true;
}

/** 字幕地址常以 // 开头，补成 https。 */
export function normalizeSubtitleUrl(url: string): string {
  if (url.startsWith('//')) return `https:${url}`;
  return url.replace(/^http:/, 'https:');
}
