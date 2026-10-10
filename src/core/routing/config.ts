import type { DeepPartial, RoutingConfig } from '../../types/routing';

/** 起始值；Task 14 會用固定測試電路校準。 */
export const DEFAULT_ROUTING_CONFIG: RoutingConfig = {
  // 子專案 7 校準：經過別的 Net 終端空孔的成本 20 會讓線為了避開它繞好幾個轉接排，2 就夠保留空孔；協商輪數 60 → 150（計數器範例需要約 70 輪）。
  weights: { distance: 1, wire: 6, via: 3, crossing: 1000, congestion: 2 },
  negotiation: {
    overlapBase: 50,
    presentFactor: 0.5,
    presentFactorGrowth: 1.6,
    historyIncrement: 1,
    maxIterations: 150,
    maxImprovementPasses: 3,
  },
  timeBudgetMs: 5000,
  priority: { power: 1000, spread: 10, scarcity: 100 },
  scoring: { overlap: 30, crossing: 8, lengthMax: 20, extraBend: 1.5, extraBendMax: 15, shortJog: 2, shortJogMax: 10 },
};

export function mergeConfig(overrides?: DeepPartial<RoutingConfig>): RoutingConfig {
  const d = DEFAULT_ROUTING_CONFIG;
  return {
    weights: { ...d.weights, ...overrides?.weights },
    negotiation: { ...d.negotiation, ...overrides?.negotiation },
    timeBudgetMs: overrides?.timeBudgetMs ?? d.timeBudgetMs,
    priority: { ...d.priority, ...overrides?.priority },
    scoring: { ...d.scoring, ...overrides?.scoring },
  };
}
