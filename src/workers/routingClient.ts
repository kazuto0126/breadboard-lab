import { autoRoute } from '../core/routing/autoRoute';
import type { Circuit } from '../types/circuit';
import type { DeepPartial, RoutingConfig, RoutingResult } from '../types/routing';
import type { RoutingResponse } from './protocol';
// 內嵌（inline）的 Worker：程式碼包在主程式裡、用 blob URL 啟動，單一 HTML 檔用 file:// 開啟也能用。
import RoutingWorker from './routing.worker.ts?worker&inline';

export interface RoutingJob {
  promise: Promise<RoutingResult>;
  /** 中止計算。promise 會以 RoutingCancelled 拒絕。 */
  cancel(): void;
}

export class RoutingCancelled extends Error {
  constructor() {
    super('Routing cancelled');
    this.name = 'RoutingCancelled';
  }
}

let nextId = 1;

/**
 * 每次佈線建立一個新的 module Worker；取消時直接 terminate，不需要在引擎內部設中斷點。
 * 沒有 Worker 的環境退回主執行緒（用 setTimeout 讓畫面先更新「計算中」）。
 */
export function startRouting(circuit: Circuit, config?: DeepPartial<RoutingConfig>): RoutingJob {
  if (typeof Worker === 'undefined') return runInline(circuit, config);

  const id = nextId++;
  const worker = new RoutingWorker({ name: 'routing' });
  let settle: { resolve: (r: RoutingResult) => void; reject: (e: Error) => void } | null = null;
  const promise = new Promise<RoutingResult>((resolve, reject) => {
    settle = { resolve, reject };
  });
  const finish = (fn: (s: NonNullable<typeof settle>) => void) => {
    if (!settle) return;
    const s = settle;
    settle = null;
    worker.terminate();
    fn(s);
  };
  worker.onmessage = (event: MessageEvent<RoutingResponse>) => {
    const msg = event.data;
    if (msg.id !== id) return;
    finish((s) => (msg.ok ? s.resolve(msg.result) : s.reject(new Error(msg.error))));
  };
  worker.onerror = (event) => {
    event.preventDefault();
    finish((s) => s.reject(new Error(event.message || '佈線 Worker 發生錯誤')));
  };
  worker.postMessage({ id, circuit, config });
  return { promise, cancel: () => finish((s) => s.reject(new RoutingCancelled())) };
}

function runInline(circuit: Circuit, config?: DeepPartial<RoutingConfig>): RoutingJob {
  let cancelled = false;
  let rejectFn: ((e: Error) => void) | null = null;
  const promise = new Promise<RoutingResult>((resolve, reject) => {
    rejectFn = reject;
    setTimeout(() => {
      if (cancelled) return;
      try {
        resolve(autoRoute(circuit, config));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }, 0);
  });
  return {
    promise,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      rejectFn?.(new RoutingCancelled());
    },
  };
}
