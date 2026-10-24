import { displayValue, evaluate, sortedIo, topoOrder, truthTable, isSequential } from './evaluate';
import { isSink, type LogicDiagram } from './types';

/** 規格（2026-10-17 truth-table-task）第 2 節：真值表題目的一格：輸出端是 0 / 1，顯示器（子專案 32）是 0–15；X 是不在乎。 */
export type TaskValue = number | 'X';

export interface TruthTask {
  /** 輸入名稱，第一個是最高位元。 */
  inputs: string[];
  /** 輸出名稱。 */
  outputs: string[];
  /** 子專案 32：哪些輸出是 7 段顯示器（BCD，格子是 0–15）；沒有時不寫。 */
  displays?: string[];
  /** rows[r][k]：第 r 列（輸入照二進位從全 0 數到全 1）第 k 個輸出的值；X 是不在乎。 */
  rows: TaskValue[][];
}

export type TaskResult = { ok: true; task: TruthTask } | { ok: false; reason: string };

export const MAX_TASK_INPUTS = 6;
export const MAX_TASK_OUTPUTS = 8;
const NAME_RULE = /^[A-Za-z][A-Za-z0-9_]{0,7}$/;

/** 用空白或逗號分開的名稱。 */
export function parseNames(text: string): { ok: true; names: string[] } | { ok: false; reason: string } {
  const names = text.split(/[\s,，、]+/).filter(Boolean);
  if (names.length === 0) return { ok: false, reason: '至少要有一個名稱' };
  const seen = new Set<string>();
  for (const name of names) {
    if (!NAME_RULE.test(name)) return { ok: false, reason: `名稱 ${name} 不合法（英文字母開頭，只能有英數與底線，最多 8 個字）` };
    if (seen.has(name)) return { ok: false, reason: `名稱 ${name} 重複` };
    seen.add(name);
  }
  return { ok: true, names };
}

/** 名稱與數量的檢查；沒問題時回傳 null。 */
function namesProblem(inputs: string[], outputs: string[]): string | null {
  if (inputs.length === 0) return '至少要有一個輸入';
  if (outputs.length === 0) return '至少要有一個輸出';
  if (inputs.length > MAX_TASK_INPUTS) return `輸入最多 ${MAX_TASK_INPUTS} 個（${1 << MAX_TASK_INPUTS} 列）`;
  if (outputs.length > MAX_TASK_OUTPUTS) return `輸出最多 ${MAX_TASK_OUTPUTS} 個`;
  const all = [...inputs, ...outputs];
  for (const name of all) if (!NAME_RULE.test(name)) return `名稱 ${name} 不合法（英文字母開頭，只能有英數與底線，最多 8 個字）`;
  for (const name of inputs) if (outputs.includes(name)) return `名稱 ${name} 同時是輸入和輸出`;
  const twice = all.find((name, i) => all.indexOf(name) !== i);
  return twice ? `名稱 ${twice} 重複` : null;
}

/** 建立題目，輸出全部是 0。 */
export function createTask(inputs: string[], outputs: string[]): TaskResult {
  const problem = namesProblem(inputs, outputs);
  if (problem) return { ok: false, reason: problem };
  return { ok: true, task: { inputs: [...inputs], outputs: [...outputs], rows: Array.from({ length: 1 << inputs.length }, () => outputs.map((): TaskValue => 0)) } };
}

const NEXT: Record<string, TaskValue> = { '0': 1, '1': 'X', X: 0 };

/** 子專案 32：第 k 個輸出是不是 7 段顯示器。 */
export const isDisplayOutput = (task: TruthTask, k: number) => task.displays?.includes(task.outputs[k]) ?? false;

/** 點一格：0 → 1 → X → 0；顯示器是 0 → 1 → … → 15 → X → 0。 */
export function cycleCell(task: TruthTask, row: number, k: number): TruthTask {
  const display = isDisplayOutput(task, k);
  const next = (v: TaskValue): TaskValue => (!display ? NEXT[String(v)] : v === 'X' ? 0 : v >= 15 ? 'X' : v + 1);
  return { ...task, rows: task.rows.map((r, i) => (i === row ? r.map((v, j) => (j === k ? next(v) : v)) : r)) };
}

