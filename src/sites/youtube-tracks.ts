// YouTube 字幕轨道的选择与地址拼接（纯函数，便于单测）。

import type { CaptionTrackInfo } from '../inject/protocol';

export interface TrackChoice {
  track: CaptionTrackInfo;
  /** 需要 YouTube 机器翻译时的目标语言 */
  tlang?: string;
  label: string;
}

export interface TrackPlan {
  primary: TrackChoice;
  secondary?: TrackChoice;
}

const base = (lang: string) => lang.toLowerCase().split('-')[0];
const isAsr = (t: CaptionTrackInfo) => t.kind === 'asr';

// 中文轨道的优先顺序：简体优先。
const ZH_ORDER = ['zh-hans', 'zh-cn', 'zh', 'zh-sg', 'zh-hant', 'zh-tw', 'zh-hk'];

function zhRank(lang: string): number {
  const i = ZH_ORDER.indexOf(lang.toLowerCase());
  return i === -1 ? ZH_ORDER.length : i;
}

/**
 * 选原文轨道和译文轨道：
 * - 原文 = 视频说话的语言（以自动字幕的语言为准），人工字幕优先。
 * - 译文 = 原文是中文时取英文，否则取中文；没有人工译文轨道就用 YouTube 机翻。
 */
export function chooseTracks(tracks: CaptionTrackInfo[]): TrackPlan | null {
  if (tracks.length === 0) return null;
  const spoken = (tracks.find(isAsr) ?? tracks[0]).languageCode;
  const sameLang = tracks.filter((t) => base(t.languageCode) === base(spoken));
  const primaryTrack =
    sameLang.find((t) => !isAsr(t) && t.languageCode === spoken) ??
    sameLang.find((t) => !isAsr(t)) ??
    sameLang.find(isAsr) ??
    tracks[0];
  const primary: TrackChoice = { track: primaryTrack, label: primaryTrack.name };

  const target = base(spoken) === 'zh' ? 'en' : 'zh';
  const candidates = tracks.filter(
    (t) => t !== primaryTrack && !isAsr(t) && base(t.languageCode) === target,
  );
  if (target === 'zh') candidates.sort((a, b) => zhRank(a.languageCode) - zhRank(b.languageCode));

  const secondary: TrackChoice = candidates[0]
    ? { track: candidates[0], label: candidates[0].name }
    : {
        track: primaryTrack,
        tlang: target === 'zh' ? 'zh-Hans' : 'en',
        label: target === 'zh' ? '中文（YouTube 机翻）' : '英文（YouTube 机翻）',
      };

  return { primary, secondary };
}

/** 这些参数决定「哪条轨道」，不能从捕获地址里照搬。 */
const TRACK_PARAMS = new Set(['v', 'lang', 'kind', 'name', 'tlang', 'fmt']);

/**
 * 拼出请求某条轨道 json3 的地址。
 * 传入播放器捕获的地址时，把它携带的 PO Token 等额外参数补到 baseUrl 上。
 */
export function trackUrl(choice: TrackChoice, capturedUrl: string | null): string {
  const url = new URL(choice.track.baseUrl, 'https://www.youtube.com');
  if (capturedUrl) {
    const cap = new URL(capturedUrl, 'https://www.youtube.com');
    cap.searchParams.forEach((value, key) => {
      if (!TRACK_PARAMS.has(key) && !url.searchParams.has(key)) url.searchParams.set(key, value);
    });
  }
  url.searchParams.set('fmt', 'json3');
  if (choice.tlang) url.searchParams.set('tlang', choice.tlang);
  else url.searchParams.delete('tlang');
  return url.href;
}
