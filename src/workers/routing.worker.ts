import { autoPlaceAndRoute } from '../core/icPlacement/autoPlace';
import { autoRoute } from '../core/routing/autoRoute';
import type { WorkerRequest, WorkerResponse } from './protocol';

// 在 Worker 執行緒中跑佈線，避免大型電路的計算卡住畫面（需求文件第二十九章）。
// 子專案 41：「轉成麵包板」由主執行緒分派，好幾個 Worker 同時各跑一種擺法。
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
};

scope.onmessage = (event) => {
  const request = event.data;
  try {
    scope.postMessage({ id: request.id, ok: true, result: request.moveIcs ? autoPlaceAndRoute(request.circuit, request.config, request.from) : autoRoute(request.circuit, request.config) });
  } catch (err) {
    scope.postMessage({ id: request.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
