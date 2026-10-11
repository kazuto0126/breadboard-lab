import { inputCountOf } from './shapes';
import { isGate, type GateKind, type LogicDiagram, type LogicNode } from './types';

export type Bit = 0 | 1 | 'X';

/** 規格第 3 節：三值邏輯。 */
export function gateValue(kind: GateKind, inputs: Bit[]): Bit {
  const and = (): Bit => (inputs.includes(0) ? 0 : inputs.includes('X') ? 'X' : 1);
  const or = (): Bit => (inputs.includes(1) ? 1 : inputs.includes('X') ? 'X' : 0);
  const not = (b: Bit): Bit => (b === 'X' ? 'X' : b === 1 ? 0 : 1);
  switch (kind) {
    case 'AND':
      return and();
    case 'OR':
      return or();
    case 'NAND':
      return not(and());
    case 'NOR':
      return not(or());
    case 'NOT':
      return not(inputs[0] ?? 'X');
    case 'XOR':
      return inputs.includes('X') ? 'X' : ((inputs.filter((b) => b === 1).length % 2) as 0 | 1);
  }
}

/** 拓撲順序（Kahn）；排不完的節點就是迴圈（以及被迴圈影響、排不進去的節點中，真的在環上的那些）。 */
export function topoOrder(d: LogicDiagram): { order: LogicNode[]; loop: string[] | null } {
  const indegree = new Map(d.nodes.map((n) => [n.id, 0]));
  const next = new Map<string, string[]>(d.nodes.map((n) => [n.id, []]));
  for (const w of d.wires) {
    if (!indegree.has(w.from) || !indegree.has(w.to.node)) continue;
    indegree.set(w.to.node, indegree.get(w.to.node)! + 1);
    next.get(w.from)!.push(w.to.node);
  }
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  const queue = d.nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  const order: LogicNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(byId.get(id)!);
    for (const t of next.get(id)!) {
      indegree.set(t, indegree.get(t)! - 1);
      if (indegree.get(t) === 0) queue.push(t);
    }
  }
  if (order.length === d.nodes.length) return { order, loop: null };
  // 剩下的節點裡，能從自己走回自己的才是環上的節點。
  const left = new Set(d.nodes.filter((n) => !order.includes(n)).map((n) => n.id));
  const onCycle = [...left].filter((start) => {
    const seen = new Set<string>();
    const stack = [...(next.get(start) ?? [])];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (id === start) return true;
      if (seen.has(id) || !left.has(id)) continue;
      seen.add(id);
      stack.push(...(next.get(id) ?? []));
    }
    return false;
  });
  return { order, loop: onCycle.sort() };
}

/** values：輸入端 id → 0 / 1；沒給的用節點自己的 value。 */
export function evaluate(d: LogicDiagram, values: Record<string, 0 | 1> = {}): { loop: string[] | null; nodes: Map<string, Bit> } {
  const { order, loop } = topoOrder(d);
  const nodes = new Map<string, Bit>();
  if (loop) return { loop, nodes };
  const driver = new Map(d.wires.map((w) => [`${w.to.node}#${w.to.pin}`, w.from]));
  const inputOf = (node: LogicNode, pin: number): Bit => {
    const from = driver.get(`${node.id}#${pin}`);
    return from === undefined ? 'X' : (nodes.get(from) ?? 'X');
  };
  for (const node of order) {
    if (node.kind === 'INPUT') nodes.set(node.id, values[node.id] ?? node.value ?? 0);
    else if (node.kind === 'OUTPUT') nodes.set(node.id, inputOf(node, 0));
    else if (isGate(node.kind)) {
      const ins = Array.from({ length: inputCountOf(node) }, (_, i) => inputOf(node, i));
      nodes.set(node.id, gateValue(node.kind, ins));
    }
  }
  return { loop: null, nodes };
}

const byName = (a: LogicNode, b: LogicNode) => ((a.name ?? '') < (b.name ?? '') ? -1 : (a.name ?? '') > (b.name ?? '') ? 1 : 0);

export function sortedIo(d: LogicDiagram): { inputs: LogicNode[]; outputs: LogicNode[] } {
  return {
    inputs: d.nodes.filter((n) => n.kind === 'INPUT').sort(byName),
    outputs: d.nodes.filter((n) => n.kind === 'OUTPUT').sort(byName),
  };
}

export const MAX_TABLE_INPUTS = 8;

export type TruthTable =
  | { ok: true; inputs: string[]; outputs: string[]; rows: Array<{ in: Array<0 | 1>; out: Bit[] }> }
  | { ok: false; reason: 'loop' | 'too-many' | 'empty'; loop?: string[] };

/** 規格第 3 節：輸入端依名稱排序，第一個是最高位元，從全 0 數到全 1。 */
export function truthTable(d: LogicDiagram): TruthTable {
  const { inputs, outputs } = sortedIo(d);
  const loop = topoOrder(d).loop;
  if (loop) return { ok: false, reason: 'loop', loop };
  if (inputs.length === 0 && outputs.length === 0) return { ok: false, reason: 'empty' };
  if (inputs.length > MAX_TABLE_INPUTS) return { ok: false, reason: 'too-many' };
  const rows = [];
  for (let r = 0; r < 1 << inputs.length; r++) {
    const bits = inputs.map((_, i) => ((r >> (inputs.length - 1 - i)) & 1) as 0 | 1);
    const v = evaluate(d, Object.fromEntries(inputs.map((n, i) => [n.id, bits[i]])));
    rows.push({ in: bits, out: outputs.map((o) => v.nodes.get(o.id) ?? 'X') });
  }
  return { ok: true, inputs: inputs.map((n) => n.name ?? n.id), outputs: outputs.map((n) => n.name ?? n.id), rows };
}
