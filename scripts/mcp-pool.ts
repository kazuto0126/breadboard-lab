/**
 * 子專案 42（規格 2026-10-24 mcp-parallel）：MCP 的「轉成麵包板」也同時試好幾種擺法。
 * Node 的 worker_threads：每個執行緒跑「可移動 IC」佈線（和網頁的 Worker 一樣），主執行緒照 convertSteps 排程。
 *
 * 執行緒的程式就是這個檔案所在的模組：原始碼版是 scripts/mcp-pool.ts（繼承 --import tsx），
 * 打包版是 breadboard-lab-mcp.mjs 整個檔案（伺服器只在主執行緒連上 AI 工具，見 mcp-server.ts）。
 */
import { availableParallelism } from 'node:os';
import { isMainThread, parentPort, threadId, Worker, workerData } from 'node:worker_threads';
import { autoPlaceAndRoute } from '../src/core/icPlacement/autoPlace';
import type { RouteJob } from '../src/logic/convertRoute';
import type { RoutingResult } from '../src/types/routing';

const ROLE = 'breadboard-lab-routing';

type Request = { id: number; job: RouteJob };
type Response = { id: number; ok: true; result: RoutingResult; threadId: number } | { id: number; ok: false; error: string };

/** 這個模組在佈線執行緒裡載入時：收到工作就佈線，回傳結果。 */
if (!isMainThread && (workerData as { role?: string } | null)?.role === ROLE && parentPort) {
  const port = parentPort;
  port.on('message', ({ id, job }: Request) => {
    try {
      port.postMessage({ id, ok: true, result: autoPlaceAndRoute(job.circuit, job.config, job.from), threadId } satisfies Response);
    } catch (err) {
      port.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies Response);
    }
  });
}

/**
 * 同時用幾個執行緒（保留一個核心給伺服器，最多 4 個）；1 代表不用執行緒，一次一件。
 * 環境變數 BREADBOARD_LAB_MCP_THREADS 可以指定（測試時減少負擔；1 是不用執行緒）。
 */
export function poolSize(cores = availableParallelism(), env = process.env.BREADBOARD_LAB_MCP_THREADS): number {
  const wanted = Number(env);
  if (Number.isInteger(wanted) && wanted >= 1) return Math.min(4, wanted);
  return Math.max(1, Math.min(4, cores - 1));
}

export interface RoutingPool {
  size: number;
  /** 一批工作分給各個執行緒同時跑，結果依工作的順序。 */
  routeMany(jobs: RouteJob[]): Promise<RoutingResult[]>;
  /** 最後一批是哪些執行緒跑的（測試用）。 */
  lastThreads(): number[];
  close(): Promise<void>;
}

/**
 * 執行緒第一次用到時才建立，之後留著給下一次轉換（unref：閒著的時候不會讓伺服器關不掉）。
 * url：執行緒要載入的模組（預設是這個模組本身）；execArgv：給執行緒的 Node 參數（預設繼承，原始碼版會有 --import tsx）。
 */
export function createRoutingPool(size: number, options: { url?: URL; execArgv?: string[] } = {}): RoutingPool {
  const url = options.url ?? new URL(import.meta.url);
  const workers: Worker[] = [];
  let nextId = 1;
  let threads: number[] = [];
  const spawn = () => {
    // stdout / stderr 不轉到伺服器的輸出（伺服器的 stdout 是和 AI 工具溝通用的）。
    const w = new Worker(url, { workerData: { role: ROLE }, argv: process.argv.slice(2), ...(options.execArgv ? { execArgv: options.execArgv } : {}), stdout: true, stderr: true });
    w.unref();
    // 執行緒意外結束時從清單拿掉，下一次用到時重新建立。
    w.on('exit', () => {
      const k = workers.indexOf(w);
      if (k >= 0) workers.splice(k, 1);
    });
    workers.push(w);
    return w;
  };
  const run = (w: Worker, job: RouteJob) =>
    new Promise<{ result: RoutingResult; threadId: number }>((resolve, reject) => {
      const id = nextId++;
      const onMessage = (msg: Response) => {
        if (msg.id !== id) return;
        cleanup();
        if (msg.ok) resolve({ result: msg.result, threadId: msg.threadId });
        else reject(new Error(msg.error));
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const onExit = (code: number) => {
        cleanup();
        reject(new Error(`佈線執行緒結束了（${code}）`));
      };
      const cleanup = () => {
        w.off('message', onMessage);
        w.off('error', onError);
        w.off('exit', onExit);
      };
      w.on('message', onMessage);
      w.on('error', onError);
      w.on('exit', onExit);
      w.postMessage({ id, job } satisfies Request);
    });
  return {
    size,
    async routeMany(jobs) {
      const lanes = Math.min(size, jobs.length);
      while (workers.length < lanes) spawn();
      const results: RoutingResult[] = new Array(jobs.length);
      const used: number[] = new Array(jobs.length);
      let next = 0;
      await Promise.all(
        workers.slice(0, lanes).map(async (w) => {
          while (next < jobs.length) {
            const k = next++;
            const r = await run(w, jobs[k]);
            results[k] = r.result;
            used[k] = r.threadId;
          }
        }),
      );
      threads = used;
      return results;
    },
    lastThreads: () => threads,
    async close() {
      await Promise.all(workers.splice(0).map((w) => w.terminate()));
    },
  };
}
