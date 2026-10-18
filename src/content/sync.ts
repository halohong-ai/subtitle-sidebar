import { lastAtOrBefore } from '../core/normalize';

/**
 * 监听视频播放进度，算出当前正在说的是第几句（二分查找句子开始时间）。
 * 只在句子变化时回调。返回取消监听的函数。
 */
export function watchPlayback(
  video: HTMLVideoElement,
  starts: number[],
  onIndex: (index: number) => void,
): () => void {
  let last = -2;
  const update = () => {
    const i = lastAtOrBefore(starts, video.currentTime * 1000 + 100);
    if (i !== last) {
      last = i;
      onIndex(i);
    }
  };
  const events = ['timeupdate', 'seeked', 'loadedmetadata'] as const;
  events.forEach((e) => video.addEventListener(e, update));
  update();
  return () => events.forEach((e) => video.removeEventListener(e, update));
}

export function seek(video: HTMLVideoElement, ms: number): void {
  video.currentTime = ms / 1000;
}
