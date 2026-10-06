import type { Circuit } from '../types/circuit';
import type { DeepPartial, RoutingConfig, RoutingResult } from '../types/routing';

/** 主執行緒 → Worker。 */
export interface RoutingRequest {
  id: number;
  circuit: Circuit;
  config?: DeepPartial<RoutingConfig>;
}

/** Worker → 主執行緒。 */
export type RoutingResponse = { id: number; ok: true; result: RoutingResult } | { id: number; ok: false; error: string };
