// 运行在页面主世界（document_start）。
// 1. 包一层 fetch / XHR，记下播放器自己发出的字幕相关请求：
//    - YouTube：/api/timedtext 的地址——它带着 PO Token，而轨道列表里的 baseUrl
//      直接请求会返回空内容。
//    - B站：/x/player/(wbi/)v2 的响应——里面有字幕列表，省去自己做 WBI 签名。
// 2. 应内容脚本的请求，读取页面数据、用原始 fetch 取字幕。

import {
  NS,
  type BiliState,
  type CapturedEvent,
  type PlayerInfo,
  type RequestMessage,
  type ResponseMessage,
} from './protocol';

const timedtextUrls = new Map<string, string>();
const biliPlayers = new Map<number, unknown>();
const originalFetch = window.fetch.bind(window);

function notify(videoId: string): void {
  const ev: CapturedEvent = { ns: NS, dir: 'event', type: 'captured', videoId };
  window.postMessage(ev, location.origin);
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw, location.href);
  } catch {
    return null;
  }
}

const isBiliPlayerApi = (url: URL) => /\/x\/player\/(wbi\/)?v2$/.test(url.pathname);

/** 请求发出时：记下 YouTube 字幕地址。 */
function noteRequest(url: URL): void {
  if (url.pathname !== '/api/timedtext') return;
  const videoId = url.searchParams.get('v');
  if (!videoId) return;
  timedtextUrls.set(videoId, url.href);
  notify(videoId);
}

/** 响应回来时：记下 B站播放器接口的数据。 */
function noteResponse(url: URL, body: unknown): void {
  if (!isBiliPlayerApi(url)) return;
  const data = (body as { data?: { cid?: number } } | null)?.data;
  const cid = Number(data?.cid ?? url.searchParams.get('cid'));
  if (!cid || !data) return;
  biliPlayers.set(cid, data);
  notify(String(cid));
}

window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
  const url = parseUrl(input instanceof Request ? input.url : String(input));
  if (url) noteRequest(url);
  const pending = originalFetch(input, init);
  if (url && isBiliPlayerApi(url)) {
    pending
      .then((res) => res.clone().json())
      .then((body) => noteResponse(url, body))
      .catch(() => {});
  }
  return pending;
};

const originalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (
  this: XMLHttpRequest,
  method: string,
  rawUrl: string | URL,
  ...rest: unknown[]
) {
  const url = parseUrl(String(rawUrl));
  if (url) {
    noteRequest(url);
    if (isBiliPlayerApi(url)) {
      this.addEventListener('load', () => {
        try {
          const body =
            this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
          noteResponse(url, body);
        } catch {
          // 响应不是 JSON 就忽略
        }
      });
    }
  }
  return (originalOpen as (...args: unknown[]) => void).call(this, method, rawUrl, ...rest);
} as typeof XMLHttpRequest.prototype.open;

// ---------- YouTube ----------

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

// ---------- B站 ----------

interface BiliInitialState {
  bvid?: string;
  cid?: number;
  p?: number;
  videoData?: { cid?: number; pages?: Array<{ cid: number; page: number; duration: number }> };
}

function biliState(): BiliState | null {
  const st = (window as unknown as { __INITIAL_STATE__?: BiliInitialState }).__INITIAL_STATE__;
  if (!st?.bvid) return null;
  return {
    bvid: st.bvid,
    cid: Number(st.cid ?? st.videoData?.cid ?? 0),
    p: Number(st.p ?? 1),
    pages: (st.videoData?.pages ?? []).map((pg) => ({
      cid: pg.cid,
      page: pg.page,
      duration: pg.duration,
    })),
  };
}

// ---------- 与内容脚本通信 ----------

async function handle(msg: RequestMessage): Promise<unknown> {
  switch (msg.type) {
    case 'playerInfo':
      return playerInfo();
    case 'capturedUrl':
      return timedtextUrls.get((msg.payload as { videoId: string }).videoId) ?? null;
    case 'biliState':
      return biliState();
    case 'biliPlayer':
      return biliPlayers.get((msg.payload as { cid: number }).cid) ?? null;
    case 'fetchText': {
      const { url, credentials } = msg.payload as { url: string; credentials?: RequestCredentials };
      const res = await originalFetch(url, { credentials: credentials ?? 'include' });
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
