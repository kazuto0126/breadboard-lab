import type { Circuit, Wire } from '../../types/circuit';
import type { DeepPartial, FailedNet, FailureReason, RoutingConfig, RoutingResult } from '../../types/routing';
import { compareIds } from '../circuit/nets';
import { evaluatePath, type SearchParams } from './astar';
import { mergeConfig } from './config';
import { checkRoutingLegality } from './legality';
import { routeNet } from './netTree';
import { buildRoutingProblems, toPoint, type RoutingNet, type RoutingProblem } from './problem';
import { RouteState, type StoredWire } from './routeState';
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
  const state = new RouteState(problem.size);
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
    const conflicts = state.conflictedNodes();
    if (conflicts.length === 0) break;
    if (iterations >= config.negotiation.maxIterations || outOfTime()) {
      const reason: FailureReason = outOfTime() ? 'TIME_LIMIT' : 'ITERATION_LIMIT';
      active = dropConflicts(problem, state, active, hard, (net) =>
        markFailed(net, reason, `${net.netId} 在 ${iterations} 輪協商後仍無法避開其他導線`),
      );
      break;
    }
    for (const node of conflicts) state.history[node] += config.negotiation.historyIncrement;
    presentFactor *= config.negotiation.presentFactorGrowth;
    const touched = state.netsAt(conflicts);
    toRoute = active.filter((n) => touched.has(n.netId));
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
  state: RouteState,
  active: RoutingNet[],
  hard: SearchParams,
  onFail: (net: RoutingNet) => void,
): RoutingNet[] {
  const dropped: RoutingNet[] = [];
  for (let conflicts = state.conflictedNodes(); conflicts.length > 0; conflicts = state.conflictedNodes()) {
    const touched = state.netsAt(conflicts);
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

/** 在其他線都不准碰的條件下重排 net；總成本下降才保留，否則還原。 */
function rerouteIfCheaper(problem: RoutingProblem, state: RouteState, net: RoutingNet, hard: SearchParams): boolean {
  const old = state.wiresOf(net.netId).map((w) => ({ ...w, path: [...w.path] }));
  state.removeNet(net.netId);
  let oldCost = 0;
  for (const w of old) {
    oldCost += evaluatePath(problem, state, w.path, hard);
    state.addWire(w);
  }
  state.removeNet(net.netId);
  const result = routeNet(problem, state, net, hard);
  if (result.ok && result.cost < oldCost - 1e-9) return true;
  state.removeNet(net.netId);
  for (const w of old) state.addWire(w);
  return false;
}

function toWire(problem: RoutingProblem, stored: StoredWire, net: RoutingNet, k: number): Wire {
  const path = stored.path.map((i) => toPoint(problem, i));
  return {
    id: `w_${net.netId}_${k + 1}`,
    color: net.color,
    source: 'auto',
    netId: net.netId,
    start: path[0],
    end: path[path.length - 1],
    path,
  };
}
