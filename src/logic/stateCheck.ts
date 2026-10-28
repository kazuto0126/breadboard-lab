import { evaluate, topoOrder, type Bit, type SeqState } from './evaluate';
import { stateBitNames, type StateTask } from './stateTask';
import type { LogicDiagram } from './types';

/** 子專案 53（規格 2026-10-28 state-task-check）：邏輯圖和狀態表比對的結果。 */
export type StateComparison =
  | { kind: 'none' }
  | { kind: 'issues'; issues: string[] }
  | {
      kind: 'done';
      /** 比對了幾列（走到的狀態 × 輸入組合）。 */
      rows: number;
      mismatches: StateMismatch[];
      /** 題目裡沒有走到的狀態（沒有比對）。 */
      unreached: number[];
      /** 重設後不是 S0 時，邏輯圖的狀態（例如「S2」或「?」）。 */
      resetAt?: string;
      /** 走到沒用到的編碼（例如「11」），沒有往下走。 */
      unusedCodes: string[];
    };

export interface StateMismatch {
  row: number;
  state: number;
  /** 輸入的值（例如「01」）；沒有輸入時是空字串。 */
  inputs: string;
  expectedNext: string;
  actualNext: string;
  expected: string[];
  actual: string[];
}

const text = (b: Bit | undefined) => (b === 0 || b === 1 ? String(b) : '?');

/**
 * 規格第 2、3 節：依名稱對應輸入、輸出與狀態位元（輸出端 Q0、Q1…），從重設開始走：
 * 每個走到的狀態、每種輸入組合先讀輸出（脈衝前），再送一個脈衝讀下一個狀態，和題目那一列比（X 的格子不比）。
 */
export function compareDiagramToStateTask(d: LogicDiagram, task: StateTask): StateComparison {
  if (d.nodes.length === 0) return { kind: 'none' };
  const loop = topoOrder(d).loop;
  if (loop) return { kind: 'issues', issues: [`邏輯圖有迴圈（${loop.join('、')}），不能和狀態表比對`] };
  const bits = stateBitNames(task.states);
  const inputs = new Map(d.nodes.filter((n) => n.kind === 'INPUT').map((n) => [n.name ?? n.id, n.id]));
  const outputs = new Map(d.nodes.filter((n) => n.kind === 'OUTPUT').map((n) => [n.name ?? n.id, n.id]));
  const clock = d.nodes.find((n) => n.kind === 'CLOCK');
  const issues: string[] = [];
  if (!clock) issues.push('邏輯圖沒有時脈：放一個時脈，接到每個正反器的 CLK');
  const missingBits = bits.filter((q) => !outputs.has(q));
  if (missingBits.length > 0) issues.push(`要有輸出端 ${missingBits.join('、')}（接到正反器的 Q，Q0 是最低位元），才知道電路在哪個狀態`);
  for (const name of task.inputs) if (!inputs.has(name)) issues.push(`題目的輸入 ${name} 在邏輯圖找不到輸入端`);
  for (const name of inputs.keys()) if (!task.inputs.includes(name)) issues.push(`邏輯圖的輸入端 ${name} 不在題目裡`);
  for (const name of task.outputs) if (!outputs.has(name)) issues.push(`題目的輸出 ${name} 在邏輯圖找不到輸出端`);
  if (issues.length > 0) return { kind: 'issues', issues };

  const m = task.inputs.length;
  const clk = clock!.id;
  const valuesOf = (c: number) => Object.fromEntries(task.inputs.map((name, b) => [inputs.get(name)!, ((c >> (m - 1 - b)) & 1) as 0 | 1]));
  /** 讀狀態位元：編碼（數字），有不確定的位元時是 null。 */
  const codeOf = (v: ReturnType<typeof evaluate>): number | null => {
    const qs = bits.map((q) => v.nodes.get(outputs.get(q)!));
    return qs.every((b) => b === 0 || b === 1) ? parseInt(qs.join(''), 2) : null;
  };
  const name = (code: number | null) => (code === null ? '?' : code < task.states ? `S${code}` : code.toString(2).padStart(bits.length, '0'));

  // 重設：正反器從上電狀態開始，時脈 0、輸入 0。
  const reset = evaluate(d, { ...valuesOf(0), [clk]: 0 });
  const start = codeOf(reset);
  const mismatches: StateMismatch[] = [];
  const unusedCodes: string[] = [];
  let rows = 0;
  const seen = new Set<number>();
  const queue: Array<{ code: number; seq: SeqState }> = [];
  if (start !== null) {
    seen.add(start);
    queue.push({ code: start, seq: reset.seq });
  }
  while (queue.length > 0) {
    const { code, seq } = queue.shift()!;
    if (code >= task.states) {
      unusedCodes.push(name(code));
      continue;
    }
    for (let c = 0; c < 1 << m; c++) {
      const values = valuesOf(c);
      const before = evaluate(d, { ...values, [clk]: 0 }, seq);
      const up = evaluate(d, { ...values, [clk]: 1 }, before.seq);
      const down = evaluate(d, { ...values, [clk]: 0 }, up.seq);
      const next = codeOf(down);
      const row = (code << m) | c;
      const want = task.rows[row];
      const actual = task.outputs.map((o) => text(before.nodes.get(outputs.get(o)!)));
      const expected = want.out.map(String);
      rows++;
      const nextWrong = want.next !== 'X' && want.next !== next;
      if (nextWrong || expected.some((e, k) => e !== 'X' && e !== actual[k]))
        mismatches.push({ row, state: code, inputs: m === 0 ? '' : c.toString(2).padStart(m, '0'), expectedNext: want.next === 'X' ? 'X' : `S${want.next}`, actualNext: name(next), expected, actual });
      if (next !== null && !seen.has(next)) {
        seen.add(next);
        queue.push({ code: next, seq: down.seq });
      }
    }
  }
  const unreached = Array.from({ length: task.states }, (_, s) => s).filter((s) => !seen.has(s));
  return { kind: 'done', rows, mismatches, unreached, unusedCodes, ...(start === 0 ? {} : { resetAt: name(start) }) };
}

