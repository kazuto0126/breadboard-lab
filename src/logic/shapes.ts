import { BLOCK_PINS } from './blocks';
import { isGate, isSink, isSource, type LogicNode } from './types';

export interface GridXY {
  x: number;
  y: number;
}

/** 這個節點有幾個輸入腳（輸入端 0、輸出端 1）。 */
export function inputCountOf(node: LogicNode): number {
  if (isSource(node.kind)) return 0;
  if (node.kind === 'BLOCK') return node.chip ? BLOCK_PINS[node.chip].inputs.length : 0;
  if (node.kind === 'DISPLAY') return 4;
  if (node.kind === 'OUTPUT' || node.kind === 'NOT') return 1;
  if (node.kind === 'XOR') return 2;
  return node.inputs ?? 2;
}

/** 有幾個輸出腳（輸出端、顯示器 0；方塊依 IC；其他 1）。 */
export function outputCountOf(node: LogicNode): number {
  if (isSink(node.kind)) return 0;
  if (node.kind === 'BLOCK') return node.chip ? BLOCK_PINS[node.chip].outputs.length : 0;
  return 1;
}

/** 規格 2.1 的表。 */
export function nodeSize(node: LogicNode): { w: number; h: number } {
  if (node.kind === 'BLOCK') return { w: BLOCK_WIDTH, h: Math.max(inputCountOf(node), outputCountOf(node)) + 1 };
  if (node.kind === 'INPUT' || node.kind === 'OUTPUT' || node.kind === 'HIGH' || node.kind === 'LOW') return { w: 2, h: 1 };
  if (node.kind === 'NOT') return { w: 3, h: 1 };
  return { w: 4, h: inputCountOf(node) === 4 ? 5 : 3 };
}

const OFFSETS: Record<number, number[]> = { 1: [0], 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 3, 4] };

/** IC 方塊的寬度（格）。 */
export const BLOCK_WIDTH = 6;

/**
 * 子專案 26：本地座標（沒轉時：輸入在 u = 0、輸出在 u = w，v 是列）換到轉向後、相對於 (x, y) 的位置。
 * 子專案 28：鏡射先把 u 換成 w − u，再轉：90°：(h − 1 − v, u)；180°：(w − u, h − 1 − v)；270°：(v, w − u)。
 */
function turn(node: LogicNode, u0: number, v: number): GridXY {
  const { w, h } = nodeSize(node);
  const u = node.flip ? w - u0 : u0;
  switch (node.rotation) {
    case 90:
      return { x: h - 1 - v, y: u };
    case 180:
      return { x: w - u, y: h - 1 - v };
    case 270:
      return { x: v, y: w - u };
    default:
      return { x: u, y: v };
  }
}

const place = (node: LogicNode, u: number, v: number): GridXY => {
  const p = turn(node, u, v);
  return { x: node.x + p.x, y: node.y + p.y };
};

/** 佔用的方框（重疊、框選、Fit 用）：轉 90° / 270° 時寬高互換。 `nodeSize` 是沒轉時的大小（畫元件用）。 */
export function boxOf(node: LogicNode): { w: number; h: number } {
  const { w, h } = nodeSize(node);
  return node.rotation === 90 || node.rotation === 270 ? { w: h, h: w } : { w, h };
}

/** 本體在畫面上的範圍（開區間，格子座標）：線穿過它就算穿過元件；腳在邊上。 */
export function bodyRect(node: LogicNode): { x0: number; x1: number; y0: number; y1: number } {
  const { w, h } = nodeSize(node);
  const a = turn(node, 0, -0.5);
  const b = turn(node, w, h - 0.5);
  return { x0: node.x + Math.min(a.x, b.x), x1: node.x + Math.max(a.x, b.x), y0: node.y + Math.min(a.y, b.y), y1: node.y + Math.max(a.y, b.y) };
}

export type Facing = 'E' | 'S' | 'W' | 'N';
const FACINGS: Facing[] = ['E', 'S', 'W', 'N'];
const quarter = (node: LogicNode) => (node.rotation ?? 0) / 90 + (node.flip ? 2 : 0);

/** 輸出腳朝的方向（沒轉時朝右）。 */
export function outputDir(node: LogicNode): Facing {
  return FACINGS[quarter(node) % 4];
}

/** 輸入腳朝外的方向（沒轉時朝左：線從左邊接進來）。 */
export function inputDir(node: LogicNode): Facing {
  return FACINGS[(quarter(node) + 2) % 4];
}

export function inputPins(node: LogicNode): GridXY[] {
  const n = inputCountOf(node);
  if (node.kind === 'BLOCK') return Array.from({ length: n }, (_, k) => place(node, 0, k));
  return (OFFSETS[n] ?? []).map((dy) => place(node, 0, dy));
}

/** 所有輸出腳的位置（方塊在右側由上到下）。 */
export function outputPins(node: LogicNode): GridXY[] {
  if (isSink(node.kind)) return [];
  const { w, h } = nodeSize(node);
  if (node.kind === 'BLOCK') return Array.from({ length: outputCountOf(node) }, (_, k) => place(node, w, k));
  return [place(node, w, isGate(node.kind) ? Math.floor(h / 2) : 0)];
}

/** 第 k 個輸出腳（預設第 0 個）。 */
export function outputPin(node: LogicNode, k = 0): GridXY | null {
  return outputPins(node)[k] ?? null;
}

/** 方框重疊（相鄰不算；轉向時用轉過的方框）。 */
export function overlaps(a: LogicNode, b: LogicNode): boolean {
  const sa = boxOf(a);
  const sb = boxOf(b);
  return a.x < b.x + sb.w && b.x < a.x + sa.w && a.y < b.y + sb.h && b.y < a.y + sa.h;
}
