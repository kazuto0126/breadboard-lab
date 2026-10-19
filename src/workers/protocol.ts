import type { ConvertRouted } from '../logic/convertRoute';
import type { ConvertOptions } from '../logic/toBreadboard';
import type { LogicDiagram } from '../logic/types';
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
}

/** 主執行緒 → Worker：子專案 36，邏輯圖轉成麵包板（試好幾種擺法，挑佈線最好的）。 */
export interface ConversionRequest {
  kind: 'convert';
  id: number;
  diagram: LogicDiagram;
  options: ConvertOptions;
}

export type WorkerRequest = RoutingRequest | ConversionRequest;

/** Worker → 主執行緒。 */
export type RoutingResponse = { id: number; ok: true; result: RoutingResult } | { id: number; ok: false; error: string };
export type ConversionResponse = { id: number; ok: true; converted: ConvertRouted } | { id: number; ok: false; error: string };
export type WorkerResponse = RoutingResponse | ConversionResponse;
