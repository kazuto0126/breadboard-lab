import type { FailureReason } from '../../types/routing';
import { findWire, type SearchParams } from './astar';
import { describeGroup, type RoutingNet, type RoutingProblem } from './problem';
import type { RouteState } from './routeState';

export type NetRouteResult =
  | { ok: true; cost: number; paths: number[][] }
  | { ok: false; reason: FailureReason; detail: string };

/**
 * 用 Prim 式貪婪法把 net 的終端群組簇連成一棵樹：每次找出「已連通部分 → 任一未連通簇」中最便宜的一條線。
 * 呼叫前 state 裡不能有這個 net 的線。
 */
export function routeNet(problem: RoutingProblem, state: RouteState, net: RoutingNet, params: SearchParams): NetRouteResult {
  const holesOf = (cluster: string[]) => cluster.flatMap((g) => problem.freeHoles.get(g) ?? []);
  const describe = (cluster: string[]) => cluster.map(describeGroup).join('＋');
  const full = net.clusters.find((cl) => holesOf(cl).length === 0);
  if (full) return { ok: false, reason: 'NO_FREE_HOLE', detail: `${describe(full)}沒有空孔可以接線` };

  const clusterOf = new Map<string, number>();
  net.clusters.forEach((cl, i) => cl.forEach((g) => clusterOf.set(g, i)));
  const connected = new Set([net.startCluster]);
  const remaining = new Set(net.clusters.map((_, i) => i).filter((i) => i !== net.startCluster));
  const paths: number[][] = [];
  let cost = 0;
  while (remaining.size > 0) {
    const sources = [...connected].flatMap((i) => holesOf(net.clusters[i]));
    const targets = [...remaining].flatMap((i) => holesOf(net.clusters[i]));
    const found = findWire(problem, state, sources, targets, params);
    if (!found) {
      state.removeNet(net.netId);
      const missing = [...remaining].map((i) => describe(net.clusters[i])).join('、');
      return { ok: false, reason: 'UNROUTABLE', detail: `${net.netId} 無法連到 ${missing}` };
    }
    state.addWire({ id: `${net.netId}#${paths.length}`, netId: net.netId, path: found.path });
    paths.push(found.path);
    cost += found.cost;
    const reached = clusterOf.get(problem.groupAt[found.path[found.path.length - 1]]!)!;
    connected.add(reached);
    remaining.delete(reached);
  }
  return { ok: true, cost, paths };
}
