import type { RoutingNode, RoutingWeights } from '../../types/routing';
import { MinHeap } from './minHeap';
import type { RoutingProblem } from './problem';
import { isCrossPair, type RouteState, type Usage } from './routeState';

export type OverlapMode = { kind: 'negotiate'; overlapBase: number; presentFactor: number } | { kind: 'hard' };

export interface SearchParams {
  weights: RoutingWeights;
  overlap: OverlapMode;
}

export interface FoundWire {
  path: number[];
  cost: number;
}

const NONE = 4;
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const STATES_PER_NODE = 20; // 5 個方向（含「起點」）× 段長 ≥ 2 與否 × 是否第一段

const encode = (node: number, dir: number, long: number, first: number) => ((node * 5 + dir) * 2 + long) * 2 + first;

export function decodeState(id: number): RoutingNode {
  return {
    index: Math.floor(id / STATES_PER_NODE),
    direction: Math.floor(id / 4) % 5,
    longRun: (Math.floor(id / 2) & 1) === 1,
    firstSegment: (id & 1) === 1,
  };
}

export function directionBetween(from: number, to: number, width: number): number {
  const d = to - from;
  if (d === -width) return 0;
  if (d === 1) return 1;
  if (d === width) return 2;
  if (d === -1) return 3;
  throw new Error(`Nodes ${from} and ${to} are not adjacent`);
}

/** 以 usage 方式使用 node 時的額外成本（不含移動與轉彎）。Infinity 代表不允許。 */
export function nodeUseCost(problem: RoutingProblem, state: RouteState, node: number, usage: Usage, params: SearchParams): number {
  let cost = params.overlap.kind === 'negotiate' ? state.history[node] : 0;
  const others = state.uses[node];
  if (others.length > 0) {
    if (others.length === 1 && isCrossPair(others[0].usage, usage)) {
      cost += params.weights.crossing;
    } else if (params.overlap.kind === 'hard') {
      return Infinity;
    } else {
      cost += (params.overlap.overlapBase + state.history[node]) * (1 + params.overlap.presentFactor * others.length);
    }
  }
  if (usage !== 'E' && problem.terminalHole[node]) cost += params.weights.congestion;
  return cost;
}

interface Scratch {
  g: Float64Array;
  parent: Int32Array;
  closed: Uint8Array;
  hCache: Float64Array;
  isTarget: Uint8Array;
}

let scratch: Scratch | null = null;

/** 重複使用搜尋用的陣列，避免每次呼叫都配置新記憶體。 */
function buffers(totalStates: number, size: number): Scratch {
  if (!scratch || scratch.g.length !== totalStates || scratch.isTarget.length !== size) {
    scratch = {
      g: new Float64Array(totalStates),
      parent: new Int32Array(totalStates),
      closed: new Uint8Array(totalStates),
      hCache: new Float64Array(size),
      isTarget: new Uint8Array(size),
    };
  }
  scratch.g.fill(Infinity);
  scratch.parent.fill(-1);
  scratch.closed.fill(0);
  scratch.hCache.fill(-1);
  scratch.isTarget.fill(0);
  return scratch;
}

/**
 * 多起點、多終點 A*。狀態 = (格點, 進入方向, 本段長度是否 ≥ 2, 本段是否為第一段)。
 * 終點另用「goal 狀態」（索引 = STATES + 格點）表示，進入時加上端點使用成本。
 * 估計函式為最近終點的曼哈頓距離 × distance 權重：不高估且一致，第一次取出 goal 即為最佳解。
 */
