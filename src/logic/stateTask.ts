import { BLOCK_PINS } from './blocks';
import { designFromTask, termsOfTask, type TaskColumn } from './design';
import { parseNames, type TaskValue, type TruthTask } from './task';
import type { BlockChip, LogicDiagram, LogicNode, LogicWire } from './types';

/**
 * 子專案 52（規格 2026-10-25 state-table-task 第 2 節）：狀態表題目。狀態是 S0…S(states − 1)，用二進位編碼（S0 是重設後的狀態）；
 * rows 是「現在狀態 × 輸入組合」（狀態由小到大，同一個狀態裡輸入照二進位從全 0 到全 1），每列寫下一個狀態與每個輸出。
 */
export interface StateTask {
  states: number;
  inputs: string[];
  outputs: string[];
  flipFlop: 'D' | 'JK';
  rows: Array<{ next: number | 'X'; out: TaskValue[] }>;
}

export type StateTaskResult = { ok: true; task: StateTask } | { ok: false; reason: string };

export const MIN_STATES = 2;
export const MAX_STATES = 8;
export const MAX_STATE_INPUTS = 2;
export const MAX_STATE_OUTPUTS = 4;

/** 能編出所有狀態的最少正反器個數。 */
export const flipFlopCount = (states: number) => Math.max(1, Math.ceil(Math.log2(states)));

/** 狀態位元的名稱，最高位元在前（Q1 Q0）。 */
export const stateBitNames = (states: number) => Array.from({ length: flipFlopCount(states) }, (_, i) => `Q${flipFlopCount(states) - 1 - i}`);

/** 狀態的編碼（S2 → "10"）。 */
export const stateCode = (states: number, s: number) => s.toString(2).padStart(flipFlopCount(states), '0');

/** 正反器用的名稱（Q0–Q2、D0–D2、J0–J2、K0–K2）不能當題目的輸入、輸出。 */
const RESERVED = /^[QDJK][0-2]$/;

function problemOf(states: number, inputs: string[], outputs: string[]): string | null {
  if (!Number.isInteger(states) || states < MIN_STATES || states > MAX_STATES) return `狀態要有 ${MIN_STATES}–${MAX_STATES} 個`;
  if (inputs.length > MAX_STATE_INPUTS) return `輸入最多 ${MAX_STATE_INPUTS} 個`;
  if (outputs.length > MAX_STATE_OUTPUTS) return `輸出最多 ${MAX_STATE_OUTPUTS} 個`;
  const all = [...inputs, ...outputs];
  if (all.length > 0) {
    const names = parseNames(all.join(' '));
    if (!names.ok) return names.reason;
  }
  const reserved = all.find((n) => RESERVED.test(n));
  return reserved ? `名稱 ${reserved} 是正反器用的（Q0–Q2、D0–D2、J0–J2、K0–K2），請換一個` : null;
}

/** 建立題目：每一列都回到 S0、輸出都是 0。 */
export function createStateTask(states: number, inputs: string[], outputs: string[], flipFlop: 'D' | 'JK'): StateTaskResult {
  const problem = problemOf(states, inputs, outputs);
  if (problem) return { ok: false, reason: problem };
  return { ok: true, task: { states, inputs: [...inputs], outputs: [...outputs], flipFlop, rows: Array.from({ length: states << inputs.length }, () => ({ next: 0, out: outputs.map((): TaskValue => 0) })) } };
}

