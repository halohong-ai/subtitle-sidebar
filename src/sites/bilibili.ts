// B站适配器。字幕列表的获取顺序：
//   1. 拦截播放器自己请求的 /x/player/wbi/v2 响应（主力，省去 WBI 签名）
//   2. 自己带 cookie 请求该接口
// 字幕需要登录才返回；未登录时接口会给出 need_login_subtitle。

import { buildCues } from '../core/normalize';
import type { Fragment, Transcript } from '../core/types';
import { request } from '../content/bridge';
import {
  chooseBiliTracks,
  normalizeSubtitleUrl,
  parseBiliSubtitle,
  subtitleMatchesDuration,
  type BiliSubtitleItem,
} from './bilibili-tracks';
import { LoginRequiredError, NoCaptionsError, type SiteAdapter } from './types';

const CAPTURE_WAIT_MS = 4000;
const API = 'https://api.bilibili.com';

interface BiliPlayerData {
  bvid?: string;
  cid?: number;
  need_login_subtitle?: boolean;
  subtitle?: { subtitles?: BiliSubtitleItem[] };
}

export const bilibili: SiteAdapter = {
  id: 'bilibili',

  videoKey() {
    const m = location.pathname.match(/^\/video\/(BV[0-9A-Za-z]{10})/);
    if (!m) return null;
    const p = Number(new URLSearchParams(location.search).get('p')) || 1;
    return `bili:${m[1]}:${p}`;
  },

  video() {
    // 部分视频用 <bwp-video>（自定义元素，接口与 <video> 相同）
    return document.querySelector<HTMLVideoElement>(
      '.bpx-player-video-wrap video, .bpx-player-video-wrap bwp-video, video',
    );
  },

  title() {
    return document.title.replace(/_哔哩哔哩_bilibili$/, '').trim();
  },

  timeUrl(videoKey, ms) {
    const [, bvid, p] = videoKey.split(':');
    return `https://www.bilibili.com/video/${bvid}/?p=${p || 1}&t=${Math.floor(ms / 1000)}`;
  },

  isDark() {
    // B站没有稳定的深色模式标记，按页面背景色亮度判断。
    const bg = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g);
    if (!bg || bg.length < 3 || (bg.length === 4 && Number(bg[3]) === 0)) return false;
    const [r, g, b] = bg.map(Number);
    return 0.299 * r + 0.587 * g + 0.114 * b < 128;
  },

  onNavigate(cb) {
    let last = location.href;
    const check = () => {
      if (location.href !== last) {
        last = location.href;
        cb();
      }
    };
    window.addEventListener('popstate', check);
    const timer = setInterval(check, 800);
    return () => {
      window.removeEventListener('popstate', check);
      clearInterval(timer);
    };
  },

  async load(videoKey, signal) {
    const [, bvid, pStr] = videoKey.split(':');
    const p = Number(pStr) || 1;
    const { cid, duration } = await resolveCid(bvid, p);
    signal.throwIfAborted();

    let player = await getPlayer(bvid, cid, signal, true);
    let subs = player?.subtitle?.subtitles ?? [];
    if (subs.length === 0) {
      if (player?.need_login_subtitle) {
        throw new LoginRequiredError('登录 B站后才能看到字幕（B站只向登录用户提供字幕）。登录后点重试。');
      }
      throw new NoCaptionsError();
    }

    const plan = chooseBiliTracks(subs)!;
    const videoSec = duration || bilibili.video()?.duration || 0;

    let primary = await download(plan.primary);
    if (!subtitleMatchesDuration(primary, videoSec)) {
      // 已知问题：接口偶尔返回别的视频的字幕。绕过缓存重新请求一次。
      player = await getPlayer(bvid, cid, signal, false);
      subs = player?.subtitle?.subtitles ?? [];
      const again = subs.find((s) => s.lan === plan.primary.lan);
      primary = again ? await download(again) : [];
      if (!subtitleMatchesDuration(primary, videoSec)) {
        throw new Error('B站返回的字幕和视频对不上，请刷新页面后重试');
      }
    }

    const secondary = plan.secondary ? await download(plan.secondary).catch(() => null) : null;
    const usable = secondary && subtitleMatchesDuration(secondary, videoSec) ? secondary : null;

    return {
      videoKey,
      source: 'site',
      lang: plan.primary.lan.replace(/^ai-/, ''),
      transLang: usable ? plan.secondary!.lan.replace(/^ai-/, '') : undefined,
      label: usable ? `${plan.primary.lan_doc} + ${plan.secondary!.lan_doc}` : plan.primary.lan_doc,
      cues: buildCues(primary, false, usable ?? undefined),
    } satisfies Transcript;
  },
};

/** 找到当前分P的 cid 和时长：优先读页面状态，状态过期（站内跳转后）就查接口。 */
async function resolveCid(bvid: string, p: number): Promise<{ cid: number; duration: number }> {
  const state = await request('biliState', {}).catch(() => null);
  if (state?.bvid === bvid) {
    const page = state.pages.find((x) => x.page === p);
    if (page) return { cid: page.cid, duration: page.duration };
    if (state.p === p && state.cid) return { cid: state.cid, duration: 0 };
  }
  const text = await request('fetchText', { url: `${API}/x/web-interface/view?bvid=${bvid}` });
  const pages = (JSON.parse(text) as { data?: { pages?: Array<{ cid: number; page: number; duration: number }> } })
    .data?.pages;
  const page = pages?.find((x) => x.page === p) ?? pages?.[0];
  if (!page) throw new Error('读取视频信息失败，请刷新页面后重试');
  return { cid: page.cid, duration: page.duration };
}

/** 取播放器接口数据：先等拦截结果，没有再自己请求。 */
async function getPlayer(
  bvid: string,
  cid: number,
  signal: AbortSignal,
  allowCaptured: boolean,
): Promise<BiliPlayerData | null> {
  if (allowCaptured) {
    const deadline = Date.now() + CAPTURE_WAIT_MS;
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      const data = (await request('biliPlayer', { cid }).catch(() => null)) as BiliPlayerData | null;
      if (data && (!data.bvid || data.bvid === bvid)) return data;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  try {
    const text = await request('fetchText', {
      url: `${API}/x/player/wbi/v2?bvid=${bvid}&cid=${cid}&_=${Date.now()}`,
    });
    return (JSON.parse(text) as { data?: BiliPlayerData }).data ?? null;
  } catch {
    return null;
  }
}

/** 下载字幕文件。字幕服务器不接受带 cookie 的跨域请求，所以不带 cookie（B站播放器也是这样请求的）。 */
async function download(item: BiliSubtitleItem): Promise<Fragment[]> {
  let text: string;
  try {
    text = await request('fetchText', {
      url: normalizeSubtitleUrl(item.subtitle_url),
      credentials: 'omit',
    });
  } catch {
    throw new Error('字幕文件下载失败，请刷新页面后重试');
  }
  return parseBiliSubtitle(JSON.parse(text));
}
