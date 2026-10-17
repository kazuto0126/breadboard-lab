import { useEffect, useMemo, useState } from 'react';
import {
  compareDiagramToTask,
  createTask,
  cycleCell,
  MAX_TASK_INPUTS,
  MAX_TASK_OUTPUTS,
  parseNames,
  parseRowList,
  renameTask,
  rowBits,
  rowsWith,
  setColumn,
  taskFromDiagram,
  withTask,
  type TaskResult,
  type TaskValue,
  type TruthTask,
} from '../../logic/task';
import type { LogicDiagram } from '../../logic/types';
import { useLogic } from '../../state/logic';

/** 最多列出幾列不一致。 */
const SHOWN = 8;
const btn = 'rounded px-2 py-1 text-xs disabled:opacity-50';
const field = 'w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none';
const valueTone = (v: TaskValue) => (v === 1 ? 'text-red-400' : v === 0 ? 'text-sky-400' : 'text-slate-400');
/** 句子裡的值：不在乎寫「任意」（輸出常常就叫 X，寫 X = X 會看不懂）。 */
const said = (v: string) => (v === 'X' ? '任意' : v);

/** 換上新的題目（進邏輯圖的 Undo）。 */
function save(diagram: LogicDiagram, task: TruthTask | undefined, label: string) {
  useLogic.getState().apply({ ok: true, diagram: withTask(diagram, task) }, label);
}

/** 輸入名稱、輸出名稱兩個欄位；建立題目與改名稱共用。 */
function NamesForm({ initial, submit, onSubmit, onCancel }: { initial: [string, string]; submit: string; onSubmit: (inputs: string[], outputs: string[]) => TaskResult; onCancel?: () => void }) {
  const [inputs, setInputs] = useState(initial[0]);
  const [outputs, setOutputs] = useState(initial[1]);
  const [error, setError] = useState<string | null>(null);
  const run = () => {
    const a = parseNames(inputs);
    if (!a.ok) return setError(`輸入：${a.reason}`);
    const b = parseNames(outputs);
    if (!b.ok) return setError(`輸出：${b.reason}`);
    const r = onSubmit(a.names, b.names);
    setError(r.ok ? null : r.reason);
  };
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="text-xs text-slate-400">輸入名稱（第一個是最高位元）</span>
        <input aria-label="輸入名稱" value={inputs} placeholder="A B C" onChange={(e) => setInputs(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} className={field} />
      </label>
      <label className="block">
        <span className="text-xs text-slate-400">輸出名稱</span>
        <input aria-label="輸出名稱" value={outputs} placeholder="X Y" onChange={(e) => setOutputs(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} className={field} />
      </label>
      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className={`${btn} bg-sky-700 text-white hover:bg-sky-600`} onClick={run}>
          {submit}
        </button>
        {onCancel && (
          <button type="button" className={`${btn} bg-slate-800 text-slate-200 hover:bg-slate-700`} onClick={onCancel}>
            取消
          </button>
        )}
      </div>
    </div>
  );
}

/** 一個輸出的「1 的列」或「不在乎的列」：按 Enter 或離開欄位就套用。 */
function RowsField({ label, rows, apply }: { label: string; rows: number[]; apply: (text: string) => string | null }) {
  const text = rows.join(', ');
  const [draft, setDraft] = useState(text);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(text);
    setError(null);
  }, [text]);
  const commit = () => {
    if (draft === text) return;
    setError(apply(draft));
  };
  return (
    <div className="flex-1">
      <input
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="w-full rounded border border-slate-600 bg-slate-950 px-1.5 py-0.5 font-mono text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
      />
      {error && <p className="mt-0.5 text-[11px] text-red-300">{error}</p>}
    </div>
  );
}

