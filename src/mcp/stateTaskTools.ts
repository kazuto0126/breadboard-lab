import { sequenceTable } from '../logic/evaluate';
import { sopText } from '../logic/minimize';
import { createStateTask, designFromStateTask, excitationTask, flipFlopCount, stateBitNames, stateCode, stateTaskColumns, withStateTask, type StateTask } from '../logic/stateTask';
import { withTask, type TaskValue } from '../logic/task';
import { fail, type LabFile, type ToolResult } from './tools';

/**
 * 子專案 52（規格 2026-10-25 state-table-task 第 6 節）：狀態表題目的 MCP 工具。
 * 資料與化簡都用網頁的函式（src/logic/stateTask.ts），這裡只負責參數與回覆的文字。
 */
export interface StateTaskArgs {
  states?: number;
  inputs?: string[];
  outputs?: string[];
  flip_flop?: 'D' | 'JK';
  rows?: Array<{ next: number | 'X'; out?: TaskValue[] }>;
  clear?: boolean;
}

const NO_TASK = '檔案裡還沒有狀態表題目；用 state_task_set 寫入';
const PULSES = 8;

/** 狀態表與化簡後的式子。 */
function taskText(task: StateTask): string[] {
  const m = task.inputs.length;
  const head = ['現在', ...task.inputs].join(' ');
  const lines = [
    `狀態表題目：${task.states} 個狀態（${flipFlopCount(task.states)} 顆${task.flipFlop === 'D' ? ' D 型' : ' JK '}正反器，S0 = ${stateCode(task.states, 0)} 是重設後的狀態）` +
      `${m > 0 ? `；輸入 ${task.inputs.join(' ')}` : ''}${task.outputs.length > 0 ? `；輸出 ${task.outputs.join(' ')}` : ''}`,
    `${head} | 下一個${task.outputs.length > 0 ? ` ${task.outputs.join(' ')}` : ''}`,
    ...task.rows.map((row, i) => {
      const s = i >> m;
      const ins = task.inputs.map((_, b) => (i >> (m - 1 - b)) & 1);
      return `${[`S${s}(${stateCode(task.states, s)})`, ...ins].join(' ')} | ${row.next === 'X' ? 'X' : `S${row.next}`}${row.out.length > 0 ? ` ${row.out.join(' ')}` : ''}`;
    }),
    '',
    `化簡後的式子（積項和；變數 ${excitationTask(task).inputs.join(' ')}，Q0 是最低位元；沒用到的狀態編碼當成不在乎）：`,
    ...equations(task),
  ];
  return lines;
}

function equations(task: StateTask): string[] {
  const names = excitationTask(task).inputs;
  return stateTaskColumns(task).map((c) => `- ${c.label} = ${sopText(c.terms, names)}`);
}

export function stateTaskSet(f: LabFile, args: StateTaskArgs): ToolResult {
  if (args.clear) {
    if (!f.logic.stateTask) return { text: '檔案裡沒有狀態表題目' };
    return { text: '刪除了狀態表題目（邏輯圖不變）。', file: { ...f, logic: withStateTask(f.logic, undefined) } };
  }
  if (args.states === undefined || args.rows === undefined) return fail('要給 states（狀態數）與 rows（每一列的下一個狀態與輸出），或 clear: true 刪除題目');
  const made = createStateTask(args.states, args.inputs ?? [], args.outputs ?? [], args.flip_flop ?? 'D');
  if (!made.ok) return fail(made.reason);
  const task = made.task;
  if (args.rows.length !== task.rows.length) return fail(`rows 要有 ${task.rows.length} 列（${task.states} 個狀態 × ${1 << task.inputs.length} 種輸入），有 ${args.rows.length} 列`);
  for (let i = 0; i < args.rows.length; i++) {
    const { next, out = [] } = args.rows[i];
    if (!(next === 'X' || (Number.isInteger(next) && next >= 0 && next < task.states))) return fail(`第 ${i} 列的 next 要是 0–${task.states - 1} 或 "X"`);
    if (out.length !== task.outputs.length || !out.every((v) => v === 0 || v === 1 || v === 'X')) return fail(`第 ${i} 列的 out 要有 ${task.outputs.length} 個值（0、1 或 "X"）`);
    task.rows[i] = { next, out: [...out] };
  }
  const replaced = f.logic.stateTask ? '（取代了原本的狀態表題目）' : '';
  return { text: [`寫入狀態表題目${replaced}。`, ...taskText(task)].join('\n'), file: { ...f, logic: withStateTask(f.logic, task) } };
}

export function stateTaskToDiagram(f: LabFile): ToolResult {
  const task = f.logic.stateTask;
  if (!task) return fail(NO_TASK);
  const diagram = withTask(designFromStateTask(task).diagram, f.logic.task);
  const next = { ...f, logic: diagram };
  const lines = [
    `照狀態表產生電路：${flipFlopCount(task.states)} 顆${task.flipFlop === 'D' ? ' D 型' : ' JK '}正反器（DFF / JKFF，轉成麵包板時兩顆合用一片 74LS74 / 76）、時脈 CLK、線 ${diagram.wires.length} 條；狀態位元也接到輸出端 ${stateBitNames(task.states).join(' ')}。`,
    ...(f.logic.nodes.length > 0 ? [`取代了原本的邏輯圖（${f.logic.nodes.length} 個元件）。`] : []),
    '化簡後的式子：',
    ...equations(task),
  ];
  const t = sequenceTable(diagram, PULSES);
  if (t.ok) {
    const bits = stateBitNames(task.states);
    const at = (name: string) => t.outputs.indexOf(name);
    lines.push('', `從 S0 開始${task.inputs.length > 0 ? `（輸入 ${task.inputs.map((n) => `${n} = 0`).join('、')}）` : ''}每次脈衝後的狀態：`);
    for (const r of t.rows) {
      const values = bits.map((q) => r.out[at(q)]);
      const code = values.every((v) => v === 0 || v === 1) ? parseInt(values.join(''), 2) : null;
      const outs = task.outputs.map((o) => `${o} = ${r.out[at(o)]}`);
      lines.push(`${r.pulse} | ${code === null ? '?' : `S${code}`} (${bits.join(' ')} = ${values.join(' ')})${outs.length > 0 ? `，${outs.join('、')}` : ''}`);
    }
  }
  lines.push('', '之後可以用 logic_truth_table 看時序表與波形（改輸入端的值再看），或用 logic_to_breadboard 轉成麵包板。');
  return { text: lines.join('\n'), file: next };
}