/** 讀檔時檢查題目。 */
export function parseStateTask(raw: unknown): StateTaskResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, reason: '狀態表題目格式不對' };
  const r = raw as Record<string, unknown>;
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');
  if (typeof r.states !== 'number' || !strings(r.inputs) || !strings(r.outputs) || (r.flipFlop !== 'D' && r.flipFlop !== 'JK') || !Array.isArray(r.rows)) return { ok: false, reason: '狀態表題目格式不對' };
  const problem = problemOf(r.states, r.inputs, r.outputs);
  if (problem) return { ok: false, reason: `狀態表題目：${problem}` };
  const count = r.states << r.inputs.length;
  if (r.rows.length !== count) return { ok: false, reason: `狀態表題目要有 ${count} 列（有 ${r.rows.length} 列）` };
  const rows: StateTask['rows'] = [];
  for (let i = 0; i < count; i++) {
    const row = r.rows[i] as { next?: unknown; out?: unknown } | null;
    const next = row?.next;
    if (!(next === 'X' || (Number.isInteger(next) && (next as number) >= 0 && (next as number) < r.states))) return { ok: false, reason: `狀態表題目第 ${i} 列的下一個狀態要是 0–${r.states - 1} 或 X` };
    const out = row?.out;
    if (!Array.isArray(out) || out.length !== r.outputs.length || !out.every((v) => v === 0 || v === 1 || v === 'X')) return { ok: false, reason: `狀態表題目第 ${i} 列的輸出只能是 0、1 或 X` };
    rows.push({ next: next as number | 'X', out: [...(out as TaskValue[])] });
  }
  return { ok: true, task: { states: r.states, inputs: [...r.inputs], outputs: [...r.outputs], flipFlop: r.flipFlop, rows } };
}

/** 每個正反器的輸入名稱，最高位元在前：D1 D0，或 J1 K1 J0 K0。 */
function excitationNames(task: StateTask): string[] {
  return stateBitNames(task.states).flatMap((q) => (task.flipFlop === 'D' ? [`D${q.slice(1)}`] : [`J${q.slice(1)}`, `K${q.slice(1)}`]));
}

/**
 * 規格第 3 節：狀態表換成組合邏輯的真值表。輸入是 Q(k−1)…Q0 再接著題目的輸入；輸出是每個正反器的輸入（D，或 JK 的激勵表）再接著題目的輸出。
 * 沒用到的狀態編碼整列不在乎。
 */
export function excitationTask(task: StateTask): TruthTask {
  const k = flipFlopCount(task.states);
  const m = task.inputs.length;
  const width = excitationNames(task).length + task.outputs.length;
  const rows = Array.from({ length: 1 << (k + m) }, (_, r): TaskValue[] => {
    const q = r >> m;
    if (q >= task.states) return Array(width).fill('X');
    const row = task.rows[(q << m) | (r & ((1 << m) - 1))];
    const bits = Array.from({ length: k }, (_, i) => k - 1 - i).flatMap((b): TaskValue[] => {
      const now = (q >> b) & 1;
      const next: TaskValue = row.next === 'X' ? 'X' : (row.next >> b) & 1;
      if (task.flipFlop === 'D') return [next];
      // JK 激勵表：0 → J = 下一位元、K = X；1 → J = X、K = 下一位元的反相。
      return now === 0 ? [next, 'X'] : ['X', next === 'X' ? 'X' : 1 - next];
    });
    return [...bits, ...row.out];
  });
  return { inputs: [...stateBitNames(task.states), ...task.inputs], outputs: [...excitationNames(task), ...task.outputs], rows };
}

/** 化簡後的每一欄（正反器的輸入與題目的輸出）。 */
export const stateTaskColumns = (task: StateTask): TaskColumn[] => termsOfTask(excitationTask(task));

/**
 * 規格第 4 節：照化簡結果產生電路。先用子專案 25 從激勵表的真值表畫出組合邏輯，再把狀態位元的輸入端換成正反器的輸出
 * （Qk' 的 NOT 換成 /Q）、把正反器輸入的輸出端換成接到正反器的腳，加上時脈與狀態位元的輸出端。
 */
