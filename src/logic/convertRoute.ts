import { autoPlaceAndRoute } from '../core/icPlacement/autoPlace';
import { applyRouting } from '../core/routing/apply';
import { occupiedArea } from '../core/routing/area';
import type { LayoutId } from '../types/board';
import type { Circuit } from '../types/circuit';
import type { DeepPartial, RoutingConfig, RoutingResult } from '../types/routing';
import { convertProblem } from './synth';
import { DEFAULT_LAYOUT, TWO_BOARD_DISPLAY_LAYOUT, TWO_BOARD_LAYOUT, needsTwoBoards, toBreadboard, type ConvertOptions, type ConvertResult, type LayoutVariant } from './toBreadboard';
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
    // 子專案 48：IC 照 orderIcs 排（有接線的 IC 靠在一起；順序和原本一樣時擺出來一樣，不會重複試）。
    { gap: 2, leds: 'pair', split: false, orderIcs: true },
    { gap: 3, leds: 'straddle', split: false, orderIcs: true },
    // 子專案 60（指南 3.7）：LED 直立、一腳直接插進電源軌（每顆省一條線、只佔 1 欄）。2026-11-11 量測：圖 10-14 的閂鎖 23 → 20 條線、23 → 20 欄。
    { gap: 2, leds: 'rail', split: false },
    { gap: 3, leds: 'rail', split: false },
    // 子專案 60（指南 3.2）：互相沒有訊號相連的子電路各自成一組（只有一個子電路時和上面一樣，不會重複試）。
    { gap: 2, leds: 'rail', split: false, parts: true },
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
    // 子專案 48：IC 照 orderIcs 排。2026-10-25 量測：6 個輸入、4 個輸出、6 顆 IC 的電路從差 8 條變成一塊板排得完。
    { gap: 4, leds: 'straddle', split: false, orderIcs: true },
    { gap: 3, leds: 'straddle', split: false, orderIcs: true },
    { gap: 6, leds: 'pair', split: false, orderIcs: true },
    // 子專案 60：LED 直插電源軌、子電路分組。2026-11-11 量測：圖 10-14～10-17 四題合成一張圖（12 個輸入、5 顆 IC），
    // 照名稱排在兩個開關時 300 秒還差 2 條；分組後 8 秒排完（102 條線，用到兩區）。
    // LED 直插電源軌只放在分組的擺法裡：大電路在 EIC-1106 上多試兩種不分組的沒有比較好，還佔掉後面的時間。
    { gap: 3, leds: 'rail', split: false, parts: true },
    { gap: 4, leds: 'straddle', split: false, parts: true },
  ],
};

/** 子專案 48：兩塊 EIC-1106 左右貼在一起時試的擺法（一塊板接不完的大電路）。 */
export const TWO_BOARD_VARIANTS: LayoutVariant[] = [
  TWO_BOARD_LAYOUT,
  { gap: 9, leds: 'pair', split: false, boards: 2, orderIcs: true },
  { gap: 6, leds: 'straddle', split: false, boards: 2, orderIcs: true },
  { gap: 6, leds: 'pair', split: false, boards: 2 },
  // 子專案 49：每個 7 段顯示器和它的解碼 IC 放在同一塊板（沒有顯示器時和上面一樣，不會重複試）。
  TWO_BOARD_DISPLAY_LAYOUT,
  { gap: 3, leds: 'pair', split: false, boards: 2, displayBoards: true },
];

/** 總時間預設 40 秒：每塊板先用短時間試每一種擺法（每種最多 4 秒），剩下的時間給最好的兩種。 */
const TOTAL_MS = 40_000;
/**
 * 子專案 54：用到兩塊 EIC-1106 的大電路多給的時間（沒有指定總時間時）。2026-11-02 量測：圖 8-8 的十進制加法器
 * （兩顆 74LS83、兩顆 74LS47、兩個顯示器）一次跑一件時 40 秒差 1 條、90 秒排完（257 條線）。
 */
