import { useEffect, useMemo, useState } from 'react';
import {
  compareDiagramToTask,
  createTask,
  cycleCell,
  isDisplayOutput,
  MAX_TASK_INPUTS,
  MAX_TASK_OUTPUTS,
  parseDisplayValues,
  parseNames,
  parseRowList,
  renameTask,
  rowBits,
  rowsWith,
  setColumn,
  setDisplayColumn,
  setOutputKind,
  taskFromDiagram,
  withTask,
  type TaskResult,
  type TaskValue,
  type TruthTask,
} from '../../logic/task';
import { designFromTask, termsOfTask, usesPos, type DesignForm } from '../../logic/design';
import { taskFromExpressions } from '../../logic/expression';
import { withStateTask } from '../../logic/stateTask';
import { literalsOf, posText, sopText, sumLiteralsOf, type Term } from '../../logic/minimize';
import type { LogicDiagram } from '../../logic/types';
import { useLogic } from '../../state/logic';
import { openConvert } from './LogicPanel';
import { StateTaskTab } from './StateTaskTab';

/** 最多列出幾列不一致。 */
const SHOWN = 8;
const btn = 'rounded px-2 py-1 text-xs disabled:opacity-50';
const field = 'w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none';
const valueTone = (v: TaskValue, display: boolean) => (v === 'X' ? 'text-slate-400' : display ? 'text-emerald-300' : v === 1 ? 'text-red-400' : 'text-sky-400');
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

/** 子專案 35：用布林式建立或改寫題目（每行一個輸出，例如 X = AB + A'C）。Ctrl+Enter 也可以送出。 */
function ExpressionForm({ submit, onSubmit, onCancel }: { submit: string; onSubmit: (task: TruthTask) => void; onCancel?: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const run = () => {
    const r = taskFromExpressions(text);
    setError(r.ok ? null : r.reason);
    if (r.ok) onSubmit(r.task);
  };
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="text-xs text-slate-400">布林式（每行一個輸出）</span>
        <textarea
          aria-label="布林式"
          rows={3}
          value={text}
          placeholder={"X = AB + A'C\nY = (A + B)'C"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === 'Enter' && run()}
          className={`${field} font-mono`}
        />
      </label>
      <p className="text-[11px] leading-4 text-slate-400">
        A' 是反相（也可以寫 !A），AB 是 AND，+ 是 OR，⊕ 或 ^ 是 XOR，可以加括號。變數是一個英文字母（後面可以接數字），依字母排序、第一個是最高位元；會先化簡再畫。
      </p>
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

/** 一個輸出的「1 的列」、「不在乎的列」或顯示器「每一列的數字」：按 Enter 或離開欄位就套用。 */
function RowsField({ label, text, apply }: { label: string; text: string; apply: (text: string) => string | null }) {
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

/** 積項和；反相用上橫線（課本寫法）。 */
function SumOfProducts({ terms, names }: { terms: Term[]; names: string[] }) {
  const parts = terms.map((t) => literalsOf(t, names));
  if (parts.length === 0) return <>0</>;
  if (parts.some((p) => p.length === 0)) return <>1</>;
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && ' + '}
          {p.map((l) => (
            <span key={l.name} style={l.negated ? { textDecoration: 'overline' } : undefined}>
              {l.name}
            </span>
          ))}
        </span>
      ))}
    </>
  );
}

/** 子專案 31：和積（「(A + B)(A + C)」），反相用上橫線。terms 是 F' 的積項。 */
function ProductOfSums({ terms, names }: { terms: Term[]; names: string[] }) {
  const sums = terms.map((t) => sumLiteralsOf(t, names));
  if (sums.length === 0) return <>1</>;
  if (sums.some((p) => p.length === 0)) return <>0</>;
  const letter = (l: { name: string; negated: boolean }) => (
    <span key={l.name} style={l.negated ? { textDecoration: 'overline' } : undefined}>
      {l.name}
    </span>
  );
  return (
    <>
      {sums.map((p, i) => {
        const inner = p.map((l, j) => (
          <span key={l.name}>
            {j > 0 && ' + '}
            {letter(l)}
          </span>
        ));
        return <span key={i}>{sums.length > 1 && p.length > 1 ? <>({inner})</> : inner}</span>;
      })}
    </>
  );
}

