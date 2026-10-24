// YouTube 适配器。字幕获取按顺序降级：
//   A. 直接请求轨道的 baseUrl（常因缺 PO Token 返回空内容）
//   B. 用播放器自己发出的请求地址补上 PO Token 再请求（主力）
//   C. 打开「内容转文字」面板，从页面上读（只有一种语言）

import { parseJson3, type Json3 } from '../core/json3';
import { buildCues } from '../core/normalize';
import { cleanText } from '../core/text';
import { parseClock } from '../core/time';
import type { Fragment, Transcript } from '../core/types';
import { onCaptured, request } from '../content/bridge';
import type { PlayerInfo } from '../inject/protocol';
import { NoCaptionsError, type SiteAdapter } from './types';
import { chooseTracks, trackUrl, type TrackChoice } from './youtube-tracks';

const PLAYER_WAIT_MS = 10000;
const CAPTURE_WAIT_MS = 6000;
const PANEL_WAIT_MS = 8000;
const SECONDARY_RETRY_MS = 1500;

export const youtube: SiteAdapter = {
  id: 'youtube',

  videoKey() {
    if (location.pathname !== '/watch') return null;
    const v = new URLSearchParams(location.search).get('v');
    return v ? `yt:${v}` : null;
  },

  video() {
    return document.querySelector<HTMLVideoElement>('#movie_player video');
  },

  title() {
    return document.title.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube$/, '').trim();
  },

  timeUrl(videoKey, ms) {
    const v = videoKey.replace(/^yt:/, '');
    return `https://www.youtube.com/watch?v=${v}&t=${Math.floor(ms / 1000)}s`;
  },

  isDark() {
    return document.documentElement.hasAttribute('dark');
  },

  onNavigate(cb) {
    // yt-navigate-finish 是 YouTube 站内跳转完成的事件；再加轮询兜底。
    let last = location.href;
    const check = () => {
      if (location.href !== last) {
        last = location.href;
        cb();
      }
    };
    document.addEventListener('yt-navigate-finish', check);
    window.addEventListener('popstate', check);
    const timer = setInterval(check, 1000);
    return () => {
      document.removeEventListener('yt-navigate-finish', check);
      window.removeEventListener('popstate', check);
      clearInterval(timer);
    };
  },

  async load(videoKey, signal) {
    const videoId = videoKey.replace(/^yt:/, '');
    const info = await waitForPlayer(videoId, signal);
    const plan = chooseTracks(info.captionTracks);
    if (!plan) throw new NoCaptionsError();
    const primaryAsr = plan.primary.track.kind === 'asr';

    const primary = await fetchTrack(plan.primary, videoId, signal);
    if (!primary) {
      // 实在取不到 json3，就从「内容转文字」面板读原文。
      const lines = await readTranscriptPanel(signal);
      if (!lines?.length) throw new Error('字幕读取失败，请刷新页面后重试');
      return {
        videoKey,
        source: 'site',
        lang: plan.primary.track.languageCode,
        label: `${plan.primary.label}（转文字面板）`,
        cues: buildCues(lines, false),
      } satisfies Transcript;
    }

    // 译文（尤其是 YouTube 机翻）偶尔被限流，隔一会儿再试一次
    let secondary: Fragment[] | null = null;
    if (plan.secondary) {
      secondary = await fetchTrack(plan.secondary, videoId, signal);
      if (!secondary) {
        await new Promise((r) => setTimeout(r, SECONDARY_RETRY_MS));
        signal.throwIfAborted();
        secondary = await fetchTrack(plan.secondary, videoId, signal);
      }
    }

    return {
      videoKey,
      source: 'site',
      lang: plan.primary.track.languageCode,
      transLang: secondary ? (plan.secondary!.tlang ?? plan.secondary!.track.languageCode) : undefined,
      label: secondary
        ? `${plan.primary.label} + ${plan.secondary!.label}`
        : plan.secondary
          ? `${plan.primary.label}（译文没取到，可点 ↻ 重试）`
          : plan.primary.label,
      cues: buildCues(primary, primaryAsr, secondary ?? undefined),
    } satisfies Transcript;
  },
};

