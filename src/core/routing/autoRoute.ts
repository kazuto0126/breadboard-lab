import type { Circuit, Wire } from '../../types/circuit';
import type { DeepPartial, FailedNet, FailureReason, RoutingConfig, RoutingResult } from '../../types/routing';
import { compareIds } from '../circuit/nets';
import { mergeConfig } from './config';
import { checkRoutingLegality } from './legality';
import { routeNet } from './straightNet';
import { wireCost, type SearchParams } from './straightSearch';
import { buildRoutingProblems, toPoint, type RoutingNet, type RoutingProblem } from './problem';
import { StraightState, type PlacedWire } from './straightState';
import { scoreRouting } from './score';

export function autoRoute(circuit: Circuit, overrides?: DeepPartial<RoutingConfig>): RoutingResult {
  const started = performance.now();
  const config = mergeConfig(overrides);
  const { problems, spanning } = buildRoutingProblems(circuit, config);
  const failed = new Map<string, FailedNet>();
  const outOfTime = () => performance.now() - started > config.timeBudgetMs;

  // 連到不同 Board Group 的 Net 沒有連續的板面可以走線。
  for (const { net, boardIds } of spanning) {
    failed.set(net.id, {
      netId: net.id,
      reason: 'UNROUTABLE',
      detail: `${net.id} 連到沒有貼在一起的麵包板（${boardIds.join('、')}），請先把麵包板貼合成同一個群組`,
    });
  }

  // 每個 Board Group 是一張獨立的格子，各自協商佈線。
  let iterations = 0;
  let routableCount = spanning.length;
  let wires: Wire[] = [];
  for (const problem of problems) {
    const routed = routeCanvas(problem, config, failed, outOfTime);
    iterations = Math.max(iterations, routed.iterations);
    routableCount += routed.routable;
    wires.push(...routed.wires);
  }

  // 組裝結果，交給獨立的合法性檢查把關。
  const violations = checkRoutingLegality(circuit, wires);
  for (const netId of [...new Set(violations.flatMap((v) => v.netIds))].sort(compareIds)) {
    if (failed.has(netId)) continue;
    const codes = [...new Set(violations.filter((v) => v.netIds.includes(netId)).map((v) => v.code))].join(', ');
    failed.set(netId, { netId, reason: 'LEGALITY_CHECK', detail: `${netId} 沒有通過合法性檢查（${codes}）` });
  }
  wires = wires.filter((w) => w.netId !== undefined && !failed.has(w.netId));

  const failedNets = [...failed.values()].sort((a, b) => compareIds(a.netId, b.netId));
  const status = failedNets.length === 0 ? 'success' : failedNets.length < routableCount ? 'partial' : 'failed';
  const { metrics, score } = scoreRouting(circuit, wires, overrides);
  return {
    status,
    message: status === 'success' ? 'Standard Routing Complete' : 'No valid routing solution.',
    wires,
    failedNets,
    metrics,
    score,
    stats: { iterations, elapsedMs: Math.round(performance.now() - started) },
  };
}

/** 在一張格子（一個 Board Group）上協商佈線：先允許重疊、逐輪提高成本，再在不准碰的條件下逐一改善。 */
function routeCanvas(
  problem: RoutingProblem,
  config: RoutingConfig,
  failed: Map<string, FailedNet>,
  outOfTime: () => boolean,
): { wires: Wire[]; iterations: number; routable: number } {
  const state = new StraightState(problem);
  const markFailed = (net: RoutingNet, reason: FailureReason, detail: string) => {
    state.removeNet(net.netId);
    failed.set(net.netId, { netId: net.netId, reason, detail });
  };

  const routable = problem.nets.filter((n) => n.clusters.length >= 2);
  const hard: SearchParams = { weights: config.weights, overlap: { kind: 'hard' } };
  const negotiate = (presentFactor: number): SearchParams => ({
    weights: config.weights,
    overlap: { kind: 'negotiate', overlapBase: config.negotiation.overlapBase, presentFactor },
  });

  // 1. 協商迴圈：先允許重疊，逐輪提高重疊成本，只重排有衝突的 Net。
  let active = routable;
  let toRoute = routable;
  let presentFactor = config.negotiation.presentFactor;
  let iterations = 0;
  while (toRoute.length > 0) {
    iterations++;
    for (const net of toRoute) {
      state.removeNet(net.netId);
      const result = routeNet(problem, state, net, negotiate(presentFactor));
      if (!result.ok) markFailed(net, result.reason, result.detail);
    }
    active = active.filter((n) => !failed.has(n.netId));
    const conflicts = state.conflicts();
    if (conflicts.length === 0) break;
    if (iterations >= config.negotiation.maxIterations || outOfTime()) {
      const reason: FailureReason = outOfTime() ? 'TIME_LIMIT' : 'ITERATION_LIMIT';
      active = dropConflicts(problem, state, active, hard, (net) =>
        markFailed(net, reason, `${net.netId} 在 ${iterations} 輪協商後仍無法避開其他導線`),
      );
      break;
    }
    state.bumpHistory(conflicts, config.negotiation.historyIncrement);
    presentFactor *= config.negotiation.presentFactorGrowth;
    const touched = state.netsIn(conflicts);
    toRoute = active.filter((n) => touched.has(n.netId));
  }

  // 子專案 48：拆線重接。協商後還接不上的 Net 先允許重疊接上，把擋到它的幾個 Net 拆掉、在不准碰的條件下重接；
  // 全部接得上才採用，否則還原。大電路常常只差一兩條，協商再多輪也一樣卡住。可以超過時間限制一點（REPAIR_SHARE）。
  const repairUntil = performance.now() + config.timeBudgetMs * REPAIR_SHARE;
  for (let round = 0; round < REPAIR_ROUNDS; round++) {
    let fixed = false;
    for (const net of routable) {
      if (performance.now() > repairUntil) break;
      const why = failed.get(net.netId)?.reason;
      if (why !== 'TIME_LIMIT' && why !== 'ITERATION_LIMIT' && why !== 'UNROUTABLE') continue;
      if (!ripUpAndReroute(problem, state, net, active, hard, negotiate(presentFactor))) continue;
      failed.delete(net.netId);
      active = routable.filter((n) => active.includes(n) || n === net);
      fixed = true;
    }
    if (!fixed) break;
  }

  // 2. 改善階段：其他線一律不准碰，逐一重排，總成本下降才採用。
  for (let pass = 0; pass < config.negotiation.maxImprovementPasses && !outOfTime(); pass++) {
    let improved = false;
    for (const net of active) {
      if (outOfTime()) break;
      if (rerouteIfCheaper(problem, state, net, hard)) improved = true;
    }
    if (!improved) break;
  }

  const wires = active.flatMap((net) => state.wiresOf(net.netId).map((stored, k) => toWire(problem, stored, net, k)));
  return { wires, iterations, routable: routable.length };
}

