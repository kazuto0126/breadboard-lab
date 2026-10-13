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

export function inputPins(node: LogicNode): GridXY[] {
  const n = inputCountOf(node);
  if (node.kind === 'BLOCK') return Array.from({ length: n }, (_, k) => ({ x: node.x, y: node.y + k }));
  return (OFFSETS[n] ?? []).map((dy) => ({ x: node.x, y: node.y + dy }));
}

/** 所有輸出腳的位置（方塊在右側由上到下）。 */
export function outputPins(node: LogicNode): GridXY[] {
  if (isSink(node.kind)) return [];
  const { w, h } = nodeSize(node);
  if (node.kind === 'BLOCK') return Array.from({ length: outputCountOf(node) }, (_, k) => ({ x: node.x + w, y: node.y + k }));
  return [{ x: node.x + w, y: node.y + (isGate(node.kind) ? Math.floor(h / 2) : 0) }];
}

/** 第 k 個輸出腳（預設第 0 個）。 */
export function outputPin(node: LogicNode, k = 0): GridXY | null {
  return outputPins(node)[k] ?? null;
}

/** 方框重疊（相鄰不算）。 */
export function overlaps(a: LogicNode, b: LogicNode): boolean {
  const sa = nodeSize(a);
  const sb = nodeSize(b);
  return a.x < b.x + sb.w && b.x < a.x + sa.w && a.y < b.y + sb.h && b.y < a.y + sa.h;
}
