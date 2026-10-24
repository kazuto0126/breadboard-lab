import { autoPlaceAndRoute } from '../core/icPlacement/autoPlace';
import { autoRoute } from '../core/routing/autoRoute';
import { convertAndRoute, convertAndRouteParallel, type ConvertRouted, type RouteJob } from '../logic/convertRoute';
import type { ConvertOptions } from '../logic/toBreadboard';
import type { LogicDiagram } from '../logic/types';
import type { Circuit } from '../types/circuit';
import type { DeepPartial, RoutingConfig, RoutingResult } from '../types/routing';
import type { RoutingRequest, WorkerResponse } from './protocol';
// 內嵌（inline）的 Worker：程式碼包在主程式裡、用 blob URL 啟動，單一 HTML 檔用 file:// 開啟也能用。
import RoutingWorker from './routing.worker.ts?worker&inline';

/** 一件在 Worker 裡算的工作。 */
export interface WorkerJob<T> {
  promise: Promise<T>;
  /** 中止計算。promise 會以 RoutingCancelled 拒絕。 */
  cancel(): void;
}

export type RoutingJob = WorkerJob<RoutingResult>;
export type ConversionJob = WorkerJob<ConvertRouted>;

export interface RoutingOptions {
  /** true：「AI 佈線（可移動 IC）」。 */
  moveIcs?: boolean;
}

export class RoutingCancelled extends Error {
  constructor() {
    super('Routing cancelled');
    this.name = 'RoutingCancelled';
  }
}

let nextId = 1;

/**
 * 每件工作建立一個新的 module Worker；取消時直接 terminate，不需要在引擎內部設中斷點。
 * 沒有 Worker 的環境退回主執行緒（用 setTimeout 讓畫面先更新「計算中」）。
 */
function startJob<T>(request: Omit<RoutingRequest, 'id'>, pick: (msg: Extract<WorkerResponse, { ok: true }>) => T, inline: () => T): WorkerJob<T> {
  if (typeof Worker === 'undefined') return runInline(inline);

  const id = nextId++;
  const worker = new RoutingWorker({ name: 'routing' });
  let settle: { resolve: (r: T) => void; reject: (e: Error) => void } | null = null;
  const promise = new Promise<T>((resolve, reject) => {
    settle = { resolve, reject };
  });
  const finish = (fn: (s: NonNullable<typeof settle>) => void) => {
    if (!settle) return;
    const s = settle;
    settle = null;
    worker.terminate();
    fn(s);
  };
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data;
    if (msg.id !== id) return;
    finish((s) => (msg.ok ? s.resolve(pick(msg)) : s.reject(new Error(msg.error))));
  };
  worker.onerror = (event) => {
    event.preventDefault();
    finish((s) => s.reject(new Error(event.message || '佈線 Worker 發生錯誤')));
  };
  worker.postMessage({ ...request, id });
  return { promise, cancel: () => finish((s) => s.reject(new RoutingCancelled())) };
}

export function startRouting(circuit: Circuit, config?: DeepPartial<RoutingConfig>, options: RoutingOptions = {}): RoutingJob {
  const moveIcs = options.moveIcs === true;
  return startJob(
    { kind: 'route', circuit, config, moveIcs },
    (msg) => (msg as Extract<WorkerResponse, { result: RoutingResult }>).result,
    () => (moveIcs ? autoPlaceAndRoute(circuit, config) : autoRoute(circuit, config)),
  );
}

/** 子專案 41：轉成麵包板同時用幾個 Worker（保留一個核心給畫面，最多 4 個）。 */
export function conversionLanes(cores: number | undefined): number {
  return Math.max(1, Math.min(4, (cores || 2) - 1));
}

/**
 * 子專案 36：邏輯圖轉成麵包板（試好幾種擺法，挑佈線最好的）。子專案 41：每一批佈線（同一塊板的快速試、要排到最好的那幾種）
 * 分給好幾個 Worker 同時跑，主執行緒只負責排程（擺零件、比較結果很快）。取消時全部 Worker 一起停。
 */
export function startConversion(diagram: LogicDiagram, options: ConvertOptions): ConversionJob {
  if (typeof Worker === 'undefined') return runInline(() => convertAndRoute(diagram, options));
  const lanes = conversionLanes(typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency);
  const running = new Set<RoutingJob>();
  let cancelled = false;
  const routeMany = async (jobs: RouteJob[]): Promise<RoutingResult[]> => {
    const results: RoutingResult[] = new Array(jobs.length);
    let next = 0;
    const lane = async () => {
      while (next < jobs.length) {
        if (cancelled) throw new RoutingCancelled();
        const k = next++;
        const job = startJob(
          { kind: 'route', circuit: jobs[k].circuit, config: jobs[k].config, moveIcs: true, from: jobs[k].from },
          (msg) => (msg as Extract<WorkerResponse, { result: RoutingResult }>).result,
          () => autoPlaceAndRoute(jobs[k].circuit, jobs[k].config, jobs[k].from),
        );
        running.add(job);
        try {
          results[k] = await job.promise;
        } finally {
          running.delete(job);
        }
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(lanes, jobs.length) }, lane));
    } catch (err) {
      // 其中一件失敗：其他還在跑的也停下來（不留在背景算）。
      cancelled = true;
      for (const job of running) job.cancel();
      throw err;
    }
    return results;
  };
  let rejectCancel: ((e: Error) => void) | null = null;
  const cancelledPromise = new Promise<never>((_, reject) => {
    rejectCancel = reject;
  });
  const promise = Promise.race([convertAndRouteParallel(diagram, options, routeMany, lanes), cancelledPromise]);
  return {
    promise,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      for (const job of running) job.cancel();
      rejectCancel?.(new RoutingCancelled());
    },
  };
}

function runInline<T>(work: () => T): WorkerJob<T> {
  let cancelled = false;
  let rejectFn: ((e: Error) => void) | null = null;
  const promise = new Promise<T>((resolve, reject) => {
    rejectFn = reject;
    setTimeout(() => {
      if (cancelled) return;
      try {
        resolve(work());
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
