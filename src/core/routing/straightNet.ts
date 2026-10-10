import type { FailureReason } from '../../types/routing';
import { describeGroup, type RoutingNet, type RoutingProblem } from './problem';
import { findRoute, type SearchParams } from './straightSearch';
import type { StraightState } from './straightState';

export type NetRouteResult = { ok: true; cost: number } | { ok: false; reason: FailureReason; detail: string };

/**
 * 規格 2.2：Prim 式生成樹。每次從「已連上的排」（終端排與用過的轉接排）找一串直線到任一還沒連上的簇，
 * 把線加進 state。呼叫前 state 裡不能有這個 Net 的線。
 */
export function routeNet(problem: RoutingProblem, state: StraightState, net: RoutingNet, params: SearchParams): NetRouteResult {
  const holesOf = (cluster: string[]) => cluster.flatMap((g) => problem.freeHoles.get(g) ?? []);
  const multiBoard = problem.boardIds.length > 1;
  const describe = (cluster: string[]) => cluster.map((g) => describeGroup(g, multiBoard)).join('＋');
  const full = net.clusters.find((cl) => holesOf(cl).length === 0);
  if (full) return { ok: false, reason: 'NO_FREE_HOLE', detail: `${describe(full)}沒有空孔可以接線` };

  const clusterOf = new Map<string, number>();
  net.clusters.forEach((cl, i) => cl.forEach((g) => clusterOf.set(g, i)));
  const connected = new Set(net.clusters[net.startCluster]);
  const remaining = new Set(net.clusters.map((_, i) => i).filter((i) => i !== net.startCluster));
  let cost = 0;
  let k = 0;
  while (remaining.size > 0) {
    const targets = new Set([...remaining].flatMap((i) => net.clusters[i]));
    const found = findRoute(problem, state, net, connected, targets, params);
    if (!found) {
      state.removeNet(net.netId);
      const missing = [...remaining].map((i) => describe(net.clusters[i])).join('、');
      return { ok: false, reason: 'UNROUTABLE', detail: `${net.netId} 無法連到 ${missing}` };
    }
    for (const line of found.wires) {
      state.addWire({ id: `${net.netId}#${k++}`, netId: net.netId, ...line });
      for (const end of [line.a, line.b]) {
        const g = problem.groupAt[end]!;
        if (!clusterOf.has(g)) connected.add(g);
      }
    }
    cost += found.cost;
    const reached = clusterOf.get(problem.groupAt[found.wires[found.wires.length - 1].b]!)!;
    for (const g of net.clusters[reached]) connected.add(g);
    remaining.delete(reached);
  }
  return { ok: true, cost };
}
