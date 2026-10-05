import type { DeepPartial, RoutingConfig } from '../../types/routing';

/** 起始值；Task 14 會用固定測試電路校準。 */
export const DEFAULT_ROUTING_CONFIG: RoutingConfig = {
  weights: { distance: 1, bend: 5, crossing: 1000, congestion: 20, aesthetic: 10 },
  negotiation: {
    overlapBase: 50,
    presentFactor: 0.5,
    presentFactorGrowth: 1.6,
    historyIncrement: 1,
    maxIterations: 60,
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