const TWO_BOARD_EXTRA_MS = 50_000;
const MIN_QUICK_MS = 300;
const MAX_QUICK_MS = 4_000;
const POLISHED = 2;
/**
 * 不是最後一塊板、快速試都排不完，但最好的那一種只差這麼幾條：還是花時間把它排完再決定要不要換板。
 * 慢的電腦（或很忙的時候）快速試的時間不夠，小電路常常只差 1 條（2026-10-20 量測：比較器差 1 條、編碼器差 4–5 條）。
 */
const CLOSE_NETS = 2;

/**
 * 子專案 61（指南 1、3.6：先縮小占用面積，再減少線數）：兩種擺法的佈線哪個好：接不完的線少 → 交叉少 → 佔用面積小 → 線少 → 總長短。
 * 面積是元件和導線實際佔用的範圍（全域格子的外框）。
 */
export function isBetterConversion(a: { result: ConvertSuccess; routed: RoutingResult }, b: { result: ConvertSuccess; routed: RoutingResult }): boolean {
  const area = (e: { result: ConvertSuccess; routed: RoutingResult }) =>
    occupiedArea(e.routed.status === 'success' ? applyRouting(e.result.circuit, e.routed) : { ...e.result.circuit, wires: e.routed.wires }).cells;
  const key = (e: { result: ConvertSuccess; routed: RoutingResult }) => [e.routed.failedNets.length, e.routed.metrics.crossings, area(e), e.routed.metrics.wireCount, e.routed.metrics.totalLength];
  const ka = key(a);
  const kb = key(b);
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i];
  return false;
}

/** 一次佈線（可移動 IC）：from 是之前的結果，從它接著搬。 */
export interface RouteJob {
  circuit: Circuit;
  config: DeepPartial<RoutingConfig>;
  from?: RoutingResult;
}

/**
 * 子專案 41（規格 2026-10-24 faster-conversion）：轉換的步驟。每次 yield 一批互不相關的佈線（同一塊板的快速試、要排到最好的那幾種），
 * 拿到這一批的結果再往下走。parallel：同時能跑幾件（網頁用好幾個 Worker；MCP 一次一件），只影響時間怎麼分，每件分到的時間和一次一件時一樣。
 */
