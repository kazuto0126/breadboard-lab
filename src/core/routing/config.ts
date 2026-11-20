import type { DeepPartial, RoutingConfig } from '../../types/routing';

/** 起始值；Task 14 會用固定測試電路校準。 */
export const DEFAULT_ROUTING_CONFIG: RoutingConfig = {
  // 子專案 7 校準：經過別的 Net 終端空孔的成本 20 會讓線為了避開它繞好幾個轉接排，2 就夠保留空孔；協商輪數 60 → 150（計數器範例需要約 70 輪）。
  // 子專案 67（規格 2026-11-20 fewer-wires）：每條線的成本 6 → 60，寧可走長一點也少轉彎、少接轉接排。2026-11-20 量測（npm run bench:convert）：
  // 解碼器 34 → 31 條、編碼器（下拉電阻）65 → 57、兩個顯示器 100 → 82、6 輸入 3 輸出 153 → 131、6 輸入 4 輸出從兩塊板 186 條變成一塊板 159 條、
  // 十進制加法器 235 → 204；三個顯示器 141 → 177（還排得完；20、30、40 時排不完）。重疊成本跟著調高（500）時衝突排不開，所以不動。
  weights: { distance: 1, wire: 60, via: 3, crossing: 1000, congestion: 2, rail: 200 },
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
  placement: { candidatesPerIc: 3, maxPasses: 2, timeBudgetMs: 20000, candidateIterations: 30, nearestPowerRail: false },
};

export function mergeConfig(overrides?: DeepPartial<RoutingConfig>): RoutingConfig {
  const d = DEFAULT_ROUTING_CONFIG;
  return {
    weights: { ...d.weights, ...overrides?.weights },
    negotiation: { ...d.negotiation, ...overrides?.negotiation },
    timeBudgetMs: overrides?.timeBudgetMs ?? d.timeBudgetMs,
    priority: { ...d.priority, ...overrides?.priority },
    scoring: { ...d.scoring, ...overrides?.scoring },
    placement: { ...d.placement, ...overrides?.placement },
  };
}
