import { autoRoute } from '../core/routing/autoRoute';
import type { RoutingRequest, RoutingResponse } from './protocol';

// 在 Worker 執行緒中跑佈線，避免大型電路的計算卡住畫面（需求文件第二十九章）。
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<RoutingRequest>) => void) | null;
  postMessage(message: RoutingResponse): void;
};

scope.onmessage = (event) => {
  const { id, circuit, config } = event.data;
  try {
    scope.postMessage({ id, ok: true, result: autoRoute(circuit, config) });
  } catch (err) {
    scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
