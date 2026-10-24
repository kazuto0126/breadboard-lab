import { getComponentDefinition } from '../core/circuit/library';
import { createModel, type LogicModel, type ModelState } from '../core/simulation/models';
import { BLOCK_DEFAULTS, BLOCK_PINS, isSequentialChip } from './blocks';
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

/** 子專案 46：時序方塊（正反器、計數器）：有狀態，輸出由狀態決定。 */
const isSequentialNode = (n: LogicNode | undefined): boolean => n?.kind === 'BLOCK' && isSequentialChip(n.chip);

/** 子專案 46：圖裡有時序方塊或時脈（真值表改成時序表）。 */
export function isSequential(d: LogicDiagram): boolean {
  return d.nodes.some((n) => n.kind === 'CLOCK' || isSequentialNode(n));
}

/**
 * 拓撲順序（Kahn）；排不完的節點就是迴圈（以及被迴圈影響、排不進去的節點中，真的在環上的那些）。
 * 子專案 46：接到時序方塊的線不算（時序方塊的輸出由狀態決定），所以經過正反器的迴圈不是迴圈。
 */
export function topoOrder(d: LogicDiagram): { order: LogicNode[]; loop: string[] | null } {
  const indegree = new Map(d.nodes.map((n) => [n.id, 0]));
  const next = new Map<string, string[]>(d.nodes.map((n) => [n.id, []]));
  const sequential = new Set(d.nodes.filter(isSequentialNode).map((n) => n.id));
  for (const w of d.wires) {
    if (!indegree.has(w.from) || !indegree.has(w.to.node) || sequential.has(w.to.node)) continue;
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
 * 子專案 46：每個時序方塊的模型狀態與目前的輸出（依 BLOCK_PINS 的輸出順序）。不存檔；沒有的方塊從上電狀態（全部 0）開始。
 * 模型要先看過一次時脈的值才認得下一次的邊緣，所以從上電開始時先用目前的輸入求一次值（例如時脈是 0），再送脈衝。
 */
export type SeqState = Record<string, { state: ModelState; out: Bit[] }>;

const models = new Map<BlockChip, LogicModel>();
function modelOf(chip: BlockChip): LogicModel | null {
  if (!models.has(chip)) {
    const spec = getComponentDefinition(chip)?.logic;
    if (!spec) return null;
    models.set(chip, createModel(spec));
  }
  return models.get(chip)!;
}
const bitOf = (v: unknown): Bit => (v === 0 || v === 1 ? v : 'X');
/** 上電狀態：模型的初始狀態，輸出用沒接時的值算（不記下時脈，第一次真的求值時不會看成邊緣）。 */
function powerOn(chip: BlockChip): { state: ModelState; out: Bit[] } {
  const model = modelOf(chip)!;
  const defaults = BLOCK_DEFAULTS[chip] ?? {};
  const state = model.init();
  const out = model.evaluate((pin) => defaults[pin] ?? 1, state).outputs;
  return { state, out: BLOCK_PINS[chip].outputs.map((name) => bitOf(out[name])) };
}

/** 子專案 46：時序方塊最多重算幾次（漣波計數器一級一級傳下去）。 */
const MAX_SETTLE = 32;

/**
 * values：輸入端 id → 0 / 1；沒給的用節點自己的 value。displays：顯示器 id → 0–15（A + 2B + 4C + 8D）或 X。
 * 子專案 32：dps 是小數點（沒接是 0）；segs 是每段直接控制的顯示器亮的段（沒接的段是 0，有不確定的是 X）。
 */
export function evaluate(
  d: LogicDiagram,
  values: Record<string, 0 | 1> = {},
  state?: SeqState,
): { loop: string[] | null; nodes: Map<string, Bit>; displays: Map<string, number | 'X'>; dps: Map<string, Bit>; segs: Map<string, string[] | 'X'>; seq: SeqState } {
  const { order, loop } = topoOrder(d);
  if (loop) return { loop, nodes: new Map(), displays: new Map(), dps: new Map(), segs: new Map(), seq: state ?? {} };
  const driver = new Map(d.wires.map((w) => [`${w.to.node}#${w.to.pin}`, signalOf(w.from, w.fromPin)]));
  const sequential = order.filter(isSequentialNode);
  const seq: SeqState = {};
  for (const node of sequential) seq[node.id] = state?.[node.id] ?? powerOn(node.chip!);
  /** 時序方塊的輸入：沒接時用 BLOCK_DEFAULTS 的值。 */
  const readOf = (node: LogicNode, current: Map<string, Bit>) => {
    const names = BLOCK_PINS[node.chip!].inputs;
    const defaults = BLOCK_DEFAULTS[node.chip!] ?? {};
    return (pin: string): Bit => {
      const i = names.indexOf(pin);
      const from = i < 0 ? undefined : driver.get(`${node.id}#${i}`);
      return from === undefined ? (defaults[pin] ?? 1) : (current.get(from) ?? 'X');
    };
  };
  // 子專案 46：先用目前的輸出算組合邏輯，再用模型算每個時序方塊（看時脈邊緣、更新狀態）；輸出有變就再算一次。
  let result = combinational(order, driver, values, seq);
  for (let round = 0; sequential.length > 0 && round < MAX_SETTLE; round++) {
    let changed = false;
    for (const node of sequential) {
      const ev = modelOf(node.chip!)!.evaluate(readOf(node, result.nodes), seq[node.id].state);
      const out = BLOCK_PINS[node.chip!].outputs.map((name) => bitOf(ev.outputs[name]));
      if (out.some((b, k) => b !== seq[node.id].out[k])) changed = true;
      seq[node.id] = { state: ev.state, out };
    }
    if (!changed) break;
    result = combinational(order, driver, values, seq);
  }
  return { loop: null, ...result, seq };
}

/** 照拓撲順序算一次（時序方塊的輸出用 seq 裡目前的值）。 */
function combinational(order: LogicNode[], driver: Map<string, string>, values: Record<string, 0 | 1>, seq: SeqState) {
  const nodes = new Map<string, Bit>();
  const displays = new Map<string, number | 'X'>();
  const dps = new Map<string, Bit>();
  const segs = new Map<string, string[] | 'X'>();
  const inputOf = (node: LogicNode, pin: number): Bit => {
    const from = driver.get(`${node.id}#${pin}`);
    return from === undefined ? 'X' : (nodes.get(from) ?? 'X');
  };
  for (const node of order) {
    if (node.kind === 'INPUT' || node.kind === 'CLOCK') nodes.set(node.id, values[node.id] ?? node.value ?? 0);
    else if (node.kind === 'HIGH') nodes.set(node.id, 1);
    else if (node.kind === 'LOW') nodes.set(node.id, 0);
    else if (isSequentialNode(node)) seq[node.id].out.forEach((v, k) => nodes.set(signalOf(node.id, k), v));
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
  return { nodes, displays, dps, segs };
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
  | { ok: false; reason: 'loop' | 'too-many' | 'empty' | 'sequential'; loop?: string[] };

/** 規格第 3 節：輸入端依名稱排序，第一個是最高位元，從全 0 數到全 1。 */
export function truthTable(d: LogicDiagram): TruthTable {
  const { inputs, outputs } = sortedIo(d);
  const loop = topoOrder(d).loop;
  if (loop) return { ok: false, reason: 'loop', loop };
  // 子專案 46：時序電路沒有真值表（看時序表）。
  if (isSequential(d)) return { ok: false, reason: 'sequential' };
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

export type SequenceTable =
  | { ok: true; clock: string; outputs: string[]; rows: Array<{ pulse: number; out: OutValue[] }> }
  | { ok: false; reason: 'no-clock' | 'loop' | 'empty'; loop?: string[] };

/** 子專案 46：時序表的列數（第 0 次到第 n 次脈衝）可以選的值。 */
export const PULSE_CHOICES = [8, 16, 32];

/**
 * 子專案 46（規格 2026-10-24 sequential-logic 第 4 節）：從重設（全部 0）開始，其他輸入用 values（沒給時用開關目前的值），
 * 送 pulses 個脈衝（0 → 1 → 0），列出每次之後每個輸出端、顯示器的值。
 */
export function sequenceTable(d: LogicDiagram, pulses = 16, values: Record<string, 0 | 1> = {}): SequenceTable {
  const clock = d.nodes.find((n) => n.kind === 'CLOCK');
  const loop = topoOrder(d).loop;
  if (loop) return { ok: false, reason: 'loop', loop };
  if (!clock) return { ok: false, reason: 'no-clock' };
  const { outputs } = sortedIo(d);
  if (outputs.length === 0) return { ok: false, reason: 'empty' };
  const read = (v: ReturnType<typeof evaluate>) => outputs.map((o) => (o.kind === 'DISPLAY' ? displayValue(o, v) : (v.nodes.get(o.id) ?? 'X')));
  let v = evaluate(d, { ...values, [clock.id]: 0 });
  const rows = [{ pulse: 0, out: read(v) }];
  for (let k = 1; k <= pulses; k++) {
    const up = evaluate(d, { ...values, [clock.id]: 1 }, v.seq);
    v = evaluate(d, { ...values, [clock.id]: 0 }, up.seq);
    rows.push({ pulse: k, out: read(v) });
  }
  return { ok: true, clock: clock.name ?? clock.id, outputs: outputs.map((n) => n.name ?? n.id), rows };
}