export function designFromStateTask(task: StateTask): { diagram: LogicDiagram; columns: TaskColumn[] } {
  const { diagram: comb, columns } = designFromTask(excitationTask(task));
  const chip: BlockChip = task.flipFlop === 'D' ? 'DFF' : 'JKFF';
  const pins = BLOCK_PINS[chip];
  const bits = stateBitNames(task.states);
  const byName = new Map(comb.nodes.filter((n) => n.name !== undefined).map((n) => [n.name!, n]));
  const flipFlopOf = new Map(bits.map((q, i) => [q, `b${i + 1}`]));
  /** 狀態位元輸入端的 id → 正反器的 id。 */
  const stateInput = new Map(bits.map((q) => [byName.get(q)!.id, flipFlopOf.get(q)!]));
  /** 接在狀態位元後面的 NOT → 正反器（改用 /Q）。 */
  const inverter = new Map<string, string>();
  for (const w of comb.wires) {
    const node = comb.nodes.find((n) => n.id === w.to.node)!;
    if (node.kind === 'NOT' && stateInput.has(w.from)) inverter.set(node.id, stateInput.get(w.from)!);
  }
  /** 正反器輸入的輸出端（D1、J0…）的 id → [正反器, 腳]。 */
  const excitation = new Map<string, [string, number]>();
  for (const name of excitationNames(task)) {
    const ff = flipFlopOf.get(`Q${name.slice(1)}`)!;
    excitation.set(byName.get(name)!.id, [ff, pins.inputs.indexOf(name[0])]);
  }
  const removed = new Set([...stateInput.keys(), ...inverter.keys(), ...excitation.keys()]);

  const wires: Array<Omit<LogicWire, 'id'>> = [];
  for (const w of comb.wires) {
    if (inverter.has(w.to.node)) continue;
    const from = stateInput.has(w.from) ? { from: stateInput.get(w.from)! } : inverter.has(w.from) ? { from: inverter.get(w.from)!, fromPin: pins.outputs.indexOf('/Q') } : { from: w.from, ...(w.fromPin ? { fromPin: w.fromPin } : {}) };
    const to = excitation.get(w.to.node);
    wires.push({ ...from, to: to ? { node: to[0], pin: to[1] } : w.to });
  }

  // 版面：組合邏輯不動；正反器放在原本正反器輸入的輸出端那一欄，時脈在輸入端下面，輸出端（狀態位元在前）放在正反器右邊。
  const kept = comb.nodes.filter((n) => !removed.has(n.id));
  const sinks = kept.filter((n) => n.kind === 'OUTPUT');
  const logic = kept.filter((n) => n.kind !== 'OUTPUT');
  const lastColumn = Math.max(...comb.nodes.filter((n) => excitation.has(n.id) || n.kind === 'OUTPUT').map((n) => n.x));
  const ffX = Math.max(lastColumn, ...logic.filter((n) => n.kind !== 'INPUT').map((n) => n.x + 4), 4);
  const flipFlops: LogicNode[] = bits.map((q, i) => ({ id: flipFlopOf.get(q)!, kind: 'BLOCK', chip, x: ffX, y: i * (pins.inputs.length + 3) }));
  const outX = ffX + 10;
  const lastOutput = Math.max(0, ...sinks.map((n) => Number(n.id.slice(1)) || 0));
  const stateOutputs: LogicNode[] = bits.map((q, i) => ({ id: `o${lastOutput + i + 1}`, kind: 'OUTPUT', name: q, x: outX, y: flipFlops[i].y }));
  const userOutputs = sinks.map((n, i) => ({ ...n, x: outX, y: flipFlops.length * (pins.inputs.length + 3) + i * 2 }));
  const bottom = Math.max(0, ...logic.filter((n) => n.kind === 'INPUT').map((n) => n.y + 2));
  const clock: LogicNode = { id: 'c1', kind: 'CLOCK', name: 'CLK', x: 0, y: bottom + 1 };
  for (const ff of flipFlops) wires.push({ from: clock.id, to: { node: ff.id, pin: pins.inputs.indexOf('CLK') } });
  stateOutputs.forEach((o, i) => wires.push({ from: flipFlops[i].id, to: { node: o.id, pin: 0 } }));

  const diagram: LogicDiagram = {
    version: 1,
    nodes: [clock, ...logic, ...flipFlops, ...stateOutputs, ...userOutputs],
    wires: wires.map((w, i) => ({ id: `w${i + 1}`, ...w })),
    stateTask: task,
  };
  return { diagram, columns };
}

/** 邏輯圖換上狀態表題目；undefined 是拿掉。 */
export function withStateTask(d: LogicDiagram, task: StateTask | undefined): LogicDiagram {
  const { stateTask: _old, ...rest } = d;
  return task ? { ...rest, stateTask: task } : rest;
}