/** 一列不一致的白話：「S1、X = 1：題目 → S2、Z = 0；邏輯圖 → S0、Z = 1」（不在乎的輸出寫「任意」）。 */
export function mismatchText(m: StateMismatch, task: StateTask): string {
  const where = [`S${m.state}`, ...task.inputs.map((n, b) => `${n} = ${m.inputs[b]}`)].join('、');
  const side = (next: string, outs: string[]) => [next === 'X' ? '任意' : next, ...task.outputs.map((o, k) => `${o} = ${outs[k] === 'X' ? '任意' : outs[k]}`)].join('、');
  return `${where}：題目 → ${side(m.expectedNext, m.expected)}；邏輯圖 → ${side(m.actualNext, m.actual)}`;
}

/** 比對結果的總結與補充說明（網頁與 MCP 共用）。 */
export function comparisonNotes(r: Extract<StateComparison, { kind: 'done' }>, task: StateTask): { summary: string; notes: string[] } {
  const summary = r.mismatches.length === 0 ? `從 S0 開始比對了 ${r.rows} 列，邏輯圖和狀態表全部一致${task.rows.some((row) => row.next === 'X' || row.out.includes('X')) ? '（不在乎的格子不比）' : ''}` : `比對了 ${r.rows} 列，有 ${r.mismatches.length} 列不一致`;
  const notes = [
    ...(r.resetAt ? [`重設後邏輯圖在 ${r.resetAt}（應該是 S0，正反器都是 0）`] : []),
    ...(r.unreached.length > 0 ? [`${r.unreached.map((s) => `S${s}`).join('、')} 從 S0 走不到，沒有比對`] : []),
    ...(r.unusedCodes.length > 0 ? [`走到沒用到的編碼 ${r.unusedCodes.join('、')}，沒有往下比`] : []),
  ];
  return { summary, notes };
}
