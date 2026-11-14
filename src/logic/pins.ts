import type { CustomBlock, LogicDiagram, LogicNode } from './types';

/**
 * 子專案 66（規格 2026-11-14 bus 第 2 節）：自訂方塊的一個腳：一位元的腳是一個輸入端（輸出端）；
 * 多位元的腳是名稱「同一個名字 + 0…n−1」的一組（nodes 照位元順序，第 k 個是第 k 位）。
 */
export interface PinGroup {
  /** 比對用的名稱：一位元是名稱，多位元是名字（例如 A）。 */
  key: string;
  /** 畫在方塊上的字：A 或 A[3:0]。 */
  label: string;
  nodes: LogicNode[];
}

export const MIN_BUS = 2;
export const MAX_BUS = 8;

const byPlace = (a: LogicNode, c: LogicNode) => a.y - c.y || a.x - c.x;

function groupOf(list: LogicNode[], bus: boolean): PinGroup[] {
  const sorted = [...list].sort(byPlace);
  if (!bus) return sorted.map((n) => ({ key: n.name ?? n.id, label: n.name ?? n.id, nodes: [n] }));
  const parts = new Map<string, Map<number, LogicNode>>();
  for (const n of sorted) {
    const m = /^(.*?[A-Za-z_])(\d+)$/.exec(n.name ?? '');
    if (!m) continue;
    const bits = parts.get(m[1]) ?? new Map<number, LogicNode>();
    bits.set(Number(m[2]), n);
    parts.set(m[1], bits);
  }
  /** 剛好是 0…n−1（n ≥ 2，最多 MAX_BUS 位）的那幾組。 */
  const groups = new Map<string, LogicNode[]>();
  for (const [base, bits] of parts) {
    const n = bits.size;
    if (n < MIN_BUS || n > MAX_BUS || !Array.from({ length: n }, (_, k) => bits.has(k)).every(Boolean)) continue;
    if (sorted.some((x) => x.name === base)) continue;
    groups.set(base, Array.from({ length: n }, (_, k) => bits.get(k)!));
  }
  const out: PinGroup[] = [];
  const done = new Set<string>();
  for (const n of sorted) {
    const base = [...groups.entries()].find(([, nodes]) => nodes.includes(n))?.[0];
    if (base === undefined) out.push({ key: n.name ?? n.id, label: n.name ?? n.id, nodes: [n] });
    else if (!done.has(base)) {
      done.add(base);
      const nodes = groups.get(base)!;
      out.push({ key: base, label: `${base}[${nodes.length - 1}:0]`, nodes });
    }
  }
  return out;
}

/** 方塊的腳：輸入腳、輸出腳（照圖上的位置由上到下；多位元腳在那一組最上面的位置）。 */
export function blockPinGroups(b: Pick<CustomBlock, 'nodes' | 'busPins'>): { inputs: PinGroup[]; outputs: PinGroup[] } {
  return {
    inputs: groupOf(b.nodes.filter((n) => n.kind === 'INPUT'), !!b.busPins),
    outputs: groupOf(b.nodes.filter((n) => n.kind === 'OUTPUT'), !!b.busPins),
  };
}

const blockOfNode = (d: Pick<LogicDiagram, 'blocks'>, node: LogicNode) => (node.kind === 'CUSTOM' ? d.blocks?.find((b) => b.id === node.block) : undefined);

/** 第 pin 個輸入腳的位元數。 */
export function inWidth(d: Pick<LogicDiagram, 'blocks'>, node: LogicNode, pin: number): number {
  if (node.kind === 'SPLIT') return node.width ?? 1;
  const b = blockOfNode(d, node);
  return b ? (blockPinGroups(b).inputs[pin]?.nodes.length ?? 1) : 1;
}

/** 第 pin 個輸出腳的位元數。 */
export function outWidth(d: Pick<LogicDiagram, 'blocks'>, node: LogicNode, pin: number): number {
  if (node.kind === 'MERGE') return node.width ?? 1;
  const b = blockOfNode(d, node);
  return b ? (blockPinGroups(b).outputs[pin]?.nodes.length ?? 1) : 1;
}
