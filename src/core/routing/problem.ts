import { buildCanvas, buildLattice, canvasIndex, latticeGroups, latticeOf, type Lattice, type LatticeCanvas } from '../breadboard/lattice';
import { getNode } from '../breadboard/naming';
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
  /** 這張格子涵蓋的麵包板（同一個 Board Group）。 */
  boardIds: string[];
  /** 格子的 (0, 0) 在全域格子中的座標。 */
  originX: number;
  originY: number;
  width: number;
  height: number;
  size: number;
  /** 每一格的正規格點（不在板面上為 null）。 */
  points: Array<GridPoint | null>;
  /** 1 = 不能走線：元件本體、元件腳、不在板面上或留白（同群組兩板之間的接縫除外）。 */
  blocked: Uint8Array;
  /** 每個格點所屬的導通群組（surface、留白為 null）。 */
  groupAt: Array<string | null>;
  /** 群組 ID → 沒被元件佔用的孔（格點索引，遞增）。這張格子上的每個群組都有 key。 */
  freeHoles: Map<string, number[]>;
  /** 1 = 某個需要佈線的 Net 的終端群組空孔；導線經過會加 congestion 成本。 */
  terminalHole: Uint8Array;
  /** 有元件腳的排（不能當別的 Net 的轉接排）。 */
  pinGroups: Set<string>;
  /** 電源軌（空的電源軌不當轉接排）。 */
  railGroups: Set<string>;
  /** 終端排 → 擁有它的 Net（這張格子上的所有 Net，包括不需要佈線的）。 */
  groupOwner: Map<string, string>;
  /** 終端群組全部在這張格子上的 Net，依 priority 由高到低排序，同分依 netId。 */
  nets: RoutingNet[];
  referenceNets: Net[];
  index: CircuitIndex;
  lattice: Lattice;
}

/** 板內座標 → 格子索引（boardId 省略時用這張格子的第一塊板）。不在格子內時回傳 -1。 */
export function toIndex(problem: Pick<RoutingProblem, 'width' | 'height' | 'originX' | 'originY' | 'boardIds' | 'lattice'>, x: number, y: number, boardId = problem.boardIds[0]): number {
  const at = latticeOf(problem.lattice, { boardId, x, y });
  if (!at) return -1;
  const cx = at.x - problem.originX;
  const cy = at.y - problem.originY;
  if (cx < 0 || cy < 0 || cx >= problem.width || cy >= problem.height) return -1;
  return cy * problem.width + cx;
}

export function toPoint(problem: Pick<RoutingProblem, 'points'>, i: number): GridPoint {
  const p = problem.points[i];
  if (!p) throw new Error(`Cell ${i} is not on any breadboard`);
  return p;
}

const POST_COLORS: Record<string, string> = { red: '紅', black: '黑', yellow: '黃', green: '綠' };

/** 導通群組的中文說明；withBoard 為 true 時加上板子 ID（多塊板時使用）。 */
export function describeGroup(groupId: string, withBoard = false): string {
  const colon = groupId.indexOf(':');
  const local = groupId.slice(colon + 1);
  const prefix = withBoard ? `${groupId.slice(0, colon)} ` : '';
  const column = /^(?:a(\d+)-)?c(\d+)-(top|bot)$/.exec(local);
  if (column) return `${prefix}${column[1] ? `第 ${column[1]} 區` : ''}第 ${column[2]} 欄${column[3] === 'top' ? '上半（A–E）' : '下半（F–J）'}`;
  const post = /^post-(\w+)$/.exec(local);
  if (post) return `${prefix}${POST_COLORS[post[1]] ?? post[1]}色接線柱`;
  return `${prefix}${local.replace('rail-', '')} 電源軌`;
}

const boardOfGroup = (groupId: string) => groupId.slice(0, groupId.indexOf(':'));

/** 連到不同 Board Group 的 Net：沒有連續的板面可以走線，一定佈不出來。 */
export interface SpanningNet {
  net: Net;
  boardIds: string[];
}