export function* convertSteps(d: LogicDiagram, options: ConvertOptions, budget: { totalMs?: number } = {}, parallel = 1): Generator<RouteJob[], ConvertRouted, RoutingResult[]> {
  const problem = convertProblem(d, options);
  if (problem) return { ok: false, reason: problem };
  let total = budget.totalMs ?? TOTAL_MS;
  const started = performance.now();
  const hasDisplay = d.nodes.some((n) => n.kind === 'DISPLAY');
  // 子專案 48：自動選板時最後試兩塊 EIC-1106（一塊板接不完時）。
  const single = (layout: LayoutId) => ({ layout, variants: LAYOUT_VARIANTS[layout] });
  // 子專案 49：顯示器多到一塊 EIC-1106 放不下時只試兩塊。
  const two = { layout: 'EIC1106' as const, variants: TWO_BOARD_VARIANTS };
  const boards = options.board !== 'auto' ? [single(options.board)] : needsTwoBoards(d, options) ? [two] : [...(hasDisplay ? [] : [single('MB102')]), single('EIC1106'), two];
  const power = { nearestPowerRail: true };
  const lanes = Math.max(1, Math.floor(parallel));
  let tried = 0;
  let failure = '';

  for (const [i, { layout: board, variants }] of boards.entries()) {
    if (variants === TWO_BOARD_VARIANTS && budget.totalMs === undefined) total += TWO_BOARD_EXTRA_MS;
    const candidates: ConvertSuccess[] = [];
    const seen = new Set<string>();
    for (const variant of variants) {
      const r = toBreadboard(d, { ...options, board }, variant);
      if (!r.ok) {
        // 子專案 60：不適用的擺法（分組但只有一個子電路）沒有原因，不算失敗。
        if (r.reason) failure = r.reason;
        continue;
      }
      const key = JSON.stringify(r.circuit.components.map((c) => [c.id, c.boardId, c.anchor.x, c.anchor.y, c.rotation, c.span ?? 0]));
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(r);
    }
    if (candidates.length === 0) continue;

    const boardStart = performance.now();
    const boardMs = Math.max(0, (total - (boardStart - started)) / (boards.length - i));
    const quickMs = Math.min(MAX_QUICK_MS, Math.max(MIN_QUICK_MS, (boardMs * 0.4) / candidates.length));
    tried += candidates.length;
    // 子專案 38：佈線器本身也限時（排不完的擺法它會一直重排到自己的上限 5 秒，MB-102 上的大電路每種要 3–5 秒）。
    const quick: RoutingResult[] = yield candidates.map((result) => ({ circuit: result.circuit, config: { timeBudgetMs: quickMs, placement: { ...power, timeBudgetMs: quickMs, maxPasses: 1 } } }));
    const ranked = candidates.map((result, k) => ({ result, routed: quick[k] }));
    // 好的排前面（同分時保持試的順序）。
    ranked.sort((a, b) => (isBetterConversion(a, b) ? -1 : isBetterConversion(b, a) ? 1 : 0));
    let best = ranked[0];
    const last = i === boards.length - 1;
    // 不是最後一塊板、試的時候就差很多條排不完：直接換下一塊板，把時間留給它。
    // 只差幾條時只排最好的一種，時間至少用剩下的一半（快速試常常超過給的時間，這塊板分到的時間可能已經用完）。
    const close = best.routed.status !== 'success' && best.routed.failedNets.length <= CLOSE_NETS;
    if (last || best.routed.status === 'success' || close) {
      const top = ranked.slice(0, last || !close ? POLISHED : 1);
      const until = last || !close ? boardStart + boardMs : Math.max(boardStart + boardMs, (performance.now() + started + total) / 2);
      // 一次一件時剩下的時間依序分（前一種提早排完，多的時間給下一種）；可以同時跑時一起排，每一種分到的時間和一次一件時第一種一樣。
      const together = lanes >= top.length;
      for (let k = 0; k < top.length; k += together ? top.length : 1) {
        const group = together ? top : [top[k]];
        const polishMs = (until - performance.now()) / (top.length - k);
        if (polishMs <= MIN_QUICK_MS) break;
        // 從快速試的結果接著搬（不重做快速試已經做過的那一輪）。
        const polished: RoutingResult[] = yield group.map((entry) => ({ circuit: entry.result.circuit, config: { placement: { ...power, timeBudgetMs: polishMs } }, from: entry.routed }));
        for (const [j, entry] of group.entries()) {
          const routed = isBetterConversion({ result: entry.result, routed: polished[j] }, entry) ? polished[j] : entry.routed;
          if (isBetterConversion({ result: entry.result, routed }, best) || entry === best) best = { result: entry.result, routed };
        }
      }
    }
    if (best.routed.status === 'success' || last) return { ok: true, result: best.result, routed: best.routed, tried };
  }
  return { ok: false, reason: failure || '轉換失敗：沒有放得下的擺法' };
}

/** 一次跑一件（MCP、測試、沒有 Worker 的環境）。route：佈線用的函式（測試時換成假的，不用真的等時間）。 */
export function convertAndRoute(d: LogicDiagram, options: ConvertOptions, budget: { totalMs?: number } = {}, route: typeof autoPlaceAndRoute = autoPlaceAndRoute): ConvertRouted {
  const steps = convertSteps(d, options, budget, 1);
  let step = steps.next();
  while (!step.done) step = steps.next(step.value.map((job) => route(job.circuit, job.config, job.from)));
  return step.value;
}

/** 同時跑好幾件（網頁：每一批交給 routeMany，例如分給好幾個 Worker）。 */
export async function convertAndRouteParallel(
  d: LogicDiagram,
  options: ConvertOptions,
  routeMany: (jobs: RouteJob[]) => Promise<RoutingResult[]>,
  parallel: number,
  budget: { totalMs?: number } = {},
): Promise<ConvertRouted> {
  const steps = convertSteps(d, options, budget, parallel);
  let step = steps.next();
  while (!step.done) step = steps.next(await routeMany(step.value));
  return step.value;
}
