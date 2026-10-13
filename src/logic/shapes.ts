import { isGate, isSink, type LogicNode } from './types';

export interface GridXY {
  x: number;
  y: number;
}

/** 這個節點有幾個輸入腳（輸入端 0、輸出端 1）。 */
export function inputCountOf(node: LogicNode): number {
  if (node.kind === 'INPUT') return 0;
  if (node.kind === 'DISPLAY') return 4;
  if (node.kind === 'OUTPUT' || node.kind === 'NOT') return 1;
  if (node.kind === 'XOR') return 2;
  return node.inputs ?? 2;
}

/** 規格 2.1 的表。 */
export function nodeSize(node: LogicNode): { w: number; h: number } {
  if (node.kind === 'INPUT' || node.kind === 'OUTPUT') return { w: 2, h: 1 };
  if (node.kind === 'NOT') return { w: 3, h: 1 };
  return { w: 4, h: inputCountOf(node) === 4 ? 5 : 3 };
}

const OFFSETS: Record<number, number[]> = { 1: [0], 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 3, 4] };

export function inputPins(node: LogicNode): GridXY[] {
  const n = inputCountOf(node);
  return (OFFSETS[n] ?? []).map((dy) => ({ x: node.x, y: node.y + dy }));
}

export function outputPin(node: LogicNode): GridXY | null {
  if (isSink(node.kind)) return null;
  const { w, h } = nodeSize(node);
  return { x: node.x + w, y: node.y + (isGate(node.kind) ? Math.floor(h / 2) : 0) };
}

/** 方框重疊（相鄰不算）。 */
export function overlaps(a: LogicNode, b: LogicNode): boolean {
  const sa = nodeSize(a);
  const sb = nodeSize(b);
  return a.x < b.x + sb.w && b.x < a.x + sa.w && a.y < b.y + sb.h && b.y < a.y + sa.h;
}
