import { getComponentDefinition } from '../core/circuit/library';
import { flat } from './flatten';
import { createModel, type LogicModel, type ModelState } from '../core/simulation/models';
import { BLOCK_DEFAULTS, BLOCK_PINS, HALF_CHIP, isSequentialChip } from './blocks';
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
  d = flat(d).diagram;
  return d.nodes.some((n) => n.kind === 'CLOCK' || isSequentialNode(n));
}

/**
 * 拓撲順序（Kahn）；排不完的節點就是迴圈（以及被迴圈影響、排不進去的節點中，真的在環上的那些）。
 * 子專案 46：接到時序方塊的線不算（時序方塊的輸出由狀態決定），所以經過正反器的迴圈不是迴圈。
 */
export function topoOrder(d: LogicDiagram): { order: LogicNode[]; loop: string[] | null } {
  d = flat(d).diagram;
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
/** 子專案 51：單顆正反器用那顆 IC 的模型。 */
function modelOf(block: BlockChip): LogicModel | null {
  const chip = HALF_CHIP[block] ?? block;
  if (!models.has(chip)) {
    const spec = getComponentDefinition(chip)?.logic;
    if (!spec) return null;
    models.set(chip, createModel(spec));
  }
  return models.get(chip)!;
}
const bitOf = (v: unknown): Bit => (v === 0 || v === 1 ? v : 'X');
/** 子專案 51：模型的腳名換成方塊的腳名（單顆正反器是 IC 的第 1 組：1D → D）；第 2 組的腳不是方塊的腳（undefined）。 */
function blockPin(chip: BlockChip, pin: string): string | undefined {
  if (!HALF_CHIP[chip]) return pin;
  const own = pin.slice(1);
  return pin.startsWith('1') && (BLOCK_PINS[chip].inputs.includes(own) || BLOCK_PINS[chip].outputs.includes(own)) ? own : undefined;
}
/** 方塊的輸出腳在模型裡的名稱。 */
const modelOutput = (chip: BlockChip, name: string) => (HALF_CHIP[chip] ? `1${name}` : name);
/** 沒接的輸入：方塊自己的值；單顆正反器另一組的腳用那顆 IC 沒接時的值。 */
function defaultOf(chip: BlockChip, pin: string): 0 | 1 {
  const own = blockPin(chip, pin);
  const base = HALF_CHIP[chip];
  return (own === undefined ? undefined : BLOCK_DEFAULTS[chip]?.[own]) ?? (base ? BLOCK_DEFAULTS[base]?.[pin] : undefined) ?? 1;
}
/** 上電狀態：模型的初始狀態，輸出用沒接時的值算（不記下時脈，第一次真的求值時不會看成邊緣）。 */
function powerOn(chip: BlockChip): { state: ModelState; out: Bit[] } {
  const model = modelOf(chip)!;
  const state = model.init();
  const out = model.evaluate((pin) => defaultOf(chip, pin), state).outputs;
  return { state, out: BLOCK_PINS[chip].outputs.map((name) => bitOf(out[modelOutput(chip, name)])) };
}

/** 子專案 46：時序方塊最多重算幾次（漣波計數器一級一級傳下去）。 */
const MAX_SETTLE = 32;

/**
 * 子專案 59：閘接回前面的迴授（例如 NAND 交叉接成的 SR 閂鎖）。迴授上的值記在 SeqState 裡（key 是 LOOP_KEY + 訊號），
 * 下次求值時從記住的值開始算（閂鎖會「保持」）；沒記過的從 0 開始（上電狀態）。
 */
const LOOP_KEY = 'loop:';
/** 子專案 60：迴授上還沒記過的值從幾開始（上電狀態，記在 LOOP_KEY + POWER_ON；沒有時是 0）。 */
const POWER_ON = '*';
/** 子專案 60：上電時迴授上的值都是 seed（比對時用 0 與 1 各算一次，找出跟上電狀態有關的格子）。 */
export const powerOnState = (seed: 0 | 1): SeqState => ({ [LOOP_KEY + POWER_ON]: { state: { prev: {}, bits: [] }, out: [seed] } });
/** 迴授最多來回算幾輪；還在變就判定不穩定（一直來回跳，例如 NOT 接回自己），那些訊號當成 X。 */
const MAX_LOOP_PASSES = 64;

/**
 * values：輸入端 id → 0 / 1；沒給的用節點自己的 value。displays：顯示器 id → 0–15（A + 2B + 4C + 8D）或 X。
 * 子專案 32：dps 是小數點（沒接是 0）；segs 是每段直接控制的顯示器亮的段（沒接的段是 0，有不確定的是 X）。
 */
export function evaluate(
  d0: LogicDiagram,
  values: Record<string, 0 | 1> = {},
  state?: SeqState,
): { nodes: Map<string, Bit>; displays: Map<string, number | 'X'>; dps: Map<string, Bit>; segs: Map<string, string[] | 'X'>; seq: SeqState; unstable: Set<string> } {
  // 子專案 65：自訂方塊先展開；方塊輸出腳的值用展開後對應訊號的值（畫線的顏色、屬性面板用）。
  const { diagram: d, alias } = flat(d0);
  const r = evaluateFlat(d, values, state);
  for (const [a, b] of alias) r.nodes.set(a, r.nodes.get(b) ?? 'X');
  return r;
}

function evaluateFlat(d: LogicDiagram, values: Record<string, 0 | 1>, state: SeqState | undefined) {
  const topo = topoOrder(d);
  // 子專案 59：有迴授時，排不進拓撲順序的節點照圖上的順序接在後面，整張圖來回算到不再變。
  const order = topo.loop ? [...topo.order, ...d.nodes.filter((n) => !topo.order.includes(n))] : topo.order;
  const feedback = topo.loop ? order.slice(topo.order.length).filter((n) => !isSequentialNode(n)) : [];
  const driver = new Map(d.wires.map((w) => [`${w.to.node}#${w.to.pin}`, signalOf(w.from, w.fromPin)]));
  const sequential = order.filter(isSequentialNode);
  const seq: SeqState = {};
  for (const node of sequential) seq[node.id] = state?.[node.id] ?? powerOn(node.chip!);
  const memory = new Map<string, Bit>();
  for (const [key, entry] of Object.entries(state ?? {})) if (key.startsWith(LOOP_KEY)) memory.set(key.slice(LOOP_KEY.length), entry.out[0]);
  /** 時序方塊的輸入：沒接時用 BLOCK_DEFAULTS 的值。 */
  const readOf = (node: LogicNode, current: Map<string, Bit>) => {
    const chip = node.chip!;
    const names = BLOCK_PINS[chip].inputs;
    return (pin: string): Bit => {
      const own = blockPin(chip, pin);
      const i = own === undefined ? -1 : names.indexOf(own);
      const from = i < 0 ? undefined : driver.get(`${node.id}#${i}`);
      return from === undefined ? defaultOf(chip, pin) : (current.get(from) ?? 'X');
    };
  };
  // 子專案 46：先用目前的輸出算組合邏輯，再用模型算每個時序方塊（看時脈邊緣、更新狀態）；輸出有變就再算一次。
  let result = combinational(order, driver, values, seq, feedback.length > 0 ? memory : null);
  for (let round = 0; sequential.length > 0 && round < MAX_SETTLE; round++) {
    let changed = false;
    for (const node of sequential) {
      const ev = modelOf(node.chip!)!.evaluate(readOf(node, result.nodes), seq[node.id].state);
      const out = BLOCK_PINS[node.chip!].outputs.map((name) => bitOf(ev.outputs[modelOutput(node.chip!, name)]));
      if (out.some((b, k) => b !== seq[node.id].out[k])) changed = true;
      seq[node.id] = { state: ev.state, out };
    }
    if (!changed) break;
    result = combinational(order, driver, values, seq, feedback.length > 0 ? memory : null);
  }
  // 子專案 59：記住迴授上的值（下次從這裡開始算）。
  for (const node of feedback) {
    const signals = node.kind === 'BLOCK' ? BLOCK_PINS[node.chip!].outputs.map((_, k) => signalOf(node.id, k)) : isGate(node.kind) ? [node.id] : [];
    for (const s of signals) seq[LOOP_KEY + s] = { state: { prev: {}, bits: [] }, out: [result.nodes.get(s) ?? 'X'] };
  }
  return { ...result, seq };
}

/**
 * 照順序算一次（時序方塊的輸出用 seq 裡目前的值）。子專案 59：memory 不是 null 時圖裡有迴授：
 * 從記住的值（沒有時是 0）開始，一輪一輪照順序重算到不再變（每輪用到的是最新的值）；算了 MAX_LOOP_PASSES 輪還在變的訊號當成 X（不穩定）。
 */
function combinational(order: LogicNode[], driver: Map<string, string>, values: Record<string, 0 | 1>, seq: SeqState, memory: Map<string, Bit> | null) {
  const nodes = new Map<string, Bit>(memory ?? []);
  const unstable = new Set<string>();
  const displays = new Map<string, number | 'X'>();
  const dps = new Map<string, Bit>();
  const segs = new Map<string, string[] | 'X'>();
  const inputOf = (node: LogicNode, pin: number): Bit => {
    const from = driver.get(`${node.id}#${pin}`);
    return from === undefined ? 'X' : (nodes.get(from) ?? (memory ? (memory.get(POWER_ON) ?? 0) : 'X'));
  };
  const set = (signal: string, v: Bit) => nodes.set(signal, unstable.has(signal) ? 'X' : v);
  const pass = () => {
    for (const node of order) {
      if (node.kind === 'INPUT' || node.kind === 'CLOCK') nodes.set(node.id, values[node.id] ?? node.value ?? 0);
      else if (node.kind === 'HIGH') nodes.set(node.id, 1);
      else if (node.kind === 'LOW') nodes.set(node.id, 0);
      else if (isSequentialNode(node)) seq[node.id].out.forEach((v, k) => nodes.set(signalOf(node.id, k), v));
      else if (node.kind === 'BLOCK' && node.chip) {
        const ins = Array.from({ length: inputCountOf(node) }, (_, i) => inputOf(node, i));
        blockOutputs(node.chip, ins).forEach((v, k) => set(signalOf(node.id, k), v));
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
        set(node.id, gateValue(node.kind, ins));
      }
    }
  };
  pass();
  if (memory) {
    // 先找出一直在變的訊號（不穩定），當成 X 之後再算到穩定（X 傳下去也會停）。
    for (let round = 0; round < 2; round++) {
      for (let k = 0; k < MAX_LOOP_PASSES; k++) {
        const before = new Map(nodes);
        pass();
        const changed = [...nodes].filter(([s, v]) => before.get(s) !== v).map(([s]) => s);
        if (changed.length === 0) break;
        if (k === MAX_LOOP_PASSES - 1) for (const s of changed) unstable.add(s);
      }
      if (unstable.size === 0) break;
    }
  }
  return { nodes, displays, dps, segs, unstable };
}

/**
 * 子專案 61（課本圖 10-17 的競跑）：每個閘的延遲一樣時（每一步所有閘同時看上一步的值），從 state 記住的值開始，
 * 這組輸入會不會一直來回跳。只看閘與組合 IC 方塊（有時序方塊的圖不判斷，回傳 false）。
 */
export function racesFrom(d: LogicDiagram, values: Record<string, 0 | 1>, state: SeqState): boolean {
  d = flat(d).diagram;
  if (isSequential(d) || !topoOrder(d).loop) return false;
  const driver = new Map(d.wires.map((w) => [`${w.to.node}#${w.to.pin}`, signalOf(w.from, w.fromPin)]));
  let now = new Map<string, Bit>();
  for (const [key, entry] of Object.entries(state)) if (key.startsWith(LOOP_KEY)) now.set(key.slice(LOOP_KEY.length), entry.out[0]);
  const seed = now.get(POWER_ON) ?? 0;
  // 不在迴授上的閘（輸入端到迴授之間）先照新的輸入算好，迴授上的閘再一起一步一步更新。
  for (const node of topoOrder(d).order) {
    const read = (pin: number): Bit => {
      const from = driver.get(`${node.id}#${pin}`);
      return from === undefined ? 'X' : (now.get(from) ?? seed);
    };
    if (node.kind === 'INPUT' || node.kind === 'CLOCK') now.set(node.id, values[node.id] ?? node.value ?? 0);
    else if (node.kind === 'HIGH') now.set(node.id, 1);
    else if (node.kind === 'LOW') now.set(node.id, 0);
    else if (node.kind === 'BLOCK' && node.chip) blockOutputs(node.chip, Array.from({ length: inputCountOf(node) }, (_, i) => read(i))).forEach((v, k) => now.set(signalOf(node.id, k), v));
    else if (isGate(node.kind)) now.set(node.id, gateValue(node.kind, Array.from({ length: inputCountOf(node) }, (_, i) => read(i))));
  }
  const seen = new Set<string>();
  for (let step = 0; step < MAX_LOOP_PASSES; step++) {
    const next = new Map<string, Bit>();
    const inputOf = (node: LogicNode, pin: number): Bit => {
      const from = driver.get(`${node.id}#${pin}`);
      return from === undefined ? 'X' : (now.get(from) ?? seed);
    };
    for (const node of d.nodes) {
      if (node.kind === 'INPUT' || node.kind === 'CLOCK') next.set(node.id, values[node.id] ?? node.value ?? 0);
      else if (node.kind === 'HIGH') next.set(node.id, 1);
      else if (node.kind === 'LOW') next.set(node.id, 0);
      else if (node.kind === 'BLOCK' && node.chip) blockOutputs(node.chip, Array.from({ length: inputCountOf(node) }, (_, i) => inputOf(node, i))).forEach((v, k) => next.set(signalOf(node.id, k), v));
      else if (isGate(node.kind)) next.set(node.id, gateValue(node.kind, Array.from({ length: inputCountOf(node) }, (_, i) => inputOf(node, i))));
    }
    const key = [...next].sort(([a], [b]) => (a < b ? -1 : 1)).map(([s, v]) => `${s}=${v}`).join(',');
    if ([...next].every(([s, v]) => now.get(s) === v)) return false;
    // 回到看過的狀態：一直在幾個狀態之間轉圈。
    if (seen.has(key)) return true;
    seen.add(key);
    now = next;
  }
  return true;
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

/** 子專案 59：輸入最多 12 個（真值表 4096 列；以前是 8 個）。 */
export const MAX_TABLE_INPUTS = 12;

/** 子專案 59：有迴授的電路，輸出跟之前的狀態有關的格子（例如閂鎖 S = R = 0 時）。 */
export const HOLD = '保持';
/** 子專案 59：一直來回跳、停不下來的格子（例如 NOT 接回自己）。 */
export const UNSTABLE = '不穩定';
/** 子專案 59：算真值表時最多記幾種迴授狀態。 */
const MAX_MEMORY_STATES = 16;

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
  | { ok: true; inputs: string[]; outputs: string[]; rows: Array<{ in: Array<0 | 1>; out: OutValue[] }>; /** 子專案 59：圖裡有迴授（格子可能是「保持」「不穩定」）。 */ feedback?: true }
  | { ok: false; reason: 'too-many' | 'empty' | 'sequential' };

/**
 * 規格第 3 節：輸入端依名稱排序，第一個是最高位元，從全 0 數到全 1。
 * 子專案 59：有迴授時，每一列從每一種可能的狀態（上電狀態，以及任何一列留下的狀態）各算一次：
 * 都一樣就寫那個值，不一樣寫「保持」（跟之前的狀態有關），有一次停不下來就寫「不穩定」。
 */
export function truthTable(d: LogicDiagram): TruthTable {
  d = flat(d).diagram;
  const { inputs, outputs } = sortedIo(d);
  // 子專案 46：時序電路沒有真值表（看時序表）。
  if (isSequential(d)) return { ok: false, reason: 'sequential' };
  if (inputs.length === 0 && outputs.length === 0) return { ok: false, reason: 'empty' };
  if (inputs.length > MAX_TABLE_INPUTS) return { ok: false, reason: 'too-many' };
  const rowBits = Array.from({ length: 1 << inputs.length }, (_, r) => inputs.map((_, i) => ((r >> (inputs.length - 1 - i)) & 1) as 0 | 1));
  const valuesOf = (bits: Array<0 | 1>) => Object.fromEntries(inputs.map((n, i) => [n.id, bits[i]]));
  const read = (v: ReturnType<typeof evaluate>) => outputs.map((o) => (o.kind === 'DISPLAY' ? displayValue(o, v) : (v.nodes.get(o.id) ?? 'X')));
  const head = { ok: true as const, inputs: inputs.map((n) => n.name ?? n.id), outputs: outputs.map((n) => n.name ?? n.id) };
  const topo = topoOrder(d);
  if (!topo.loop) return { ...head, rows: rowBits.map((bits) => ({ in: bits, out: read(evaluate(d, valuesOf(bits))) })) };

  const starts: SeqState[] = [{}];
  const seen = new Set([memoryKey({})]);
  const results: Array<Array<{ out: OutValue[]; unstable: boolean }>> = rowBits.map(() => []);
  for (let s = 0; s < starts.length; s++) {
    rowBits.forEach((bits, r) => {
      const v = evaluate(d, valuesOf(bits), starts[s]);
      results[r].push({ out: read(v), unstable: v.unstable.size > 0 });
      const key = memoryKey(v.seq);
      if (!seen.has(key) && starts.length < MAX_MEMORY_STATES) {
        seen.add(key);
        starts.push(v.seq);
      }
    });
  }
  // 子專案 61（課本圖 10-17 的競跑）：從其他列留下的每一種狀態切到這一列，閘的延遲一樣時都會一直來回跳，這一列接在迴授後面的輸出寫「不穩定」。
  // 上電狀態（對稱的全 0）和這一列自己留下的狀態不算；只有一部分會跳（例如閂鎖從 S = R = 1 放開）時照舊寫「保持」。
  const afterLoop = new Set(d.nodes.filter((n) => !topo.order.includes(n)).map((n) => n.id));
  const races = rowBits.map((bits, r) => {
    const own = memoryKey(evaluate(d, valuesOf(bits)).seq);
    const others = starts.slice(1).filter((st) => memoryKey(st) !== own);
    return others.length > 0 && others.every((st) => racesFrom(d, valuesOf(bits), st));
  });
  const rows = rowBits.map((bits, r) => ({
    in: bits,
    out: outputs.map((o, k): OutValue => {
      const cells = results[r];
      if (cells.some((c) => c.unstable && c.out[k] === 'X')) return UNSTABLE;
      if (races[r] && afterLoop.has(o.id)) return UNSTABLE;
      return cells.every((c) => c.out[k] === cells[0].out[k]) ? cells[0].out[k] : HOLD;
    }),
  }));
  return { ...head, rows, feedback: true };
}

/** 迴授記住的值寫成一個字串（比較是不是同一種狀態）。 */
function memoryKey(seq: SeqState): string {
  return Object.keys(seq)
    .filter((k) => k.startsWith(LOOP_KEY))
    .sort()
    .map((k) => `${k}=${seq[k].out[0]}`)
    .join(',');
}

export type SequenceTable =
  | {
      ok: true;
      /** 第一個送的時脈（只有一個時脈時就是它）。 */
      clock: string;
      /** 子專案 64：圖上所有時脈的名稱（依名稱排序）。 */
      clocks: string[];
      outputs: string[];
      /** 子專案 50：每欄是不是顯示器（波形畫成數字）。 */
      display: boolean[];
      /** clock：這一列之前送了哪個時脈（第 0 列沒有）。 */
      rows: Array<{ pulse: number; out: OutValue[]; clock?: string }>;
    }
  | { ok: false; reason: 'no-clock' | 'empty' }
  | { ok: false; reason: 'bad-order'; unknown: string[] };

/** 子專案 64：圖上的時脈，依名稱排序。 */
export function clockNodes(d: LogicDiagram): LogicNode[] {
  return d.nodes.filter((n) => n.kind === 'CLOCK').sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id, 'en', { numeric: true }));
}

