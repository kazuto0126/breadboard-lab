import type { Wire } from './circuit';
import type { ComponentInstance, Rotation } from './component';
import type { GridPoint } from './geometry';

/** 自動佈線的成本（子專案 7：直線跳線＋轉接排）。 */
export interface RoutingWeights {
  /** 每格。 */
  distance: number;
  /** 每條線（一條直線跳線）。 */
  wire: number;
  /** 每用一個新的轉接排。 */
  via: number;
  /** 每次交叉。子專案 39 起交叉不准（協商時和重疊一樣當衝突排開），佈線不再用這個權重；保留欄位讓舊的設定與 API 不變。 */
  crossing: number;
  /** 經過別的 Net 的終端空孔（保留給它們接線）。 */
  congestion: number;
}

export interface NegotiationConfig {
  overlapBase: number;
  presentFactor: number;
  presentFactorGrowth: number;
  historyIncrement: number;
  maxIterations: number;
  maxImprovementPasses: number;
}

export interface PriorityConfig {
  power: number;
  spread: number;
  scarcity: number;
}

export interface ScoringConfig {
  overlap: number;
  crossing: number;
  lengthMax: number;
  extraBend: number;
  extraBendMax: number;
  shortJog: number;
  shortJogMax: number;
}

/** 子專案 8：IC 的位置（錨點 = 第 1 腳所在的格點）。 */
export interface IcPlacement {
  boardId: string;
  anchor: { x: number; y: number };
  rotation: Rotation;
}

/** 「AI 佈線（可移動 IC）」搬動的一顆 IC。 */
export interface IcMove {
  componentId: string;
  from: IcPlacement;
  to: IcPlacement;
}

/** 找 IC 位置的設定（規格 2026-10-10 ic-placement 3.5）。 */
export interface PlacementConfig {
  /** 每顆 IC 依粗估取前幾個位置實際佈線。 */
  candidatesPerIc: number;
  /** 最多輪流幾輪。 */
  maxPasses: number;
  /** 找位置加佈線的總時間上限（ms）。 */
  timeBudgetMs: number;
  /** 候選位置的協商輪數下限：實際上限是它和「IC 都不動」所需輪數的兩倍取大，佈不出來的位置很快放棄。 */
  candidateIterations: number;
  /** 子專案 34：每個候選位置佈線前，電源腳改接最近的同極性軌（只有「轉成麵包板」打開）。 */
  nearestPowerRail: boolean;
}

export interface RoutingConfig {
  weights: RoutingWeights;
  negotiation: NegotiationConfig;
  timeBudgetMs: number;
  priority: PriorityConfig;
  scoring: ScoringConfig;
  placement: PlacementConfig;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export interface RoutingMetrics {
  wireCount: number;
  totalLength: number;
  bends: number;
  crossings: number;
  overlaps: number;
  shortJogs: number;
}

export type FailureReason = 'NO_FREE_HOLE' | 'UNROUTABLE' | 'ITERATION_LIMIT' | 'TIME_LIMIT' | 'LEGALITY_CHECK';

export interface FailedNet {
  netId: string;
  reason: FailureReason;
  detail: string;
}

export interface RoutingResult {
  status: 'success' | 'partial' | 'failed';
  message: string;
  wires: Wire[];
  failedNets: FailedNet[];
  metrics: RoutingMetrics;
  score: number;
  stats: { iterations: number; elapsedMs: number };
  /** 只有「AI 佈線（可移動 IC）」有：搬動了哪些 IC（沒有搬動時是空陣列）。 */
  moves?: IcMove[];
  /** 子專案 34：打開 nearestPowerRail 時，補上 / 拿掉的 5V、GND 符號（套用結果時一起處理）。 */
  powerSymbols?: { added: ComponentInstance[]; removed: string[] };
}

/** 需求文件第四章的佈線輸出格式（Wire 是它的超集）。 */
export interface RoutingPath {
  netId: string;
  start: GridPoint;
  end: GridPoint;
  path: GridPoint[];
}

/** CROSSING：子專案 39，兩條線十字交叉。 */
export type LegalityCode = 'PATH_INVALID' | 'ENDPOINT_INVALID' | 'THROUGH_OBSTACLE' | 'OVERLAP' | 'CROSSING' | 'NET_MISMATCH';

export interface LegalityViolation {
  code: LegalityCode;
  wireIds: string[];
  netIds: string[];
  detail: string;
}
