import type { Wire } from './circuit';
import type { GridPoint } from './geometry';

/** 自動佈線的成本（子專案 7：直線跳線＋轉接排）。 */
export interface RoutingWeights {
  /** 每格。 */
  distance: number;
  /** 每條線（一條直線跳線）。 */
  wire: number;
  /** 每用一個新的轉接排。 */
  via: number;
  /** 每次交叉。 */
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

export interface RoutingConfig {
  weights: RoutingWeights;
  negotiation: NegotiationConfig;
  timeBudgetMs: number;
  priority: PriorityConfig;
  scoring: ScoringConfig;
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
}

/** 需求文件第四章的佈線輸出格式（Wire 是它的超集）。 */
export interface RoutingPath {
  netId: string;
  start: GridPoint;
  end: GridPoint;
  path: GridPoint[];
}

export type LegalityCode = 'PATH_INVALID' | 'ENDPOINT_INVALID' | 'THROUGH_OBSTACLE' | 'OVERLAP' | 'NET_MISMATCH';

export interface LegalityViolation {
  code: LegalityCode;
  wireIds: string[];
  netIds: string[];
  detail: string;
}
