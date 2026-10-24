import type { Circuit } from '../types/circuit';
import type { DeepPartial, RoutingConfig, RoutingResult } from '../types/routing';

/** 主執行緒 → Worker：佈線。 */
export interface RoutingRequest {
  kind?: 'route';
  id: number;
  circuit: Circuit;
  config?: DeepPartial<RoutingConfig>;
  /** true：「AI 佈線（可移動 IC）」。 */
  moveIcs?: boolean;
  /** 子專案 41：可移動 IC 時，從這個結果接著搬（轉成麵包板把快速試的結果排到最好）。 */
  from?: RoutingResult;
}

export type WorkerRequest = RoutingRequest;

/** Worker → 主執行緒。 */
export type RoutingResponse = { id: number; ok: true; result: RoutingResult } | { id: number; ok: false; error: string };
export type WorkerResponse = RoutingResponse;
