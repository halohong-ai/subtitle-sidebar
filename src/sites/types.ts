import type { Transcript } from '../core/types';

/** 每个网站实现一个适配器；网站改版时只需要改对应的适配器文件。 */
export interface SiteAdapter {
  id: 'youtube' | 'bilibili';
  /** 当前页面的视频标识；不是视频页时返回 null */
  videoKey(): string | null;
  /** 页面上正在播放的 <video> 元素 */
  video(): HTMLVideoElement | null;
  /** 视频标题（用于导出文件名和笔记） */
  title(): string;
  /** 能直接跳到视频某个时间点的链接（用于笔记导出） */
  timeUrl(videoKey: string, ms: number): string;
  /** 网站当前是否为深色主题 */
  isDark(): boolean;
  /** 站内跳转（换视频）时回调；返回取消订阅函数 */
  onNavigate(cb: () => void): () => void;
  /** 读取并整理当前视频的字幕 */
  load(videoKey: string, signal: AbortSignal): Promise<Transcript>;
}

export class NoCaptionsError extends Error {
  constructor() {
    super('这个视频没有字幕');
    this.name = 'NoCaptionsError';
  }
}

export class LoginRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoginRequiredError';
  }
}
