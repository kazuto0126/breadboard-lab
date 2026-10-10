import type { RoutingWeights } from '../../types/routing';
import { MinHeap } from './minHeap';
import type { RoutingNet, RoutingProblem } from './problem';
import type { StraightState } from './straightState';

export type OverlapMode = { kind: 'negotiate'; overlapBase: number; presentFactor: number } | { kind: 'hard' };

export interface SearchParams {
  weights: RoutingWeights;
  overlap: OverlapMode;
}

/** 一條直線（格子索引）：a、b 兩端，o = 0 水平、1 垂直，cells 是中間經過的格子。 */
export interface StraightLine {
  a: number;
  b: number;
  o: 0 | 1;
  cells: number[];
}

export interface FoundRoute {
  wires: StraightLine[];
  cost: number;
}

/** a、b 在同一列或同一欄時，兩點之間的直線。 */
export function lineBetween(problem: Pick<RoutingProblem, 'width'>, a: number, b: number): StraightLine {
  const w = problem.width;
  const o: 0 | 1 = Math.floor(a / w) === Math.floor(b / w) ? 0 : 1;
  const step = o === 0 ? Math.sign(b - a) : Math.sign(b - a) * w;
  if (o === 1 && a % w !== b % w) throw new Error('Cells are not in one row or column');
  const cells: number[] = [];
  for (let c = a + step; c !== b; c += step) cells.push(c);
  return { a, b, o, cells };
}

/** 已經有 count 個使用者時再用一次的成本：協商時越擠、歷史越多越貴；嚴格模式不允許。 */
function conflictCost(params: SearchParams, count: number, history: number): number {
  if (count === 0) return params.overlap.kind === 'negotiate' ? history : 0;
  if (params.overlap.kind === 'hard') return Infinity;
  return (params.overlap.overlapBase + history) * (1 + params.overlap.presentFactor * count);
}

/** 把線端插在 cell：孔上已有的線端、從上面經過的線都算衝突。 */
function endCost(state: StraightState, cell: number, params: SearchParams): number {
  const users = state.ends[cell].length + state.lines[cell * 2].length + state.lines[cell * 2 + 1].length;
  return conflictCost(params, users, state.histEnd[cell]);
}

/** 線從 cell 上方經過（方向 o）：別條線的端點、同方向的線是衝突；垂直的線是交叉；別的 Net 的終端空孔加擁擠成本。 */
function passCost(problem: RoutingProblem, state: StraightState, netId: string, cell: number, o: 0 | 1, params: SearchParams): number {
  let cost = conflictCost(params, state.ends[cell].length + state.lines[cell * 2 + o].length, state.histLine[cell * 2 + o]);
  cost += params.weights.crossing * state.lines[cell * 2 + (1 - o)].length;
  const g = problem.groupAt[cell];
  if (problem.terminalHole[cell] && !(g && state.owns(netId, g))) cost += params.weights.congestion;
  return cost;
}

/** 線端可以插在 group 嗎：自己的排（終端排、用過的轉接排），或空的五孔排（新的轉接排）。 */
function groupUse(problem: RoutingProblem, state: StraightState, netId: string, group: string): 'own' | 'via' | null {
  if (state.owns(netId, group)) return 'own';
  if (problem.railGroups.has(group) || problem.pinGroups.has(group)) return null;
  const owner = problem.groupOwner.get(group);
  return owner === undefined || owner === netId ? 'via' : null;
}

function viaCost(state: StraightState, netId: string, group: string, params: SearchParams): number {
  return params.weights.via + conflictCost(params, state.viaOthers(netId, group), state.histVia.get(group) ?? 0);
}

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

/**
 * 規格 2.1：從 sources 那些排的空孔出發、到 targets 任一排為止，最便宜的一串直線（Dijkstra）。
 * 狀態 = 孔 × {IN, OUT}：IN(h) 是一條線停在 h；OUT(h) 是一條線從 h 出發。換孔（同一排）不花成本，所以不用估計函式。
 */
export function findRoute(
  problem: RoutingProblem,
  state: StraightState,
  net: RoutingNet,
  sources: Set<string>,
  targets: Set<string>,
  params: SearchParams,
): FoundRoute | null {
  const { width, height, size, blocked, groupAt } = problem;
  const dist = new Float64Array(size * 2).fill(Infinity);
  const parent = new Int32Array(size * 2).fill(-1);
  const heap = new MinHeap();
  const relax = (s: number, cost: number, from: number) => {
    if (!Number.isFinite(cost) || cost >= dist[s]) return;
    dist[s] = cost;
    parent[s] = from;
    heap.push(cost, s);
  };
  for (const g of [...sources].sort()) for (const c of problem.freeHoles.get(g) ?? []) relax(c * 2 + 1, endCost(state, c, params), -1);

  while (heap.size > 0) {
    const top = heap.pop()!;
    const s = top.value;
    if (top.key > dist[s]) continue;
    const c = s >> 1;
    const g = groupAt[c]!;
    if ((s & 1) === 0) {
      if (targets.has(g)) return { wires: reconstruct(problem, parent, s), cost: dist[s] };
      for (const h of problem.freeHoles.get(g) ?? []) if (h !== c) relax(h * 2 + 1, dist[s] + endCost(state, h, params), s);
      continue;
    }
    for (let d = 0; d < 4; d++) {
      const o: 0 | 1 = d % 2 === 0 ? 0 : 1;
      let x = c % width;
      let y = Math.floor(c / width);
      let acc = dist[s] + params.weights.wire;
      for (let len = 1; ; len++) {
        x += DX[d];
        y += DY[d];
        if (x < 0 || y < 0 || x >= width || y >= height) break;
        const q = y * width + x;
        if (blocked[q]) break;
        const gq = groupAt[q];
        if (gq !== null && gq !== g) {
          const use = groupUse(problem, state, net.netId, gq);
          if (use) {
            let cost = acc + params.weights.distance * len + endCost(state, q, params);
            if (use === 'via') cost += viaCost(state, net.netId, gq, params);
            relax(q * 2, cost, s);
          }
        }
        acc += passCost(problem, state, net.netId, q, o, params);
        if (!Number.isFinite(acc)) break;
      }
    }
  }
  return null;
}

/** 狀態鏈 OUT → IN → OUT → IN …：每一對 OUT → IN 是一條線。 */
function reconstruct(problem: RoutingProblem, parent: Int32Array, goal: number): StraightLine[] {
  const chain: number[] = [];
  for (let s = goal; s !== -1; s = parent[s]) chain.push(s);
  chain.reverse();
  const out: StraightLine[] = [];
  for (let i = 0; i + 1 < chain.length; i++) {
    if ((chain[i] & 1) === 1 && (chain[i + 1] & 1) === 0) out.push(lineBetween(problem, chain[i] >> 1, chain[i + 1] >> 1));
  }
  return out;
}

/** 用和 findRoute 相同的成本定義，計算在目前 state 下放一條線的成本（改善階段比較新舊用）。 */
export function wireCost(problem: RoutingProblem, state: StraightState, net: RoutingNet, line: StraightLine, params: SearchParams): number {
  let cost = endCost(state, line.a, params) + params.weights.wire + params.weights.distance * (line.cells.length + 1) + endCost(state, line.b, params);
  for (const c of line.cells) cost += passCost(problem, state, net.netId, c, line.o, params);
  const g = problem.groupAt[line.b];
  if (g && groupUse(problem, state, net.netId, g) === 'via') cost += viaCost(state, net.netId, g, params);
  return cost;
}
