import { useMemo, useState } from 'react';
import { sopText } from '../../logic/minimize';
import {
  createStateTask,
  designFromStateTask,
  excitationTask,
  flipFlopCount,
  MAX_STATE_INPUTS,
  MAX_STATE_OUTPUTS,
  MAX_STATES,
  MIN_STATES,
  stateCode,
  stateTaskColumns,
  withStateTask,
  type StateTask,
} from '../../logic/stateTask';
import { withTask, type TaskValue } from '../../logic/task';
import type { LogicDiagram } from '../../logic/types';
import { useLogic } from '../../state/logic';

/** 子專案 52（規格 2026-10-25 state-table-task 第 5 節）：「題目」分頁的狀態表題目。 */
const btn = 'rounded px-2 py-1 text-xs disabled:opacity-50';
const field = 'w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none';
const tone = (v: TaskValue) => (v === 'X' ? 'text-slate-400' : v === 1 ? 'text-red-400' : 'text-sky-400');
const NEXT: Record<string, TaskValue> = { '0': 1, '1': 'X', X: 0 };
const flipFlopText = (t: Pick<StateTask, 'flipFlop'>) => (t.flipFlop === 'D' ? 'D 型' : 'JK');

function save(diagram: LogicDiagram, task: StateTask | undefined, label: string) {
  useLogic.getState().apply({ ok: true, diagram: withStateTask(diagram, task) }, label);
}

const names = (text: string) => text.split(/[\s,，、]+/).filter(Boolean);

