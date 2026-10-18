import { lastAtOrBefore } from '../core/normalize';
import type { Cue } from '../core/types';

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

/** 句子很短时，至少循环这么长，避免不停地跳。 */
const MIN_LOOP_MS = 500;
/** 播放位置离开目标句这么远，就认为是用户自己拖了进度条。 */
const LEAVE_BEFORE_MS = 500;
const LEAVE_AFTER_MS = 1500;

/**
 * 单句循环：播到目标句结尾就跳回句首。
 * 用户拖进度条离开目标句时，目标改为新位置所在的句子（点击其他句子也走这条路）。
 * timeupdate 每秒只触发约 4 次，会多播出一截下一句，所以用 requestAnimationFrame 检查。
 */
export function loopSentence(
  video: HTMLVideoElement,
  cues: Cue[],
  startIndex: number,
  onTarget: (index: number) => void,
): () => void {
  const starts = cues.map((c) => c.start);
  let target = startIndex;
  let raf = 0;

  const tick = () => {
    const t = video.currentTime * 1000;
    const cue = cues[target];
    const end = cue ? Math.max(cue.end, cue.start + MIN_LOOP_MS) : 0;
    if (!cue || t < cue.start - LEAVE_BEFORE_MS || t >= end + LEAVE_AFTER_MS) {
      const i = lastAtOrBefore(starts, t);
      if (i >= 0 && i !== target) {
        target = i;
        onTarget(i);
      }
    } else if (t >= end - 30) {
      seek(video, cue.start);
    }
    raf = requestAnimationFrame(tick);
  };

  onTarget(target);
  tick();
  return () => cancelAnimationFrame(raf);
}
