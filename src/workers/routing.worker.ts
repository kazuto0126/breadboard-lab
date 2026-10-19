import { autoPlaceAndRoute } from '../core/icPlacement/autoPlace';
import { autoRoute } from '../core/routing/autoRoute';
import { convertAndRoute } from '../logic/convertRoute';
import type { WorkerRequest, WorkerResponse } from './protocol';

// 在 Worker 執行緒中跑佈線，避免大型電路的計算卡住畫面（需求文件第二十九章）。
// 子專案 36：「轉成麵包板」也在這裡跑（會試好幾種擺法，大電路要十幾秒）。
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
};

scope.onmessage = (event) => {
  const request = event.data;
  try {
    if (request.kind === 'convert') scope.postMessage({ id: request.id, ok: true, converted: convertAndRoute(request.diagram, request.options) });
    else scope.postMessage({ id: request.id, ok: true, result: request.moveIcs ? autoPlaceAndRoute(request.circuit, request.config) : autoRoute(request.circuit, request.config) });
  } catch (err) {
    scope.postMessage({ id: request.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