const FORMS: Array<[DesignForm, string, string]> = [
  ['sop', '積項和', 'AND–OR'],
  ['pos', '和積', 'OR–AND'],
  ['nand', '只用 NAND', 'NAND–NAND'],
  ['nor', '只用 NOR', 'NOR–NOR'],
];

/**
 * 子專案 25（規格 2026-10-17 task-to-diagram 第 4 節）：每個輸出化簡後的布林式與「產生邏輯圖」。
 * 子專案 31：可以選形式（積項和、和積、只用 NAND、只用 NOR）。
 */
function Simplified({ diagram, task }: { diagram: LogicDiagram; task: TruthTask }) {
  const [form, setForm] = useState<DesignForm>('sop');
  const columns = useMemo(() => termsOfTask(task, form), [task, form]);
  const pos = usesPos(form);
  const generate = () => {
    const s = useLogic.getState();
    // 子專案 52：狀態表題目跟著保留。
    s.apply({ ok: true, diagram: withStateTask(designFromTask(task, form).diagram, diagram.stateTask) }, `從題目產生邏輯圖（${FORMS.find((x) => x[0] === form)![1]}）`, null);
    s.fit();
  };
  return (
    <div data-testid="task-sop" className="mt-3 rounded border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs leading-5">
      <div className="font-semibold text-slate-200">化簡與產生邏輯圖</div>
      <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="形式">
        {FORMS.map(([id, label, hint]) => (
          <button
            key={id}
            type="button"
            aria-pressed={form === id}
            title={hint}
            onClick={() => setForm(id)}
            className={`${btn} ${form === id ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {columns.map(({ label, terms }) => (
        <div key={label} data-sop={label} data-text={pos ? posText(terms, task.inputs) : sopText(terms, task.inputs)} className="mt-1 font-mono text-sm text-slate-100">
          <span className="text-amber-300">{label}</span> = {pos ? <ProductOfSums terms={terms} names={task.inputs} /> : <SumOfProducts terms={terms} names={task.inputs} />}
        </div>
      ))}
      {task.displays && <p className="mt-1 text-[11px] text-slate-400">顯示器拆成 A（最低位元）到 D 四個位元各自化簡，接到 7 段顯示器的 A–D。</p>}
      <div className="mt-2 flex flex-wrap gap-1">
        <button type="button" className={`${btn} bg-sky-700 text-white hover:bg-sky-600`} onClick={generate}>
          {diagram.nodes.length > 0 ? '產生邏輯圖（取代目前的）' : '產生邏輯圖'}
        </button>
        {/* 子專案 35：產生邏輯圖後直接打開「轉成麵包板」的設定視窗。 */}
        <button
          type="button"
          className={`${btn} bg-emerald-600 text-white hover:bg-emerald-500`}
          onClick={() => {
            generate();
            openConvert();
          }}
        >
          產生並轉成麵包板…
        </button>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        照化簡結果畫出 {FORMS.find((x) => x[0] === form)![2]} 邏輯圖（X 的格子拿來幫忙化簡，多個輸出盡量共用閘）；可以用 Undo 回到原本的圖。
      </p>
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
/** 子專案 52：「題目」分頁上方切換真值表題目與狀態表題目（只有狀態表題目時先顯示狀態表）。 */
export function TaskTab({ diagram }: { diagram: LogicDiagram }) {
  const [kind, setKind] = useState<'truth' | 'state'>(diagram.stateTask && !diagram.task ? 'state' : 'truth');
  return (
    <div>
      <div className="flex gap-1 px-3 pt-3">
        {(['truth', 'state'] as const).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`${btn} ${kind === k ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>
            {k === 'truth' ? '真值表題目' : '狀態表題目'}
          </button>
        ))}
      </div>
      {kind === 'truth' ? <TruthTaskTab diagram={diagram} /> : <StateTaskTab diagram={diagram} />}
    </div>
  );
}

function TruthTaskTab({ diagram }: { diagram: LogicDiagram }) {
  const task = diagram.task;
  const [renaming, setRenaming] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [fromDiagramError, setFromDiagramError] = useState<string | null>(null);
  useEffect(() => {
    if (!task) {
      setRenaming(false);
      setRewriting(false);
    }
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
        <div className="border-t border-slate-700 pt-3">
          <div className="mb-1 text-xs font-semibold text-slate-300">或用布林式建立</div>
          <ExpressionForm submit="用布林式建立題目" onSubmit={(t) => save(diagram, t, '用布林式建立題目')} />
        </div>
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
  const numbers = (k: number) => (text: string) => {
    const values = parseDisplayValues(text, task.rows.length);
    if (!values.ok) return values.reason;
    const r = setDisplayColumn(task, k, values.values);
    if (!r.ok) return r.reason;
    save(diagram, r.task, `題目：${task.outputs[k]} 每一列的數字`);
    return null;
  };
  const kind = (k: number, display: boolean) => {
    const r = setOutputKind(task, k, display);
    if (r.ok && r.task !== task) save(diagram, r.task, `題目：${task.outputs[k]} 改成${display ? ' 7 段顯示器' : '輸出端'}`);
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
          <button type="button" className={`${btn} bg-slate-800 text-slate-200 hover:bg-slate-700`} onClick={() => setRewriting(!rewriting)}>
            布林式…
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
      {rewriting && (
        <div className="mt-2 rounded border border-slate-700 p-2">
          <ExpressionForm
            submit="用布林式改寫題目"
            onCancel={() => setRewriting(false)}
            onSubmit={(t) => {
              save(diagram, t, '用布林式改寫題目');
              setRewriting(false);
            }}
          />
          <p className="mt-1 text-[11px] text-slate-400">整個題目換成布林式算出來的真值表；可以用 Undo 回到原本的題目。</p>
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
                {isDisplayOutput(task, k) && <span className="ml-0.5 text-[10px] font-normal text-slate-400">7 段</span>}
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
                    className={`w-full px-1 py-0.5 font-bold hover:bg-slate-700 ${valueTone(v, isDisplayOutput(task, k))}`}
                    onClick={() => {
                      const next = cycleCell(task, r, k);
                      save(diagram, next, `題目：${task.outputs[k]} 第 ${r} 列改成 ${next.rows[r][k]}`);
                    }}
                  >
                    {v}
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-slate-400">
        點輸出格換值：0 → 1 → X（不在乎，不比對）；7 段顯示器的格子是 0 → 1 → … → 15 → X。也可以在下面直接輸入。
      </p>

      <div className="mt-2 space-y-2">
        {task.outputs.map((name, k) => (
          <div key={name} className="text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-amber-300">{name}</span>
              {/* 子專案 32：輸出可以是 7 段顯示器（BCD，格子是 0–15）。 */}
              <div className="flex gap-1" role="group" aria-label={`${name} 的種類`}>
                {([[false, '輸出端'], [true, '7 段顯示器']] as const).map(([display, text]) => (
                  <button
                    key={text}
                    type="button"
                    aria-pressed={isDisplayOutput(task, k) === display}
                    onClick={() => kind(k, display)}
                    className={`rounded px-1.5 py-0.5 text-[11px] ${isDisplayOutput(task, k) === display ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>
            {isDisplayOutput(task, k) ? (
              <div className="mt-0.5 grid grid-cols-[auto_1fr] items-start gap-x-2 gap-y-1">
                <span className="pt-0.5 text-slate-400">每一列</span>
                <RowsField label={`${name} 每一列的數字`} text={task.rows.map((row) => String(row[k])).join(' ')} apply={numbers(k)} />
              </div>
            ) : (
              <div className="mt-0.5 grid grid-cols-[auto_1fr] items-start gap-x-2 gap-y-1">
                <span className="pt-0.5 text-slate-400">1 的列</span>
                <RowsField label={`${name} 的 1 的列`} text={rowsWith(task, k, 1).join(', ')} apply={column(k)} />
                <span className="pt-0.5 text-slate-400">不在乎</span>
                <RowsField label={`${name} 的不在乎的列`} text={rowsWith(task, k, 'X').join(', ')} apply={dontCare(k)} />
              </div>
            )}
          </div>
        ))}
      </div>

      <Simplified diagram={diagram} task={task} />
      <DiagramCompare diagram={diagram} task={task} />
    </div>
  );
}