/** 子專案 32：「0 1 2 … X」→ 每一列的數字（0–15，X 或 - 是不在乎）；要剛好 rowCount 個。 */
export function parseDisplayValues(text: string, rowCount: number): { ok: true; values: TaskValue[] } | { ok: false; reason: string } {
  const parts = text.split(/[\s,，、]+/).filter(Boolean);
  if (parts.length !== rowCount) return { ok: false, reason: `要寫 ${rowCount} 個數字（有 ${parts.length} 個）` };
  const values: TaskValue[] = [];
  for (const part of parts) {
    if (/^[xX-]$/.test(part)) values.push('X');
    else if (/^\d+$/.test(part) && Number(part) <= 15) values.push(Number(part));
    else return { ok: false, reason: `${part} 不是 0–15 的數字或 X` };
  }
  return { ok: true, values };
}

/** 子專案 32：顯示器那一欄改成這些值（每列一個）。 */
export function setDisplayColumn(task: TruthTask, k: number, values: TaskValue[]): TaskResult {
  if (!isDisplayOutput(task, k)) return { ok: false, reason: '這個輸出不是顯示器' };
  if (values.length !== task.rows.length) return { ok: false, reason: `要寫 ${task.rows.length} 個數字（有 ${values.length} 個）` };
  return { ok: true, task: { ...task, rows: task.rows.map((r, i) => r.map((v, j) => (j === k ? values[i] : v))) } };
}

/** 子專案 32：第 k 個輸出換成顯示器或輸出端；換回輸出端時超過 1 的值變成 0。 */
export function setOutputKind(task: TruthTask, k: number, display: boolean): TaskResult {
  const name = task.outputs[k];
  if (name === undefined) return { ok: false, reason: '找不到這個輸出' };
  if (isDisplayOutput(task, k) === display) return { ok: true, task };
  const names = task.outputs.filter((n, j) => (j === k ? display : isDisplayOutput(task, j)));
  const { displays: _old, ...rest } = task;
  const rows = display ? task.rows : task.rows.map((r) => r.map((v, j) => (j === k && v !== 'X' && v > 1 ? 0 : v)));
  return { ok: true, task: names.length > 0 ? { ...rest, displays: names, rows } : { ...rest, rows } };
}

/** 第 row 列的輸入值（第一個輸入是最高位元）。 */
export function rowBits(task: TruthTask, row: number): Array<0 | 1> {
  const n = task.inputs.length;
  return task.inputs.map((_, i) => ((row >> (n - 1 - i)) & 1) as 0 | 1);
}

/** 第 k 個輸出是 value 的列號。 */
export function rowsWith(task: TruthTask, k: number, value: TaskValue): number[] {
  return task.rows.flatMap((r, i) => (r[k] === value ? [i] : []));
}

/** 「1, 2, 4, 7」→ 列號（0 到 rowCount − 1）。空白是沒有任何列。 */
export function parseRowList(text: string, rowCount: number): { ok: true; rows: number[] } | { ok: false; reason: string } {
  const rows: number[] = [];
  for (const part of text.split(/[\s,，、]+/).filter(Boolean)) {
    if (!/^\d+$/.test(part)) return { ok: false, reason: `${part} 不是列號` };
    const n = Number(part);
    if (n >= rowCount) return { ok: false, reason: `列號 ${n} 超出範圍（0–${rowCount - 1}）` };
    if (rows.includes(n)) return { ok: false, reason: `列號 ${n} 重複` };
    rows.push(n);
  }
  return { ok: true, rows };
}

/** 第 k 個輸出改成：ones 的列是 1、dontCares 的列是 X、其他列是 0。 */
export function setColumn(task: TruthTask, k: number, ones: number[], dontCares: number[]): TaskResult {
  const both = ones.find((r) => dontCares.includes(r));
  if (both !== undefined) return { ok: false, reason: `第 ${both} 列不能同時是 1 和不在乎` };
  return { ok: true, task: { ...task, rows: task.rows.map((r, i) => r.map((v, j) => (j !== k ? v : ones.includes(i) ? 1 : dontCares.includes(i) ? 'X' : 0))) } };
}

/**
 * 改名稱：輸入個數不變時保留每列的值，個數改變時每列重新開始（全 0）；輸出依名稱保留，新的輸出全 0。
 */