/** 子專案 64：輪流送每一個時脈的順序（比對麵包板時用，每個時脈都比得到）。 */
export const allClocks = (d: LogicDiagram): string[] => clockNodes(d).map((n) => n.name ?? n.id);

/** 子專案 46：時序表的列數（第 0 次到第 n 次脈衝）可以選的值。 */
export const PULSE_CHOICES = [8, 16, 32];

/**
 * 子專案 46（規格 2026-10-24 sequential-logic 第 4 節）：從重設（全部 0）開始，其他輸入用 values（沒給時用開關目前的值），
 * 送 pulses 個脈衝（0 → 1 → 0），列出每次之後每個輸出端、顯示器的值。
 */
/**
 * 子專案 60：seed 是迴授（閂鎖）上電時的值（預設 0）。
 * 子專案 64：order 是時脈名稱的清單，照順序一直重複送；沒給時送名稱排第一個的時脈。每次送一個時脈，其他時脈留在 0。
 */
export function sequenceTable(d: LogicDiagram, pulses = 16, values: Record<string, 0 | 1> = {}, seed: 0 | 1 = 0, order?: string[]): SequenceTable {
  d = flat(d).diagram;
  const clocks = clockNodes(d);
  if (clocks.length === 0) return { ok: false, reason: 'no-clock' };
  const byName = new Map(clocks.map((n) => [n.name ?? n.id, n]));
  const names = order && order.length > 0 ? order : [clocks[0].name ?? clocks[0].id];
  const unknown = names.filter((n) => !byName.has(n));
  if (unknown.length > 0) return { ok: false, reason: 'bad-order', unknown };
  const { outputs } = sortedIo(d);
  if (outputs.length === 0) return { ok: false, reason: 'empty' };
  const read = (v: ReturnType<typeof evaluate>) => outputs.map((o) => (o.kind === 'DISPLAY' ? displayValue(o, v) : (v.nodes.get(o.id) ?? 'X')));
  const low = Object.fromEntries(clocks.map((n) => [n.id, 0 as const]));
  let v = evaluate(d, { ...values, ...low }, seed === 0 ? undefined : powerOnState(seed));
  const rows: Array<{ pulse: number; out: OutValue[]; clock?: string }> = [{ pulse: 0, out: read(v) }];
  for (let k = 1; k <= pulses; k++) {
    const name = names[(k - 1) % names.length];
    const id = byName.get(name)!.id;
    const up = evaluate(d, { ...values, ...low, [id]: 1 }, v.seq);
    v = evaluate(d, { ...values, ...low }, up.seq);
    rows.push({ pulse: k, out: read(v), clock: name });
  }
  return { ok: true, clock: names[0], clocks: clocks.map((n) => n.name ?? n.id), outputs: outputs.map((n) => n.name ?? n.id), display: outputs.map((n) => n.kind === 'DISPLAY'), rows };
}

/** 子專案 64：「CLK CLK2」「CLK、CLK2」→ 名稱清單（空白、逗號、頓號隔開）。 */
export const parseClockOrder = (text: string): string[] => text.split(/[\s,，、]+/).filter(Boolean);