/** 每個 Board Group 一張佈線格子；單塊板的格子索引與以前相同（x 1–63、y 1–18）。 */
export function buildRoutingProblems(circuit: Circuit, config: RoutingConfig): { problems: RoutingProblem[]; spanning: SpanningNet[] } {
  const index = indexCircuit(circuit);
  const lattice = buildLattice(circuit.boards);
  const referenceNets = extractNetsWith(index, circuit.wires);
  const routableSignals = referenceNets
    .filter((n) => n.kind === 'signal' && terminalClusters(n, index).length >= 2)
    .map((n) => n.id);

  const spanning: SpanningNet[] = [];
  const netsByCanvas = new Map<string, Net[]>();
  for (const net of referenceNets) {
    const boards = [...new Set(terminalGroupIds(net, index).map(boardOfGroup))].sort(compareIds);
    const canvases = new Set(boards.map((b) => lattice.groupOf.get(b) ?? b));
    if (canvases.size > 1 && terminalClusters(net, index).length >= 2) {
      spanning.push({ net, boardIds: boards });
      continue;
    }
    const canvas = [...canvases][0];
    if (!canvas) continue;
    const list = netsByCanvas.get(canvas);
    if (list) list.push(net);
    else netsByCanvas.set(canvas, [net]);
  }

  const problems = latticeGroups(lattice).map((groupId) =>
    buildCanvasProblem(index, lattice, buildCanvas(lattice, groupId), referenceNets, netsByCanvas.get(groupId) ?? [], routableSignals, config),
  );
  return { problems, spanning };
}

/** 只有一個 Board Group 的電路（例如一塊板）的佈線問題。 */
export function buildRoutingProblem(circuit: Circuit, config: RoutingConfig): RoutingProblem {
  const { problems } = buildRoutingProblems(circuit, config);
  if (problems.length !== 1) throw new Error('buildRoutingProblem needs all breadboards in exactly one board group');
  return problems[0];
}

function buildCanvasProblem(
  index: CircuitIndex,
  lattice: Lattice,
  canvas: LatticeCanvas,
  referenceNets: Net[],
  canvasNets: Net[],
  routableSignals: string[],
  config: RoutingConfig,
): RoutingProblem {
  const { width, height, size } = canvas;
  const at = (p: GridPoint) => canvasIndex(canvas, lattice, p);

  const blocked = new Uint8Array(size);
  for (let i = 0; i < size; i++) if (!canvas.routable[i]) blocked[i] = 1;
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

  const groupAt = canvas.points.map((p) => (p ? (getNode(lattice.byId.get(p.boardId)!.board, p.x, p.y)?.groupId ?? null) : null));
  const groupIds = canvas.boardIds.flatMap((id) => Object.keys(lattice.byId.get(id)!.board.groups)).sort(compareIds);
  const freeHoles = new Map<string, number[]>(groupIds.map((g) => [g, []]));
  groupAt.forEach((g, i) => {
    if (g && !blocked[i]) freeHoles.get(g)?.push(i);
  });
  const isRail = (g: string) => lattice.byId.get(boardOfGroup(g))?.board.groups[g]?.kind === 'rail';

  const nets = canvasNets.map((net): RoutingNet => {
    const terminalGroups = terminalGroupIds(net, index);
    const clusters = terminalClusters(net, index);
    const pinsIn = (cluster: string[]) =>
      net.pins.filter((ref) => {
        const p = pinPoint(index, ref);
        const g = p ? groupOfPoint(index, p) : null;
        return g !== null && cluster.includes(g);
      }).length;
    let startCluster = clusters.findIndex((cl) => cl.some(isRail));
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

  const pinGroups = new Set<string>();
  for (const pc of index.placed) {
    for (const pin of pc.footprint.pins) {
      const g = groupOfPoint(index, pin.point);
      if (g) pinGroups.add(g);
    }
  }
  const railGroups = new Set(groupIds.filter(isRail));
  const groupOwner = new Map<string, string>();
  for (const net of nets) for (const g of net.terminalGroups) groupOwner.set(g, net.netId);

  const terminalHole = new Uint8Array(size);
  for (const net of nets) {
    if (net.clusters.length < 2) continue;
    for (const g of net.terminalGroups) for (const i of freeHoles.get(g) ?? []) terminalHole[i] = 1;
  }

  return {
    boardIds: canvas.boardIds,
    originX: canvas.originX,
    originY: canvas.originY,
    width,
    height,
    size,
    points: canvas.points,
    blocked,
    groupAt,
    freeHoles,
    terminalHole,
    pinGroups,
    railGroups,
    groupOwner,
    nets,
    referenceNets,
    index,
    lattice,
  };
}
