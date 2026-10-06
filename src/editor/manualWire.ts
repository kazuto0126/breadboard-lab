import { getNode, holeName, nodeIdOf } from '../core/breadboard/naming';
import { getBoard } from '../core/breadboard/registry';
import { MinHeap } from '../core/routing/minHeap';
import type { Circuit } from '../types/circuit';
import type { GridPoint } from '../types/geometry';
import { buildOccupancy, type Occupancy } from './placement';

/** 手動接線規劃用的成本：每格 1、每次轉彎 5，經過別條線每格 200（盡量避免，但不會因此找不到路）。 */
export const MANUAL_BEND_COST = 5;
export const MANUAL_OVERLAP_COST = 200;

export type Axis = 'h' | 'v';

export interface WireColor {
  id: string;
  name: string;
  value: string;
}

/** 實體跳線常見的 10 種顏色；紅、黑、黃…與自動佈線的配色一致。 */
export const WIRE_COLORS: WireColor[] = [
  { id: 'red', name: '紅', value: '#d32f2f' },
  { id: 'black', name: '黑', value: '#212121' },
  { id: 'yellow', name: '黃', value: '#f9a825' },
  { id: 'green', name: '綠', value: '#2e7d32' },
  { id: 'blue', name: '藍', value: '#1565c0' },
  { id: 'orange', name: '橘', value: '#ef6c00' },
  { id: 'white', name: '白', value: '#f5f5f5' },
  { id: 'purple', name: '紫', value: '#6a1b9a' },
  { id: 'brown', name: '棕', value: '#6d4c41' },
  { id: 'gray', name: '灰', value: '#9e9e9e' },
];

export const DEFAULT_WIRE_COLOR = '#1565c0';

/** 空孔：孔上沒有元件腳、沒被本體蓋住、不是別條線的端點，也沒有別條線經過。 */
export function isFreeHoleWith(occ: Occupancy, p: GridPoint): boolean {
  if (!occ.board || occ.board.id !== p.boardId) return false;
  const node = getNode(occ.board, p.x, p.y);
  if (!node || node.kind !== 'hole') return false;
  const id = node.id;
  return !occ.pins.has(id) && !occ.bodies.has(id) && !occ.wireEnds.has(id) && !occ.wirePaths.has(id);
}

export function isFreeHole(circuit: Circuit, p: GridPoint): boolean {
  return isFreeHoleWith(buildOccupancy(circuit, p.boardId), p);
}

/** 先走 first 軸再走另一軸的 L 形路徑。 */
export function lShapePath(start: GridPoint, end: GridPoint, first: Axis = 'h'): GridPoint[] {
  const out: GridPoint[] = [start];
  let { x, y } = start;
  const stepX = () => {
    while (x !== end.x) {
      x += Math.sign(end.x - x);
      out.push({ boardId: start.boardId, x, y });
    }
  };
  const stepY = () => {
    while (y !== end.y) {
      y += Math.sign(end.y - y);
      out.push({ boardId: start.boardId, x, y });
    }
  };
  if (first === 'h') {
    stepX();
    stepY();
  } else {
    stepY();
    stepX();
  }
  return out;
}

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const NO_DIRECTION = 4;

/**
 * 規劃一條手動導線的正交路徑（Dijkstra，狀態含方向）：不能經過元件本體、元件腳與別條線的端點；
 * 轉彎與經過別條線都會加成本。成本相同時，第一步優先走 prefer 軸。找不到路時退回 L 形。
 */
export function planWirePath(circuit: Circuit, start: GridPoint, end: GridPoint, prefer: Axis = 'h'): GridPoint[] {
  if (start.boardId !== end.boardId) return lShapePath(start, end, prefer);
  if (start.x === end.x && start.y === end.y) return [start];
  const occ = buildOccupancy(circuit, start.boardId);
  const board = occ.board;
  if (!board) return lShapePath(start, end, prefer);
  const { width, height } = board;
  const size = width * height;
  const startIndex = (start.y - 1) * width + (start.x - 1);
  const endIndex = (end.y - 1) * width + (end.x - 1);
  if (startIndex < 0 || startIndex >= size || endIndex < 0 || endIndex >= size) return lShapePath(start, end, prefer);

  const blocked = new Uint8Array(size);
  const overlap = new Uint8Array(size);
  for (const node of board.nodes) {
    const i = (node.y - 1) * width + (node.x - 1);
    if (occ.pins.has(node.id) || occ.bodies.has(node.id) || occ.wireEnds.has(node.id)) blocked[i] = 1;
    if (occ.wirePaths.has(node.id)) overlap[i] = 1;
  }
  blocked[startIndex] = 0;
  blocked[endIndex] = 0;

  const states = size * 5;
  const dist = new Float64Array(states).fill(Infinity);
  const prev = new Int32Array(states).fill(-1);
  const heap = new MinHeap();
  const first = startIndex * 5 + NO_DIRECTION;
  dist[first] = 0;
  heap.push(0, first);

  let found = -1;
  for (let top = heap.pop(); top; top = heap.pop()) {
    const state = top.value;
    if (top.key > dist[state]) continue;
    const node = Math.floor(state / 5);
    const dir = state % 5;
    if (node === endIndex) {
      found = state;
      break;
    }
    const x = node % width;
    const y = Math.floor(node / width);
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const next = ny * width + nx;
      if (blocked[next]) continue;
      let cost = 1;
      if (dir !== NO_DIRECTION && dir !== d) cost += MANUAL_BEND_COST;
      if (overlap[next]) cost += MANUAL_OVERLAP_COST;
      if (dir === NO_DIRECTION && (d % 2 === 1 ? 'h' : 'v') !== prefer) cost += 0.001;
      const nextState = next * 5 + d;
      const total = dist[state] + cost;
      if (total < dist[nextState]) {
        dist[nextState] = total;
        prev[nextState] = state;
        heap.push(total, nextState);
      }
    }
  }
  if (found < 0) return lShapePath(start, end, prefer);

  const path: GridPoint[] = [];
  for (let s = found; s >= 0; s = prev[s]) {
    const node = Math.floor(s / 5);
    path.push({ boardId: start.boardId, x: (node % width) + 1, y: Math.floor(node / width) + 1 });
  }
  return path.reverse();
}

/** 預設顏色：一端在 + 電源軌用紅色、在 − 電源軌用黑色，否則用 fallback。 */
export function defaultWireColor(circuit: Circuit, start: GridPoint, end: GridPoint, fallback = DEFAULT_WIRE_COLOR): string {
  const names = [start, end].map((p) => {
    const instance = circuit.boards.find((b) => b.id === p.boardId);
    return instance ? (holeName(getBoard(instance.layoutId, instance.id), p) ?? '') : '';
  });
  if (names.some((n) => /^[TB]\+/.test(n))) return WIRE_COLORS[0].value;
  if (names.some((n) => /^[TB]-/.test(n))) return WIRE_COLORS[1].value;
  return fallback;
}

/** 方便測試與除錯：把路徑轉成格點 ID。 */
export function pathIds(path: GridPoint[]): string[] {
  return path.map(nodeIdOf);
}