export function renameTask(task: TruthTask, inputs: string[], outputs: string[]): TaskResult {
  const made = createTask(inputs, outputs);
  if (!made.ok) return made;
  // 子專案 32：同名的輸出保留它是不是顯示器。
  const displays = (task.displays ?? []).filter((n) => outputs.includes(n));
  const kinds = displays.length > 0 ? { displays } : {};
  if (inputs.length !== task.inputs.length) return { ok: true, task: { ...made.task, ...kinds } };
  const from = outputs.map((name) => task.outputs.indexOf(name));
  return { ok: true, task: { ...made.task, ...kinds, rows: task.rows.map((r) => from.map((j): TaskValue => (j < 0 ? 0 : r[j]))) } };
}

/** 讀檔時檢查題目（規格第 2 節）。 */
export function parseTask(raw: unknown): TaskResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, reason: '題目格式不對' };
  const r = raw as Record<string, unknown>;
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');
  if (!strings(r.inputs) || !strings(r.outputs) || !Array.isArray(r.rows)) return { ok: false, reason: '題目格式不對' };
  const problem = namesProblem(r.inputs, r.outputs);
  if (problem) return { ok: false, reason: `題目：${problem}` };
  const count = 1 << r.inputs.length;
  if (r.rows.length !== count) return { ok: false, reason: `題目的列數要是 ${count} 列（有 ${r.rows.length} 列）` };
  const width = r.outputs.length;
  const rows = r.rows as unknown[];
  // 子專案 32：顯示器的欄是 0–15。
  if (r.displays !== undefined && (!strings(r.displays) || !r.displays.every((n) => (r.outputs as string[]).includes(n)))) return { ok: false, reason: '題目的顯示器要是輸出的名稱' };
  const displays = (r.displays as string[] | undefined) ?? [];
  const isDisplay = (k: number) => displays.includes((r.outputs as string[])[k]);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length !== width) return { ok: false, reason: `題目第 ${i} 列的值只能是 0、1 或 X` };
    for (let k = 0; k < width; k++) {
      const v = row[k];
      if (isDisplay(k) ? !(v === 'X' || (Number.isInteger(v) && v >= 0 && v <= 15)) : !(v === 0 || v === 1 || v === 'X'))
        return { ok: false, reason: isDisplay(k) ? `題目第 ${i} 列的顯示器要是 0–15 或 X` : `題目第 ${i} 列的值只能是 0、1 或 X` };
    }
  }
  return { ok: true, task: { inputs: [...r.inputs], outputs: [...r.outputs], ...(displays.length > 0 ? { displays: [...displays] } : {}), rows: rows.map((row) => [...(row as TaskValue[])]) } };
}

/** 規格第 3 節：邏輯圖和題目比對的結果。 */
export type TaskComparison =
  | { kind: 'none' }
  | { kind: 'issues'; issues: string[] }
  | { kind: 'done'; rows: number; dontCares: boolean; mismatches: Array<{ row: number; inputs: string; expected: string[]; actual: string[] }> };

/**
 * 依名稱把邏輯圖對到題目，逐列計算邏輯圖的輸出、和題目比對（X 的格子不比）。
 * 題目的輸入要有同名的輸入端、輸出要有同名的輸出端；邏輯圖多出來的輸入端也算對不上（它的值會影響結果）。
 */