export function findWire(
  problem: RoutingProblem,
  state: RouteState,
  sources: number[],
  targets: number[],
  params: SearchParams,
): FoundWire | null {
  const { width, height, size, blocked } = problem;
  const weights = params.weights;
  const STATES = size * STATES_PER_NODE;
  const { g, parent, closed, hCache, isTarget } = buffers(STATES + size, size);
  for (const t of targets) isTarget[t] = 1;
  const tx = targets.map((t) => t % width);
  const ty = targets.map((t) => Math.floor(t / width));
  const h = (v: number): number => {
    if (hCache[v] >= 0) return hCache[v];
    const x = v % width;
    const y = Math.floor(v / width);
    let best = Infinity;
    for (let k = 0; k < tx.length; k++) {
      const d = Math.abs(x - tx[k]) + Math.abs(y - ty[k]);
      if (d < best) best = d;
    }
    hCache[v] = best * weights.distance;
    return hCache[v];
  };

  const heap = new MinHeap();
  for (const s of [...sources].sort((a, b) => a - b)) {
    if (isTarget[s] || blocked[s]) continue;
    const c = nodeUseCost(problem, state, s, 'E', params);
    if (!Number.isFinite(c)) continue;
    const id = encode(s, NONE, 0, 1);
    if (c < g[id]) {
      g[id] = c;
      heap.push(c + h(s), id);
    }
  }

  while (heap.size > 0) {
    const id = heap.pop()!.value;
    if (closed[id]) continue;
    closed[id] = 1;
    if (id >= STATES) return { path: reconstruct(parent, id, STATES), cost: g[id] };

    const v = Math.floor(id / STATES_PER_NODE);
    const dir = Math.floor(id / 4) % 5;
    const long = Math.floor(id / 2) & 1;
    const first = id & 1;
    const x = v % width;
    const y = Math.floor(v / width);

    for (let nd = 0; nd < 4; nd++) {
      if (dir !== NONE && nd === (dir + 2) % 4) continue;
      const nx = x + DX[nd];
      const ny = y + DY[nd];
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const w = ny * width + nx;
      if (blocked[w]) continue;

      let cost = g[id] + weights.distance;
      let nLong = 0;
      let nFirst = 1;
      if (dir !== NONE) {
        if (nd === dir) {
          cost += nodeUseCost(problem, state, v, nd % 2 === 1 ? 'H' : 'V', params);
          nLong = 1;
          nFirst = first;
        } else {
          cost += nodeUseCost(problem, state, v, 'T', params) + weights.bend;
          if (!long && !first) cost += weights.aesthetic;
          nLong = 0;
          nFirst = 0;
        }
      }
      if (!Number.isFinite(cost)) continue;

      if (isTarget[w]) {
        const goal = STATES + w;
        const goalCost = cost + nodeUseCost(problem, state, w, 'E', params);
        if (goalCost < g[goal]) {
          g[goal] = goalCost;
          parent[goal] = id;
          heap.push(goalCost, goal);
        }
      }
      const next = encode(w, nd, nLong, nFirst);
      if (cost < g[next]) {
        g[next] = cost;
        parent[next] = id;
        heap.push(cost + h(w), next);
      }
    }
  }
  return null;
}

function reconstruct(parent: Int32Array, goal: number, STATES: number): number[] {
  const nodes = [goal - STATES];
  for (let cur = parent[goal]; cur !== -1; cur = parent[cur]) nodes.push(Math.floor(cur / STATES_PER_NODE));
  return nodes.reverse();
}

/** 用與 findWire 完全相同的成本定義計算一條既有路徑的成本。 */
export function evaluatePath(problem: RoutingProblem, state: RouteState, path: number[], params: SearchParams): number {
  const weights = params.weights;
  let cost = nodeUseCost(problem, state, path[0], 'E', params);
  let dir = NONE;
  let long = 0;
  let first = 1;
  for (let k = 1; k < path.length; k++) {
    const nd = directionBetween(path[k - 1], path[k], problem.width);
    cost += weights.distance;
    if (dir !== NONE) {
      if (nd === dir) {
        cost += nodeUseCost(problem, state, path[k - 1], nd % 2 === 1 ? 'H' : 'V', params);
        long = 1;
      } else {
        cost += nodeUseCost(problem, state, path[k - 1], 'T', params) + weights.bend;
        if (!long && !first) cost += weights.aesthetic;
        long = 0;
        first = 0;
      }
    }
    dir = nd;
  }
  return cost + nodeUseCost(problem, state, path[path.length - 1], 'E', params);
}