/** 等播放器切到目标视频（站内跳转后播放器数据会短暂停留在上一个视频）。 */
async function waitForPlayer(videoId: string, signal: AbortSignal): Promise<PlayerInfo> {
  const info = await waitFor(async () => {
    const i = await request('playerInfo', {}).catch(() => null);
    return i?.videoId === videoId ? i : null;
  }, PLAYER_WAIT_MS, signal);
  if (!info) throw new Error('播放器还没准备好，请稍后重试');
  return info;
}

async function fetchTrack(
  choice: TrackChoice,
  videoId: string,
  signal: AbortSignal,
): Promise<Fragment[] | null> {
  const direct = await tryFetch(trackUrl(choice, null));
  if (direct) return direct;
  signal.throwIfAborted();

  const captured = await ensureCaptured(videoId, signal);
  if (!captured) return null;
  return tryFetch(trackUrl(choice, captured));
}

async function tryFetch(url: string): Promise<Fragment[] | null> {
  try {
    const text = await request('fetchText', { url });
    if (!text.trim()) return null;
    const frags = parseJson3(JSON.parse(text) as Json3);
    return frags.length ? frags : null;
  } catch {
    return null;
  }
}

/**
 * 拿到播放器为这个视频发出过的字幕请求地址。
 * 用户没开字幕时播放器不会发请求，就临时点开一次 CC 按钮，拿到后恢复原状。
 */
async function ensureCaptured(videoId: string, signal: AbortSignal): Promise<string | null> {
  const existing = await request('capturedUrl', { videoId }).catch(() => null);
  if (existing) return existing;

  const button = document.querySelector<HTMLButtonElement>('#movie_player .ytp-subtitles-button');
  if (!button || button.offsetParent === null) return null;
  const wasOn = button.getAttribute('aria-pressed') === 'true';

  const seen = new Promise<void>((resolve) => {
    const off = onCaptured((id) => {
      if (id === videoId) {
        off();
        resolve();
      }
    });
    setTimeout(() => {
      off();
      resolve();
    }, CAPTURE_WAIT_MS);
  });

  button.click();
  await seen;
  // 恢复用户原来的字幕开关状态。
  if ((button.getAttribute('aria-pressed') === 'true') !== wasOn) button.click();
  signal.throwIfAborted();

  return request('capturedUrl', { videoId }).catch(() => null);
}

/** 打开「内容转文字」面板读取文本，读完关掉面板。 */
async function readTranscriptPanel(signal: AbortSignal): Promise<Fragment[] | null> {
  const open = document.querySelector<HTMLElement>(
    'ytd-video-description-transcript-section-renderer button',
  );
  if (!open) return null;
  open.click();

  const segments = await waitFor(async () => {
    const nodes = document.querySelectorAll('ytd-transcript-segment-renderer');
    return nodes.length ? Array.from(nodes) : null;
  }, PANEL_WAIT_MS, signal);

  document
    .querySelector<HTMLElement>(
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"] #visibility-button button',
    )
    ?.click();
  if (!segments) return null;

  const lines: Fragment[] = [];
  for (const seg of segments) {
    const start = parseClock(seg.querySelector('.segment-timestamp')?.textContent ?? '');
    const text = cleanText(seg.querySelector('.segment-text')?.textContent ?? '');
    if (start !== null && text) lines.push({ start, end: start, text });
  }
  for (let i = 0; i < lines.length; i++) {
    lines[i].end = i + 1 < lines.length ? lines[i + 1].start : lines[i].start + 5000;
  }
  return lines;
}

async function waitFor<T>(
  probe: () => Promise<T | null>,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    const v = await probe();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}
