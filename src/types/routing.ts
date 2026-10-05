import type { Wire } from './circuit';
import type { GridPoint } from './geometry';

export interface RoutingWeights {
  distance: number;
  bend: number;
  crossing: number;
  congestion: number;
  aesthetic: number;
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

/** A* 的搜尋狀態（除錯用）。 */
export interface RoutingNode {
  index: number;
  direction: number;
  longRun: boolean;
  firstSegment: boolean;
}

export type LegalityCode = 'PATH_INVALID' | 'ENDPOINT_INVALID' | 'THROUGH_OBSTACLE' | 'OVERLAP' | 'NET_MISMATCH';

export interface LegalityViolation {
  code: LegalityCode;
  wireIds: string[];
  netIds: string[];
  detail: string;
}
