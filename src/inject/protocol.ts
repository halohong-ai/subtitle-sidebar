// 内容脚本（隔离世界）与主世界脚本之间的 postMessage 协议。

export const NS = 'subtitle-sidebar';

export interface CaptionTrackInfo {
  baseUrl: string;
  languageCode: string;
  /** 'asr' 表示自动生成 */
  kind?: string;
  name: string;
}

export interface PlayerInfo {
  videoId: string;
  lengthSeconds: number;
  captionTracks: CaptionTrackInfo[];
}

/** B站页面 window.__INITIAL_STATE__ 里我们关心的部分 */
export interface BiliState {
  bvid: string;
  cid: number;
  p: number;
  pages: Array<{ cid: number; page: number; duration: number }>;
}

export interface Requests {
  /** YouTube：读取当前播放器的视频信息和字幕轨道列表 */
  playerInfo: { req: Record<string, never>; res: PlayerInfo | null };
  /** 取播放器为某个视频发出过的字幕请求地址（带 PO Token） */
  capturedUrl: { req: { videoId: string }; res: string | null };
  /** B站：读取页面初始状态 */
  biliState: { req: Record<string, never>; res: BiliState | null };
  /** B站：取播放器为某个分P请求过的 player/v2 接口响应（含字幕列表） */
  biliPlayer: { req: { cid: number }; res: unknown };
  /** 用页面原始的 fetch 请求一个地址（带 cookie），返回文本 */
  fetchText: { req: { url: string }; res: string };
}

export type RequestType = keyof Requests;

export interface RequestMessage<T extends RequestType = RequestType> {
  ns: typeof NS;
  dir: 'req';
  id: number;
  type: T;
  payload: Requests[T]['req'];
}

export interface ResponseMessage<T extends RequestType = RequestType> {
  ns: typeof NS;
  dir: 'res';
  id: number;
  ok: boolean;
  data?: Requests[T]['res'];
  error?: string;
}

/** 主世界脚本捕获到新的字幕请求时主动通知。videoId 对 B站来说是 cid。 */
export interface CapturedEvent {
  ns: typeof NS;
  dir: 'event';
  type: 'captured';
  videoId: string;
}
