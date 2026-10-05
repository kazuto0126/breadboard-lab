import type { Breadboard } from '../../types/board';
import type { Circuit, Net } from '../../types/circuit';
import type { GridPoint } from '../../types/geometry';
import type { RoutingConfig } from '../../types/routing';
import { groupOfPoint, indexCircuit, pinPoint, type CircuitIndex } from '../circuit/circuitIndex';
import { compareIds, extractNetsWith, terminalClusters, terminalGroupIds } from '../circuit/nets';
import { netColor } from './colors';

export interface RoutingNet {
  netId: string;
  kind: Net['kind'];
  terminalGroups: string[];
  /** 依元件內部導通分好的終端群組簇；簇與簇之間各需要一條線。 */
  clusters: string[][];
  /** 生成樹從哪一簇開始（clusters 的索引）。 */
  startCluster: number;
  priority: number;
  color: string;
}

export interface RoutingProblem {
  board: Breadboard;
  width: number;
  height: number;
  size: number;
  /** 1 = 元件本體或元件腳：導線不能經過，也不能當端點。 */
  blocked: Uint8Array;
  /** 每個格點所屬的導通群組（surface 為 null）。 */
  groupAt: Array<string | null>;
  /** 群組 ID → 沒被元件佔用的孔（格點索引，遞增）。每個群組都有 key。 */
  freeHoles: Map<string, number[]>;
  /** 1 = 某個需要佈線的 Net 的終端群組空孔；導線經過會加 congestion 成本。 */
  terminalHole: Uint8Array;
  /** 依 priority 由高到低排序，同分依 netId。 */
  nets: RoutingNet[];
  referenceNets: Net[];
  index: CircuitIndex;
}

export function toIndex(problem: Pick<RoutingProblem, 'width'>, x: number, y: number): number {
  return (y - 1) * problem.width + (x - 1);
}

export function toPoint(problem: Pick<RoutingProblem, 'width' | 'board'>, i: number): GridPoint {
  return { boardId: problem.board.id, x: (i % problem.width) + 1, y: Math.floor(i / problem.width) + 1 };
}

export function describeGroup(groupId: string): string {
  const local = groupId.slice(groupId.indexOf(':') + 1);
  const column = /^c(\d+)-(top|bot)$/.exec(local);
  if (column) return `第 ${column[1]} 欄${column[2] === 'top' ? '上半（A–E）' : '下半（F–J）'}`;
  return `${local.replace('rail-', '')} 電源軌`;
}

export function buildRoutingProblem(circuit: Circuit, config: RoutingConfig): RoutingProblem {
  if (circuit.boards.length !== 1) throw new Error('autoRoute currently supports exactly one breadboard');
  const index = indexCircuit(circuit);
  const board = index.boards.get(circuit.boards[0].id)!;
  const { width, height } = board;
  const size = width * height;
  const at = (p: GridPoint) =>
    p.boardId === board.id && p.x >= 1 && p.y >= 1 && p.x <= width && p.y <= height ? (p.y - 1) * width + (p.x - 1) : -1;

  const blocked = new Uint8Array(size);
  for (const pc of index.placed) {
    for (const pin of pc.footprint.pins) {
      const i = at(pin.point);
      if (i >= 0) blocked[i] = 1;
    }
    for (const cell of pc.footprint.blocked) {
      const i = at(cell);
      if (i >= 0) blocked[i] = 1;
    }
  }

  const groupAt = board.nodes.map((n) => n.groupId);
  const freeHoles = new Map<string, number[]>(Object.keys(board.groups).sort(compareIds).map((g) => [g, []]));
  groupAt.forEach((g, i) => {
    if (g && !blocked[i]) freeHoles.get(g)!.push(i);
  });

  const referenceNets = extractNetsWith(index, circuit.wires);
  const routableSignals = referenceNets
    .filter((n) => n.kind === 'signal' && terminalClusters(n, index).length >= 2)
    .map((n) => n.id);

  const nets = referenceNets.map((net): RoutingNet => {
    const terminalGroups = terminalGroupIds(net, index);
    const clusters = terminalClusters(net, index);
    const pinsIn = (cluster: string[]) =>
      net.pins.filter((ref) => {
        const p = pinPoint(index, ref);
        const g = p ? groupOfPoint(index, p) : null;
        return g !== null && cluster.includes(g);
      }).length;
    let startCluster = clusters.findIndex((cl) => cl.some((g) => board.groups[g]?.kind === 'rail'));
    if (startCluster < 0) {
      startCluster = 0;
      for (let i = 1; i < clusters.length; i++) if (pinsIn(clusters[i]) > pinsIn(clusters[startCluster])) startCluster = i;
    }
    const holes = terminalGroups.flatMap((g) => freeHoles.get(g) ?? []);
    const xs = holes.map((i) => i % width);
    const ys = holes.map((i) => Math.floor(i / width));
    const spread = holes.length > 0 ? Math.max(...xs) - Math.min(...xs) + (Math.max(...ys) - Math.min(...ys)) : 0;
    const freeIn = (cluster: string[]) => cluster.reduce((sum, g) => sum + (freeHoles.get(g)?.length ?? 0), 0);
    const minFree = clusters.length > 0 ? Math.min(...clusters.map(freeIn)) : 0;
    const priority =
      (net.kind === 'signal' ? 0 : config.priority.power) +
      spread * config.priority.spread +
      config.priority.scarcity / (minFree + 1);
    return {
      netId: net.id,
      kind: net.kind,
      terminalGroups,
      clusters,
      startCluster,
      priority,
      color: netColor(net.kind, routableSignals.indexOf(net.id)),
    };
  });
  nets.sort((a, b) => b.priority - a.priority || compareIds(a.netId, b.netId));

  const terminalHole = new Uint8Array(size);
  for (const net of nets) {
    if (net.clusters.length < 2) continue;
    for (const g of net.terminalGroups) for (const i of freeHoles.get(g) ?? []) terminalHole[i] = 1;
  }

  return { board, width, height, size, blocked, groupAt, freeHoles, terminalHole, nets, referenceNets, index };
}