export function compareDiagramToTask(d: LogicDiagram, task: TruthTask): TaskComparison {
  if (d.nodes.length === 0) return { kind: 'none' };
  const loop = topoOrder(d).loop;
  if (loop) return { kind: 'issues', issues: [`邏輯圖有迴圈（${loop.join('、')}），不能和題目比對`] };
  // 子專案 46：時序電路的輸出和以前的輸入有關，不能和真值表題目比對。
  if (isSequential(d)) return { kind: 'issues', issues: ['邏輯圖有正反器、計數器或時脈（時序電路），不能和真值表題目比對；請看「時序表」'] };
  const inputs = new Map(d.nodes.filter((n) => n.kind === 'INPUT').map((n) => [n.name ?? n.id, n]));
  const sinks = new Map(d.nodes.filter((n) => isSink(n.kind)).map((n) => [n.name ?? n.id, n]));
  const issues: string[] = [];
  for (const name of task.inputs) if (!inputs.has(name)) issues.push(`題目的輸入 ${name} 在邏輯圖找不到輸入端`);
  for (const name of inputs.keys()) if (!task.inputs.includes(name)) issues.push(`邏輯圖的輸入端 ${name} 不在題目裡`);
  task.outputs.forEach((name, k) => {
    const sink = sinks.get(name);
    if (isDisplayOutput(task, k)) {
      // 子專案 32：題目的顯示器要對到 BCD 的 7 段顯示器。
      if (!sink) issues.push(`題目的顯示器 ${name} 在邏輯圖找不到 7 段顯示器`);
      else if (sink.kind !== 'DISPLAY') issues.push(`${name} 在邏輯圖是輸出端，題目的這個輸出是 7 段顯示器`);
      else if (sink.segments) issues.push(`${name} 在邏輯圖是每段直接控制的顯示器，題目的顯示器要用 BCD（A–D）`);
      return;
    }
    if (!sink) issues.push(`題目的輸出 ${name} 在邏輯圖找不到輸出端`);
    else if (sink.kind === 'DISPLAY') issues.push(`${name} 在邏輯圖是 7 段顯示器，題目的輸出要接輸出端`);
  });
  if (issues.length > 0) return { kind: 'issues', issues };

  const mismatches: Extract<TaskComparison, { kind: 'done' }>['mismatches'] = [];
  task.rows.forEach((want, row) => {
    const bits = rowBits(task, row);
    const v = evaluate(d, Object.fromEntries(task.inputs.map((name, i) => [inputs.get(name)!.id, bits[i]])));
    const actual = task.outputs.map((name, k) => {
      const b = isDisplayOutput(task, k) ? displayValue(sinks.get(name)!, v) : (v.nodes.get(sinks.get(name)!.id) ?? 'X');
      return b === 'X' ? '?' : String(b);
    });
    const expected = want.map(String);
    if (expected.some((e, k) => e !== 'X' && e !== actual[k])) mismatches.push({ row, inputs: bits.join(''), expected, actual });
  });
  return { kind: 'done', rows: task.rows.length, dontCares: task.rows.some((r) => r.includes('X')), mismatches };
}

/** 規格第 1 節：用目前邏輯圖的真值表建立題目（老師畫好答案就能產生題目）。 */
export function taskFromDiagram(d: LogicDiagram): TaskResult {
  const table = truthTable(d);
  if (!table.ok) return { ok: false, reason: table.reason === 'sequential' ? '時序電路（有正反器、計數器或時脈）沒有真值表，不能建立題目' : table.reason === 'loop' ? `邏輯圖有迴圈（${(table.loop ?? []).join('、')}），不能算真值表` : table.reason === 'too-many' ? `輸入最多 ${MAX_TASK_INPUTS} 個（${1 << MAX_TASK_INPUTS} 列）` : '先在邏輯圖放輸入端和輸出端' };
  const sinks = sortedIo(d).outputs;
  // 子專案 32：BCD 顯示器可以當題目的輸出（格子是 0–15）；每段直接控制、用到小數點的不行。
  const segments = sinks.find((o) => o.kind === 'DISPLAY' && o.segments);
  if (segments) return { ok: false, reason: `題目的顯示器要用 BCD（${segments.name ?? segments.id} 是每段直接控制）` };
  const made = createTask(table.inputs, table.outputs);
  if (!made.ok) return made;
  if (table.rows.some((r) => r.out.includes('X'))) return { ok: false, reason: '邏輯圖還有沒接好的地方（有些輸出不確定），先把邏輯圖接好' };
  if (table.rows.some((r) => r.out.some((b) => typeof b === 'string'))) return { ok: false, reason: '題目的顯示器不能用小數點（DP 有接線）' };
  const displays = sinks.filter((o) => o.kind === 'DISPLAY').map((o) => o.name ?? o.id);
  return { ok: true, task: { ...made.task, ...(displays.length > 0 ? { displays } : {}), rows: table.rows.map((r) => r.out.map((b): TaskValue => (typeof b === 'number' ? b : 0))) } };
}

/** 邏輯圖換上題目；undefined 是拿掉題目（不留下空的欄位）。 */
export function withTask(d: LogicDiagram, task: TruthTask | undefined): LogicDiagram {
  const { task: _old, ...rest } = d;
  return task ? { ...rest, task } : rest;
}
