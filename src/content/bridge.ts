// 内容脚本这一侧：向主世界脚本发请求并等回复。

import {
  NS,
  type CapturedEvent,
  type RequestType,
  type Requests,
  type ResponseMessage,
} from '../inject/protocol';

let nextId = 1;
const pending = new Map<number, (res: ResponseMessage) => void>();
const capturedListeners = new Set<(videoId: string) => void>();

window.addEventListener('message', (e: MessageEvent) => {
  const msg = e.data as ResponseMessage | CapturedEvent | undefined;
  if (e.source !== window || msg?.ns !== NS) return;
  if (msg.dir === 'res') {
    pending.get(msg.id)?.(msg);
    pending.delete(msg.id);
  } else if (msg.dir === 'event' && msg.type === 'captured') {
    capturedListeners.forEach((fn) => fn(msg.videoId));
  }
});

export function request<T extends RequestType>(
  type: T,
  payload: Requests[T]['req'],
  timeoutMs = 15000,
): Promise<Requests[T]['res']> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`页面脚本无响应（${type}）`));
    }, timeoutMs);
    pending.set(id, (res) => {
      clearTimeout(timer);
      if (res.ok) resolve(res.data as Requests[T]['res']);
      else reject(new Error(res.error));
    });
    window.postMessage({ ns: NS, dir: 'req', id, type, payload }, location.origin);
  });
}

export function onCaptured(fn: (videoId: string) => void): () => void {
  capturedListeners.add(fn);
  return () => capturedListeners.delete(fn);
}
