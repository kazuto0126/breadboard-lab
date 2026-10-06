import { buildLattice, isRoutablePoint, latticeOf, type Lattice } from '../breadboard/lattice';
import { nodeIdOf, parseNodeId } from '../breadboard/naming';
import { groupInfo, indexCircuit, nodeAt, type CircuitIndex } from '../circuit/circuitIndex';
import { extractNetsWith, terminalClusters } from '../circuit/nets';
import { pathIssues } from '../circuit/wireGeometry';
import type { Circuit, Wire } from '../../types/circuit';
import type { GridPoint } from '../../types/geometry';
import type { DeepPartial, RoutingConfig, RoutingMetrics } from '../../types/routing';
import { mergeConfig } from './config';
import { mismatchedNets } from './legality';
import { computeMetrics } from './metrics';

function holePoints(index: CircuitIndex, groupId: string): GridPoint[] {
  const all = (groupInfo(index, groupId)?.nodeIds ?? []).map(parseNodeId);
  const free = all.filter((p) => {
    const id = nodeIdOf(p);
    return !index.pinsAt.has(id) && !index.bodiesAt.has(id);
  });
  return free.length > 0 ? free : all;
}

/** 兩組格點間的最小曼哈頓距離（以全域格子座標計算，跨板也正確）。 */
function groupDistance(a: Array<{ x: number; y: number }>, b: Array<{ x: number; y: number }>): number {
  let best = Infinity;
  for (const p of a) for (const q of b) best = Math.min(best, Math.abs(p.x - q.x) + Math.abs(p.y - q.y));
  return best;
}

/** 不考慮障礙物時，把各簇連成一棵樹的最短總長（Prim 最小生成樹）。 */
export function netLowerBound(index: CircuitIndex, clusters: string[][], lattice?: Lattice): number {
  if (clusters.length < 2) return 0;
  const toLattice = (p: GridPoint) => (lattice ? (latticeOf(lattice, p) ?? p) : p);
  const points = clusters.map((cl) => cl.flatMap((g) => holePoints(index, g)).map(toLattice));
  const inTree = new Array<boolean>(clusters.length).fill(false);
  const best = new Array<number>(clusters.length).fill(Infinity);
  best[0] = 0;
  let total = 0;
  for (let step = 0; step < clusters.length; step++) {
    let pick = -1;
    for (let i = 0; i < clusters.length; i++) if (!inTree[i] && (pick < 0 || best[i] < best[pick])) pick = i;
    inTree[pick] = true;
    total += best[pick];
    for (let j = 0; j < clusters.length; j++) {
      if (!inTree[j]) best[j] = Math.min(best[j], groupDistance(points[pick], points[j]));
    }
  }
  return total;
}

/** 以 circuit.wires 分析出的 Net 為基準，替任何一組導線評分（0–100）。 */
export function scoreRouting(
  circuit: Circuit,
  wires: Wire[] = circuit.wires,
  overrides?: DeepPartial<RoutingConfig>,
): { metrics: RoutingMetrics; score: number } {
  const weights = mergeConfig(overrides).scoring;
  const index = indexCircuit(circuit);
  const lattice = buildLattice(circuit.boards);
  const metrics = computeMetrics(wires, lattice);
  const isOnBoard = (p: GridPoint) => isRoutablePoint(lattice, p);
  const broken = wires.some(
    (w) => pathIssues(w, isOnBoard, lattice).length > 0 || [w.start, w.end].some((p) => nodeAt(index, p)?.kind !== 'hole'),
  );
  const reference = extractNetsWith(index, circuit.wires);
  if (broken || mismatchedNets(index, reference, wires).length > 0) return { metrics, score: 0 };

  const obstacleHits = wires.filter((w) =>
    w.path.slice(1, -1).some((p) => {
      const id = nodeIdOf(p);
      return index.pinsAt.has(id) || index.bodiesAt.has(id);
    }),
  ).length;
  const lowerBound = reference.reduce((sum, net) => sum + netLowerBound(index, terminalClusters(net, index), lattice), 0);
  const efficiency = metrics.totalLength === 0 ? 1 : Math.min(1, lowerBound / metrics.totalLength);
  const penalty =
    (metrics.overlaps + obstacleHits) * weights.overlap +
    metrics.crossings * weights.crossing +
    weights.lengthMax * (1 - efficiency) +
    Math.min(weights.extraBendMax, Math.max(0, metrics.bends - metrics.wireCount) * weights.extraBend) +
    Math.min(weights.shortJogMax, metrics.shortJogs * weights.shortJog);
  return { metrics, score: Math.round(Math.max(0, Math.min(100, 100 - penalty)) * 10) / 10 };
}
