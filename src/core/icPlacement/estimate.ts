import { latticeOf, type Lattice } from '../breadboard/lattice';
import { parseNodeId } from '../breadboard/naming';
import type { CircuitIndex } from '../circuit/circuitIndex';
import { terminalClusters } from '../circuit/nets';
import type { Net } from '../../types/circuit';
import type { RoutingWeights } from '../../types/routing';

interface Cell {
  x: number;
  y: number;
}

/** 兩孔之間：同一列或同一行算 1 條線，否則 2 條線、1 個轉接；不管障礙與交叉。 */
function pairCost(a: Cell, b: Cell, w: RoutingWeights): number {
  const length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  return a.x === b.x || a.y === b.y ? w.wire + length * w.distance : 2 * w.wire + w.via + length * w.distance;
}

/** Prim：從第 0 簇開始，每次接上最便宜的一簇；兩簇之間取兩邊的孔兩兩比較的最小值。 */
function spanningCost(clusters: Cell[][], w: RoutingWeights): number {
  if (clusters.length < 2) return 0;
  const between = (a: Cell[], b: Cell[]) => {
    let best = Infinity;
    for (const p of a) for (const q of b) best = Math.min(best, pairCost(p, q, w));
    return best;
  };
  const inTree = clusters.map((_, i) => i === 0);
  const dist = clusters.map((c, i) => (i === 0 ? 0 : between(clusters[0], c)));
  let total = 0;
  for (let added = 1; added < clusters.length; added++) {
    let next = -1;
    for (let i = 0; i < clusters.length; i++) if (!inTree[i] && (next < 0 || dist[i] < dist[next])) next = i;
    inTree[next] = true;
    total += dist[next];
    for (let i = 0; i < clusters.length; i++) if (!inTree[i]) dist[i] = Math.min(dist[i], between(clusters[next], clusters[i]));
  }
  return total;
}

/**
 * 規格 2026-10-10 ic-placement 3.2：很快的估計。每個 Net 的終端排依元件內部導通分簇，簇與簇之間用最小生成樹相連。
 * index 是要估計的那個擺法（元件已經在新位置）；座標用全域格子，同組的兩塊板可以直接比較。
 */
export function estimateNets(index: CircuitIndex, lattice: Lattice, nets: Net[], weights: RoutingWeights): number {
  let total = 0;
  for (const net of nets) {
    const clusters = terminalClusters(net, index).map((cluster) =>
      cluster.flatMap((g) =>
        (index.boards.get(g.slice(0, g.indexOf(':')))?.groups[g]?.nodeIds ?? [])
          .map((id) => latticeOf(lattice, parseNodeId(id)))
          .filter((c): c is Cell => c !== null),
      ),
    );
    total += spanningCost(clusters, weights);
  }
  return total;
}