function CreateForm({ diagram }: { diagram: LogicDiagram }) {
  const [states, setStates] = useState(4);
  const [inputs, setInputs] = useState('');
  const [outputs, setOutputs] = useState('');
  const [flipFlop, setFlipFlop] = useState<'D' | 'JK'>('D');
  const [error, setError] = useState<string | null>(null);
  const run = () => {
    const r = createStateTask(states, names(inputs), names(outputs), flipFlop);
    setError(r.ok ? null : r.reason);
    if (r.ok) save(diagram, r.task, '建立狀態表題目');
  };
  return (
    <div data-testid="state-task-tab" className="space-y-2 p-3 text-sm">
      <p className="text-slate-300">輸入老師給的狀態表（現在狀態、輸入 → 下一個狀態、輸出），按一下就產生用正反器做的時序電路，並列出化簡後的式子。</p>
      <label className="block">
        <span className="text-xs text-slate-400">狀態數（S0 是重設後的狀態，用二進位編碼）</span>
        <select aria-label="狀態數" value={states} onChange={(e) => setStates(Number(e.target.value))} className={field}>
          {Array.from({ length: MAX_STATES - MIN_STATES + 1 }, (_, i) => i + MIN_STATES).map((n) => (
            <option key={n} value={n}>
              {n} 個（{flipFlopCount(n)} 顆正反器）
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-slate-400">輸入名稱（可以不寫，最多 {MAX_STATE_INPUTS} 個）</span>
        <input aria-label="狀態表的輸入名稱" value={inputs} placeholder="X" onChange={(e) => setInputs(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} className={field} />
      </label>
      <label className="block">
        <span className="text-xs text-slate-400">輸出名稱（可以不寫，最多 {MAX_STATE_OUTPUTS} 個）</span>
        <input aria-label="狀態表的輸出名稱" value={outputs} placeholder="Z" onChange={(e) => setOutputs(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} className={field} />
      </label>
      <div className="flex items-center gap-3 text-xs text-slate-300">
        <span>正反器</span>
        {(['D', 'JK'] as const).map((f) => (
          <label key={f} className="flex items-center gap-1">
            <input type="radio" name="state-flip-flop" checked={flipFlop === f} onChange={() => setFlipFlop(f)} />
            {f === 'D' ? 'D 型' : 'JK'}
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
      <button type="button" className={`${btn} bg-sky-700 text-white hover:bg-sky-600`} onClick={run}>
        建立狀態表題目
      </button>
    </div>
  );
}

export function StateTaskTab({ diagram }: { diagram: LogicDiagram }) {
  const task = diagram.stateTask;
  const columns = useMemo(() => (task ? stateTaskColumns(task) : []), [task]);
  if (!task) return <CreateForm diagram={diagram} />;
  const m = task.inputs.length;
  const varNames = excitationTask(task).inputs;
  const setRow = (i: number, row: StateTask['rows'][number], label: string) => save(diagram, { ...task, rows: task.rows.map((r, j) => (j === i ? row : r)) }, label);
  const generate = () => {
    const s = useLogic.getState();
    // 真值表題目跟著保留。
    s.apply({ ok: true, diagram: withTask(designFromStateTask(task).diagram, diagram.task) }, '從狀態表產生電路', null);
    s.fit();
  };
  return (
    <div data-testid="state-task-tab" className="space-y-3 p-3 text-sm">
      <p className="text-xs text-slate-300">
        {task.states} 個狀態（{flipFlopCount(task.states)} 顆{flipFlopText(task)}正反器，S0 是重設後的狀態）{m > 0 && `、輸入 ${task.inputs.join(' ')}`}
        {task.outputs.length > 0 && `、輸出 ${task.outputs.join(' ')}`}
      </p>
      <table data-testid="state-table" className="w-full border-collapse text-center font-mono text-sm">
        <thead>
          <tr className="text-xs text-slate-300">
            <th className="border-b border-slate-700 px-1 py-1 font-sans">現在</th>
            {task.inputs.map((n) => (
              <th key={n} className="border-b border-slate-700 px-1 py-1 text-sky-300">
                {n}
              </th>
            ))}
            <th className="border-b border-l border-slate-700 px-1 py-1 font-sans">下一個</th>
            {task.outputs.map((n) => (
              <th key={n} className="border-b border-slate-700 px-1 py-1 text-amber-300">
                {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {task.rows.map((row, i) => {
            const s = i >> m;
            return (
              <tr key={i} data-row={i} className={(i & ((1 << m) - 1)) === 0 && i > 0 ? 'border-t border-slate-800' : ''}>
                <td className="px-1 py-0.5 text-slate-200">
                  S{s} <span className="text-[10px] text-slate-500">{stateCode(task.states, s)}</span>
                </td>
                {task.inputs.map((n, b) => (
                  <td key={n} className="px-1 py-0.5 text-slate-300">
                    {(i >> (m - 1 - b)) & 1}
                  </td>
                ))}
                <td className="border-l border-slate-700 px-1 py-0.5">
                  <select
                    aria-label={`S${s}${m > 0 ? `、${task.inputs.map((n, b) => `${n} = ${(i >> (m - 1 - b)) & 1}`).join('、')}` : ''} 的下一個狀態`}
                    value={String(row.next)}
                    onChange={(e) => setRow(i, { ...row, next: e.target.value === 'X' ? 'X' : Number(e.target.value) }, '狀態表：下一個狀態')}
                    className="rounded border border-slate-600 bg-slate-950 px-1 text-xs text-slate-100"
                  >
                    {Array.from({ length: task.states }, (_, n) => (
                      <option key={n} value={n}>
                        S{n}
                      </option>
                    ))}
                    <option value="X">X</option>
                  </select>
                </td>
                {row.out.map((v, k) => (
                  <td key={k} className="px-1 py-0.5">
                    <button type="button" aria-label={`第 ${i} 列 ${task.outputs[k]}`} className={`w-6 font-bold ${tone(v)}`} onClick={() => setRow(i, { ...row, out: row.out.map((x, j) => (j === k ? NEXT[String(x)] : x)) }, `狀態表：${task.outputs[k]}`)}>
                      {v}
                    </button>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-slate-400">下一個狀態用選單選（X 是不在乎）；輸出點一下 0 → 1 → X。沒用到的狀態編碼當成不在乎。</p>
      <div className="rounded border border-slate-700 bg-slate-900/60 p-2">
        <div className="mb-1 text-xs font-semibold text-slate-200">化簡後的式子（積項和）</div>
        <ul data-testid="state-equations" className="space-y-0.5 font-mono text-xs text-slate-100">
          {columns.map((c) => (
            <li key={c.label}>
              {c.label} = {sopText(c.terms, varNames)}
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={`${btn} bg-sky-700 text-white hover:bg-sky-600`} onClick={generate}>
            {diagram.nodes.length > 0 ? '產生電路（取代目前的）' : '產生電路'}
          </button>
          <button type="button" className={`${btn} bg-slate-800 text-slate-200 hover:bg-slate-700`} onClick={() => save(diagram, { ...task, flipFlop: task.flipFlop === 'D' ? 'JK' : 'D' }, '狀態表：換正反器')}>
            改用{task.flipFlop === 'D' ? ' JK ' : ' D 型'}正反器
          </button>
          <button type="button" className={`${btn} bg-slate-800 text-red-300 hover:bg-slate-700`} onClick={() => save(diagram, undefined, '刪除狀態表題目')}>
            刪除題目
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-400">產生後到「時序表」分頁看從 S0 開始每次脈衝後的狀態（Q 是狀態的編碼）。</p>
      </div>
    </div>
  );
}
