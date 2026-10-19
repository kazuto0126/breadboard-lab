import { getComponentDefinition } from '../core/circuit/library';
import { createModel } from '../core/simulation/models';
import { BLOCK_PINS } from './blocks';
import { inputCountOf } from './shapes';
import { isGate, isSink, signalOf, type BlockChip, type GateKind, type LogicDiagram, type LogicNode } from './types';

export type Bit = 0 | 1 | 'X';
/** 真值表的一格：輸出端是 0 / 1 / X，顯示器是 0–15 或 X。 */
/** 真值表的一格：輸出端 0 / 1 / X；BCD 顯示器是 0–15（有小數點時是「5.」）；每段直接控制的顯示器是亮的段（例如「bc.」、「-」）。 */
export type OutValue = Bit | number | string;

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

/** 規格（2026-10-13 logic-blocks）第 4 節：IC 方塊的輸出，用元件定義的 74LS 模型算；任何輸入是 X 時全部是 X。 */
export function blockOutputs(chip: BlockChip, inputs: Bit[]): Bit[] {
  const pins = BLOCK_PINS[chip];
  if (inputs.includes('X')) return pins.outputs.map(() => 'X');
  const spec = getComponentDefinition(chip)?.logic;
  if (!spec) return pins.outputs.map(() => 'X');
  const model = createModel(spec);
  const byName = new Map(pins.inputs.map((name, i) => [name, inputs[i]]));
  const out = model.evaluate((pin) => (byName.get(pin) ?? 1) as 0 | 1, model.init()).outputs;
  return pins.outputs.map((name) => {
    const v = out[name];
    return v === 0 || v === 1 ? v : 'X';
  });
}

/**
 * values：輸入端 id → 0 / 1；沒給的用節點自己的 value。displays：顯示器 id → 0–15（A + 2B + 4C + 8D）或 X。
 * 子專案 32：dps 是小數點（沒接是 0）；segs 是每段直接控制的顯示器亮的段（沒接的段是 0，有不確定的是 X）。
 */
export function evaluate(
  d: LogicDiagram,
  values: Record<string, 0 | 1> = {},
): { loop: string[] | null; nodes: Map<string, Bit>; displays: Map<string, number | 'X'>; dps: Map<string, Bit>; segs: Map<string, string[] | 'X'> } {
  const { order, loop } = topoOrder(d);
  const nodes = new Map<string, Bit>();
  const displays = new Map<string, number | 'X'>();
  const dps = new Map<string, Bit>();
  const segs = new Map<string, string[] | 'X'>();
  if (loop) return { loop, nodes, displays, dps, segs };
  const driver = new Map(d.wires.map((w) => [`${w.to.node}#${w.to.pin}`, signalOf(w.from, w.fromPin)]));
  const inputOf = (node: LogicNode, pin: number): Bit => {
    const from = driver.get(`${node.id}#${pin}`);
    return from === undefined ? 'X' : (nodes.get(from) ?? 'X');
  };
  for (const node of order) {
    if (node.kind === 'INPUT') nodes.set(node.id, values[node.id] ?? node.value ?? 0);
    else if (node.kind === 'HIGH') nodes.set(node.id, 1);
    else if (node.kind === 'LOW') nodes.set(node.id, 0);
    else if (node.kind === 'BLOCK' && node.chip) {
      const ins = Array.from({ length: inputCountOf(node) }, (_, i) => inputOf(node, i));
      blockOutputs(node.chip, ins).forEach((v, k) => nodes.set(signalOf(node.id, k), v));
    } else if (node.kind === 'OUTPUT') nodes.set(node.id, inputOf(node, 0));
    else if (node.kind === 'DISPLAY') {
      // 沒接的 DP、沒接的段當成 0（不亮）。
      const optional = (pin: number): Bit => (driver.has(`${node.id}#${pin}`) ? inputOf(node, pin) : 0);
      if (node.segments) {
        const bits = SEGMENT_NAMES.map((_, i) => optional(i));
        segs.set(node.id, bits.includes('X') ? 'X' : SEGMENT_NAMES.filter((_, i) => bits[i] === 1));
      } else {
        const bits = [0, 1, 2, 3].map((i) => inputOf(node, i));
        displays.set(node.id, bits.includes('X') ? 'X' : bits.reduce<number>((sum, b, i) => sum + (b as number) * (1 << i), 0));
        dps.set(node.id, optional(4));
      }
    }
    else if (isGate(node.kind)) {
      const ins = Array.from({ length: inputCountOf(node) }, (_, i) => inputOf(node, i));
      nodes.set(node.id, gateValue(node.kind, ins));
    }
  }
  return { loop: null, nodes, displays, dps, segs };
}

/** 輸出端的燈號亮不亮：一般是 1 時亮；子專案 37 低態致動是 0 時亮；不確定時不亮。 */
export const lampLit = (node: LogicNode, value: Bit | undefined): boolean => value === (node.activeLow ? 0 : 1);

const byName = (a: LogicNode, b: LogicNode) => ((a.name ?? '') < (b.name ?? '') ? -1 : (a.name ?? '') > (b.name ?? '') ? 1 : 0);

export function sortedIo(d: LogicDiagram): { inputs: LogicNode[]; outputs: LogicNode[] } {
  return {
    inputs: d.nodes.filter((n) => n.kind === 'INPUT').sort(byName),
    outputs: d.nodes.filter((n) => isSink(n.kind)).sort(byName),
  };
}

export const MAX_TABLE_INPUTS = 8;

/** 7 段的名稱（每段直接控制的顯示器的輸入順序）。 */
export const SEGMENT_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];

/** 子專案 32：顯示器在真值表裡的值（見 `OutValue`）。 */
export function displayValue(node: LogicNode, v: ReturnType<typeof evaluate>): OutValue {
  if (node.segments) {
    const lit = v.segs.get(node.id) ?? 'X';
    return lit === 'X' ? 'X' : segmentToken(lit);
  }
  const value = v.displays.get(node.id) ?? 'X';
  return value !== 'X' && v.dps.get(node.id) === 1 ? `${value}.` : value;
}

/** 亮的段寫成文字：a–g 依序，再加上「.」（dp）；都不亮是「-」。 */
export function segmentToken(lit: readonly string[]): string {
  const text = SEGMENT_NAMES.slice(0, 7).filter((s) => lit.includes(s)).join('') + (lit.includes('dp') ? '.' : '');
  return text || '-';
}

export type TruthTable =
  | { ok: true; inputs: string[]; outputs: string[]; rows: Array<{ in: Array<0 | 1>; out: OutValue[] }> }
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
    rows.push({ in: bits, out: outputs.map((o) => (o.kind === 'DISPLAY' ? displayValue(o, v) : (v.nodes.get(o.id) ?? 'X'))) });
  }
  return { ok: true, inputs: inputs.map((n) => n.name ?? n.id), outputs: outputs.map((n) => n.name ?? n.id), rows };
}
