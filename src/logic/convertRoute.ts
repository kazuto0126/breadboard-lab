import { autoPlaceAndRoute, isBetterRouting } from '../core/icPlacement/autoPlace';
import type { LayoutId } from '../types/board';
import type { RoutingResult } from '../types/routing';
import { convertProblem } from './synth';
import { DEFAULT_LAYOUT, toBreadboard, type ConvertOptions, type ConvertResult, type LayoutVariant } from './toBreadboard';
import type { LogicDiagram } from './types';

/**
 * 子專案 36（規格 2026-10-20 conversion-placement）：「轉成麵包板」試好幾種擺法，每一種用「可移動 IC」的佈線在短時間內試一次，
 * 挑最好的（接不完的線少 → 交叉少（子專案 39 起一定是 0）→ 線少 → 總長短），再用剩下的時間把它排到最好。自動選板時 MB-102 都排不完才換 EIC-1106。
 * 純函式（網頁在佈線 Worker 裡跑、MCP 直接呼叫）。
 */

export type ConvertSuccess = Extract<ConvertResult, { ok: true }>;
export type ConvertRouted = { ok: true; result: ConvertSuccess; routed: RoutingResult; tried: number } | { ok: false; reason: string };

/**
 * 每塊板試的擺法（預設的先試；擺出來一樣的只試一次）。2026-10-20 量測：小電路在 MB-102 上間隔 2、3 最好（比較器 37 → 25 條線），
 * 解碼器要 LED 分兩邊才排得進 MB-102；EIC-1106 上「跨凹槽」的 LED、間隔 3、4 最好（編碼器 73 → 63 條）。
 * 全部組合都試的話時間不夠（大電路「可移動 IC」佈線一次要 15–20 秒），所以只試量測過比較好的幾種。
 */
export const LAYOUT_VARIANTS: Record<LayoutId, LayoutVariant[]> = {
  MB102: [
    DEFAULT_LAYOUT,
    { gap: 2, leds: 'pair', split: false },
    { gap: 3, leds: 'pair', split: false },
    { gap: 3, leds: 'straddle', split: false },
    { gap: 3, leds: 'straddle', split: true },
    { gap: 2, leds: 'pair', split: true },
    // 子專案 38：加上電阻、輸入超過 4 個時開關拆成兩個 4 位元（其他時候和上面的擺法一樣，不會重複試）。
    { gap: 2, leds: 'pair', split: false, splitSwitches: true },
  ],
  // 子專案 38：一排擺法（全部在第 2 區，上下兩區留給跨線）與兩個 4 位元開關；2026-10-19 量測：編碼器 73 → 62 條線，加上下拉電阻 81 → 58 條。
  EIC1106: [
    DEFAULT_LAYOUT,
    { gap: 3, leds: 'straddle', split: false, oneRow: true },
    { gap: 2, leds: 'pair', split: false, oneRow: true },
    { gap: 2, leds: 'pair', split: false, oneRow: true, splitSwitches: true },
    { gap: 3, leds: 'straddle', split: false, oneRow: true, splitSwitches: true },
    { gap: 4, leds: 'straddle', split: false },
    { gap: 3, leds: 'straddle', split: false },
    { gap: 2, leds: 'pair', split: false },
  ],
};

/** 總時間預設 40 秒：每塊板先用短時間試每一種擺法（每種最多 4 秒），剩下的時間給最好的兩種。 */
const TOTAL_MS = 40_000;
const MIN_QUICK_MS = 300;
const MAX_QUICK_MS = 4_000;
const POLISHED = 2;
/**
 * 不是最後一塊板、快速試都排不完，但最好的那一種只差這麼幾條：還是花時間把它排完再決定要不要換板。
 * 慢的電腦（或很忙的時候）快速試的時間不夠，小電路常常只差 1 條（2026-10-20 量測：比較器差 1 條、編碼器差 4–5 條）。
 */
const CLOSE_NETS = 2;

/** route：佈線用的函式（測試時換成假的，不用真的等時間）。 */
export function convertAndRoute(d: LogicDiagram, options: ConvertOptions, budget: { totalMs?: number } = {}, route: typeof autoPlaceAndRoute = autoPlaceAndRoute): ConvertRouted {
  const problem = convertProblem(d);
  if (problem) return { ok: false, reason: problem };
  const total = budget.totalMs ?? TOTAL_MS;
  const started = performance.now();
  const hasDisplay = d.nodes.some((n) => n.kind === 'DISPLAY');
  const boards: LayoutId[] = options.board !== 'auto' ? [options.board] : hasDisplay ? ['EIC1106'] : ['MB102', 'EIC1106'];
  const power = { nearestPowerRail: true };
  let tried = 0;
  let failure = '';

  for (const [i, board] of boards.entries()) {
    const candidates: ConvertSuccess[] = [];
    const seen = new Set<string>();
    for (const variant of LAYOUT_VARIANTS[board]) {
      const r = toBreadboard(d, { ...options, board }, variant);
      if (!r.ok) {
        failure = r.reason;
        continue;
      }
      const key = JSON.stringify(r.circuit.components.map((c) => [c.id, c.anchor.x, c.anchor.y, c.rotation, c.span ?? 0]));
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(r);
    }
    if (candidates.length === 0) continue;

    const boardStart = performance.now();
    const boardMs = Math.max(0, (total - (boardStart - started)) / (boards.length - i));
    const quickMs = Math.min(MAX_QUICK_MS, Math.max(MIN_QUICK_MS, (boardMs * 0.4) / candidates.length));
    const ranked: Array<{ result: ConvertSuccess; routed: RoutingResult }> = [];
    for (const result of candidates) {
      tried++;
      // 子專案 38：佈線器本身也限時（排不完的擺法它會一直重排到自己的上限 5 秒，MB-102 上的大電路每種要 3–5 秒）。
      ranked.push({ result, routed: route(result.circuit, { timeBudgetMs: quickMs, placement: { ...power, timeBudgetMs: quickMs, maxPasses: 1 } }) });
    }
    // 好的排前面（同分時保持試的順序）。
    ranked.sort((a, b) => (isBetterRouting(a.routed, b.routed) ? -1 : isBetterRouting(b.routed, a.routed) ? 1 : 0));
    let best = ranked[0];
    const last = i === boards.length - 1;
    // 不是最後一塊板、試的時候就差很多條排不完：直接換下一塊板，把時間留給它。
    // 只差幾條時只排最好的一種，時間至少用剩下的一半（快速試常常超過給的時間，這塊板分到的時間可能已經用完）。
    const close = best.routed.status !== 'success' && best.routed.failedNets.length <= CLOSE_NETS;
    if (last || best.routed.status === 'success' || close) {
      const top = ranked.slice(0, last || !close ? POLISHED : 1);
      const until = last || !close ? boardStart + boardMs : Math.max(boardStart + boardMs, (performance.now() + started + total) / 2);
      for (const [k, entry] of top.entries()) {
        const polishMs = (until - performance.now()) / (top.length - k);
        if (polishMs <= MIN_QUICK_MS) break;
        const polished = route(entry.result.circuit, { placement: { ...power, timeBudgetMs: polishMs } });
        const routed = isBetterRouting(polished, entry.routed) ? polished : entry.routed;
        if (isBetterRouting(routed, best.routed) || entry === best) best = { result: entry.result, routed };
      }
    }
    if (best.routed.status === 'success' || last) return { ok: true, result: best.result, routed: best.routed, tried };
  }
  return { ok: false, reason: failure || '轉換失敗：沒有放得下的擺法' };
}