/** 規格（2026-10-17 truth-table-task）第 3 節：和邏輯圖比對的結果。 */
function DiagramCompare({ diagram, task }: { diagram: LogicDiagram; task: TruthTask }) {
  const result = useMemo(() => compareDiagramToTask(diagram, task), [diagram, task]);
  const box = 'mt-3 rounded border px-3 py-2 text-xs leading-5';
  if (result.kind === 'none') return <p className="mt-3 text-xs text-slate-400">畫好邏輯圖之後，這裡會依名稱和題目比對。</p>;
  if (result.kind === 'issues') {
    return (
      <div data-testid="task-compare" className={`${box} border-amber-700 bg-amber-950/40 text-amber-100`}>
        <div className="font-semibold">還不能和邏輯圖比對</div>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {result.issues.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </div>
    );
  }
  const ok = result.mismatches.length === 0;
  const pair = (values: string[]) => task.outputs.map((name, k) => `${name} = ${said(values[k] ?? '?')}`).join('、');
  const setSwitches = (row: number) => {
    const bits = rowBits(task, row);
    const ids = new Map(diagram.nodes.filter((n) => n.kind === 'INPUT').map((n) => [n.name, n.id]));
    useLogic.getState().setInputs(Object.fromEntries(task.inputs.map((name, i) => [ids.get(name) ?? name, bits[i]])));
  };
  return (
    <div data-testid="task-compare" className={`${box} ${ok ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200' : 'border-red-700 bg-red-950/50 text-red-200'}`}>
      <div className="font-semibold">和邏輯圖比對</div>
      {ok ? (
        <p>
          {result.rows} 種輸入組合，邏輯圖和題目全部一致{result.dontCares ? '（不在乎的格子不比）' : ''}
        </p>
      ) : (
        <>
          <p>有 {result.mismatches.length} 列不一致。點一列把邏輯圖的開關設成那一列。</p>
          <ul className="mt-1 space-y-1">
            {result.mismatches.slice(0, SHOWN).map((m) => (
              <li key={m.row}>
                <button type="button" className="w-full rounded bg-red-900/50 px-2 py-1 text-left hover:bg-red-800/60" onClick={() => setSwitches(m.row)}>
                  {task.inputs.join(' ')} = {[...m.inputs].join(' ')}：題目 {pair(m.expected)}，邏輯圖 {pair(m.actual)}
                </button>
              </li>
            ))}
          </ul>
          {result.mismatches.length > SHOWN && <p className="mt-1">還有 {result.mismatches.length - SHOWN} 列。</p>}
        </>
      )}
    </div>
  );
}

/** 規格第 3 節：邏輯圖畫面的「題目」分頁。 */
export function TaskTab({ diagram }: { diagram: LogicDiagram }) {
  const task = diagram.task;
  const [renaming, setRenaming] = useState(false);
  const [fromDiagramError, setFromDiagramError] = useState<string | null>(null);
  useEffect(() => {
    if (!task) setRenaming(false);
  }, [task]);

  if (!task) {
    return (
      <div data-testid="task-tab" className="space-y-3 p-3 text-sm">
        <p className="text-slate-300">直接輸入老師給的真值表當題目；之後邏輯圖和麵包板都可以依名稱和它比對。</p>
        <NamesForm
          initial={['', '']}
          submit="建立題目"
          onSubmit={(inputs, outputs) => {
            const r = createTask(inputs, outputs);
            if (r.ok) save(diagram, r.task, '建立題目');
            return r;
          }}
        />
        {diagram.nodes.length > 0 && (
          <div>
            <button
              type="button"
              className={`${btn} bg-slate-800 text-slate-200 hover:bg-slate-700`}
              onClick={() => {
                const r = taskFromDiagram(diagram);
                if (r.ok) save(diagram, r.task, '用邏輯圖的真值表建立題目');
                setFromDiagramError(r.ok ? null : r.reason);
              }}
            >
              用邏輯圖的真值表建立
            </button>
            {fromDiagramError && <p className="mt-1 text-xs text-red-300">{fromDiagramError}</p>}
          </div>
        )}
        <p className="text-xs text-slate-400">
          輸入最多 {MAX_TASK_INPUTS} 個、輸出最多 {MAX_TASK_OUTPUTS} 個，名稱用空白或逗號分開。
        </p>
      </div>
    );
  }

  const column = (k: number) => (text: string) => {
    const ones = parseRowList(text, task.rows.length);
    if (!ones.ok) return ones.reason;
    const r = setColumn(task, k, ones.rows, rowsWith(task, k, 'X').filter((row) => !ones.rows.includes(row)));
    if (!r.ok) return r.reason;
    save(diagram, r.task, `題目：${task.outputs[k]} 的 1 的列`);
    return null;
  };
  const dontCare = (k: number) => (text: string) => {
    const xs = parseRowList(text, task.rows.length);
    if (!xs.ok) return xs.reason;
    const r = setColumn(task, k, rowsWith(task, k, 1).filter((row) => !xs.rows.includes(row)), xs.rows);
    if (!r.ok) return r.reason;
    save(diagram, r.task, `題目：${task.outputs[k]} 不在乎的列`);
    return null;
  };

  return (
    <div data-testid="task-tab" className="p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-slate-400">
          題目：輸入 {task.inputs.join(' ')}，輸出 {task.outputs.join(' ')}
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" className={`${btn} bg-slate-800 text-slate-200 hover:bg-slate-700`} onClick={() => setRenaming(!renaming)}>
            改名稱
          </button>
          <button type="button" className={`${btn} bg-red-800 text-white hover:bg-red-700`} onClick={() => save(diagram, undefined, '刪除題目')}>
            刪除題目
          </button>
        </div>
      </div>
      {renaming && (
        <div className="mt-2 rounded border border-slate-700 p-2">
          <NamesForm
            initial={[task.inputs.join(' '), task.outputs.join(' ')]}
            submit="套用"
            onCancel={() => setRenaming(false)}
            onSubmit={(inputs, outputs) => {
              const r = renameTask(task, inputs, outputs);
              if (r.ok) {
                save(diagram, r.task, '題目改名稱');
                setRenaming(false);
              }
              return r;
            }}
          />
          <p className="mt-1 text-[11px] text-slate-400">輸入的個數改變時，每一列重新從 0 開始；輸出依名稱保留。</p>
        </div>
      )}

      <table className="mt-2 w-full border-collapse text-center font-mono text-sm">
        <thead>
          <tr className="text-slate-300">
            <th className="border-b border-slate-700 px-1 py-1 text-xs font-normal text-slate-500">#</th>
            {task.inputs.map((n) => (
              <th key={`i${n}`} className="border-b border-slate-700 px-1 py-1">
                {n}
              </th>
            ))}
            {task.outputs.map((n, k) => (
              <th key={`o${n}`} className={`border-b border-slate-700 px-1 py-1 text-amber-300 ${k === 0 ? 'border-l' : ''}`}>
                {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {task.rows.map((out, r) => (
            <tr key={r} data-task-row={r} className="hover:bg-slate-800/60">
              <td className="px-1 py-0.5 text-xs text-slate-500">{r}</td>
              {rowBits(task, r).map((b, i) => (
                <td key={`i${i}`} className={`px-1 py-0.5 ${b === 1 ? 'text-red-400' : 'text-sky-400'}`}>
                  {b}
                </td>
              ))}
              {out.map((v, k) => (
                <td key={`o${k}`} className={`p-0 ${k === 0 ? 'border-l border-slate-700' : ''}`}>
                  <button
                    type="button"
                    data-task-cell={k}
                    aria-label={`第 ${r} 列 ${task.outputs[k]}`}
                    className={`w-full px-1 py-0.5 font-bold hover:bg-slate-700 ${valueTone(v)}`}
                    onClick={() => save(diagram, cycleCell(task, r, k), `題目：${task.outputs[k]} 第 ${r} 列改成 ${v === 0 ? 1 : v === 1 ? 'X' : 0}`)}
                  >
                    {v}
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-slate-400">點輸出格換值：0 → 1 → X（不在乎，不比對）。也可以在下面直接輸入列號。</p>

      <div className="mt-2 space-y-2">
        {task.outputs.map((name, k) => (
          <div key={name} className="text-xs">
            <div className="font-semibold text-amber-300">{name}</div>
            <div className="mt-0.5 grid grid-cols-[auto_1fr] items-start gap-x-2 gap-y-1">
              <span className="pt-0.5 text-slate-400">1 的列</span>
              <RowsField label={`${name} 的 1 的列`} rows={rowsWith(task, k, 1)} apply={column(k)} />
              <span className="pt-0.5 text-slate-400">不在乎</span>
              <RowsField label={`${name} 的不在乎的列`} rows={rowsWith(task, k, 'X')} apply={dontCare(k)} />
            </div>
          </div>
        ))}
      </div>

      <DiagramCompare diagram={diagram} task={task} />
    </div>
  );
}