/** 把優先序最低、仍有衝突的 Net 逐一拿掉直到沒有衝突，再用嚴格模式試著放回去（優先序高的先放）。 */
function dropConflicts(
  problem: RoutingProblem,
  state: StraightState,
  active: RoutingNet[],
  hard: SearchParams,
  onFail: (net: RoutingNet) => void,
): RoutingNet[] {
  const dropped: RoutingNet[] = [];
  for (let conflicts = state.conflicts(); conflicts.length > 0; conflicts = state.conflicts()) {
    const touched = state.netsIn(conflicts);
    const victim = [...active].reverse().find((n) => touched.has(n.netId) && !dropped.includes(n));
    if (!victim) break;
    state.removeNet(victim.netId);
    dropped.push(victim);
  }
  const failedIds = new Set<string>();
  for (const net of [...dropped].reverse()) {
    const result = routeNet(problem, state, net, hard);
    if (!result.ok) {
      onFail(net);
      failedIds.add(net.netId);
    }
  }
  return active.filter((n) => !failedIds.has(n.netId));
}

/** 子專案 48：拆線重接最多拆幾個 Net、最多幾輪、最多多用時間限制的幾成。 */
const MAX_VICTIMS = 3;
const REPAIR_ROUNDS = 3;
const REPAIR_SHARE = 0.2;

/**
 * 子專案 48：允許重疊把 net 接上，拆掉和它衝突的 Net（最多 MAX_VICTIMS 個），在不准碰的條件下依原本的順序重接。
 * 全部接得上才回傳 true；否則還原成原本的線。
 */
function ripUpAndReroute(problem: RoutingProblem, state: StraightState, net: RoutingNet, active: RoutingNet[], hard: SearchParams, soft: SearchParams): boolean {
  state.removeNet(net.netId);
  const first = routeNet(problem, state, net, soft);
  if (!first.ok) return false;
  const victims = active.filter((n) => n !== net && state.netsIn(state.conflicts()).has(n.netId));
  if (victims.length > MAX_VICTIMS) {
    state.removeNet(net.netId);
    return false;
  }
  const saved = victims.map((n) => ({ net: n, wires: state.wiresOf(n.netId).map((w) => ({ ...w, cells: [...w.cells] })) }));
  for (const v of victims) state.removeNet(v.netId);
  const undo = () => {
    state.removeNet(net.netId);
    for (const v of saved) {
      state.removeNet(v.net.netId);
      for (const w of v.wires) state.addWire(w);
    }
    return false;
  };
  // 接上的線自己也不能有衝突（例如同一個 Net 的線互相經過端點）。
  if (state.conflicts().length > 0) return undo();
  for (const v of victims) if (!routeNet(problem, state, v, hard).ok) return undo();
  return true;
}

/** 在其他線都不准碰的條件下重排 net；總成本下降才保留，否則還原。 */
function rerouteIfCheaper(problem: RoutingProblem, state: StraightState, net: RoutingNet, hard: SearchParams): boolean {
  const old = state.wiresOf(net.netId).map((w) => ({ ...w, cells: [...w.cells] }));
  state.removeNet(net.netId);
  let oldCost = 0;
  for (const w of old) {
    oldCost += wireCost(problem, state, net, w, hard);
    state.addWire(w);
  }
  state.removeNet(net.netId);
  const result = routeNet(problem, state, net, hard);
  if (result.ok && result.cost < oldCost - 1e-9) return true;
  state.removeNet(net.netId);
  for (const w of old) state.addWire(w);
  return false;
}

/** 規格 2026-10-10 routing-standard：輸出的每條線都是水平或垂直的直線導線。 */
function toWire(problem: RoutingProblem, placed: PlacedWire, net: RoutingNet, k: number): Wire {
  const start = toPoint(problem, placed.a);
  const end = toPoint(problem, placed.b);
  return {
    id: `w_${net.netId}_${k + 1}`,
    color: net.color,
    source: 'auto',
    netId: net.netId,
    straight: true,
    start,
    end,
    path: [{ ...start }, { ...end }],
  };
}
