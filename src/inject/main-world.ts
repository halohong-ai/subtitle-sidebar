// 运行在页面主世界（document_start）。
// 1. 包一层 fetch / XHR，记下播放器发出的 /api/timedtext 地址——它带着 PO Token，
//    而字幕轨道列表里的 baseUrl 直接请求会返回空内容。
// 2. 应内容脚本的请求，读取播放器数据、用原始 fetch 取字幕。

import {
  NS,
  type CapturedEvent,
  type PlayerInfo,
  type RequestMessage,
  type ResponseMessage,
} from './protocol';

const captured = new Map<string, string>();
const originalFetch = window.fetch.bind(window);

function noteUrl(raw: string): void {
  try {
    const url = new URL(raw, location.href);
    if (url.pathname !== '/api/timedtext') return;
    const videoId = url.searchParams.get('v');
    if (!videoId) return;
    captured.set(videoId, url.href);
    const ev: CapturedEvent = { ns: NS, dir: 'event', type: 'captured', videoId };
    window.postMessage(ev, location.origin);
  } catch {
    // 地址解析失败就忽略
  }
}

window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
  noteUrl(input instanceof Request ? input.url : String(input));
  return originalFetch(input, init);
};

const originalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (
  this: XMLHttpRequest,
  method: string,
  url: string | URL,
  ...rest: unknown[]
) {
  noteUrl(String(url));
  return (originalOpen as (...args: unknown[]) => void).call(this, method, url, ...rest);
} as typeof XMLHttpRequest.prototype.open;

interface YtPlayerElement extends HTMLElement {
  getPlayerResponse?: () => YtPlayerResponse | undefined;
}

interface YtPlayerResponse {
  videoDetails?: { videoId?: string; lengthSeconds?: string };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: Array<{
        baseUrl: string;
        languageCode: string;
        kind?: string;
        name?: { simpleText?: string; runs?: Array<{ text: string }> };
      }>;
    };
  };
}

function playerInfo(): PlayerInfo | null {
  const player = document.getElementById('movie_player') as YtPlayerElement | null;
  const pr = player?.getPlayerResponse?.();
  const videoId = pr?.videoDetails?.videoId;
  if (!pr || !videoId) return null;
  const tracks = pr.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  return {
    videoId,
    lengthSeconds: Number(pr.videoDetails?.lengthSeconds ?? 0),
    captionTracks: tracks.map((t) => ({
      baseUrl: t.baseUrl,
      languageCode: t.languageCode,
      kind: t.kind,
      name: t.name?.simpleText ?? t.name?.runs?.map((r) => r.text).join('') ?? t.languageCode,
    })),
  };
}

async function handle(msg: RequestMessage): Promise<unknown> {
  switch (msg.type) {
    case 'playerInfo':
      return playerInfo();
    case 'capturedUrl':
      return captured.get((msg.payload as { videoId: string }).videoId) ?? null;
    case 'fetchText': {
      const res = await originalFetch((msg.payload as { url: string }).url, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    }
  }
}

window.addEventListener('message', (e: MessageEvent) => {
  const msg = e.data as RequestMessage | undefined;
  if (e.source !== window || msg?.ns !== NS || msg.dir !== 'req') return;
  handle(msg).then(
    (data) => reply({ ns: NS, dir: 'res', id: msg.id, ok: true, data: data as never }),
    (err: unknown) => reply({ ns: NS, dir: 'res', id: msg.id, ok: false, error: String(err) }),
  );
});

function reply(res: ResponseMessage): void {
  window.postMessage(res, location.origin);
}
