import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { centerOn } from '../../editor/viewport';
import { checkDiagram, nodeLabel } from '../../logic/check';
import { removeNodes, removeWire, renameNode, setConstant, setGateKind, setInputCount } from '../../logic/edit';
import { BLOCK_PINS } from '../../logic/blocks';
import { evaluate, sortedIo, truthTable, type Bit, type OutValue } from '../../logic/evaluate';
import { nodeSize } from '../../logic/shapes';
import { GATE_KINDS, isGate, signalOf, type LogicDiagram, type LogicNode } from '../../logic/types';
import { LOGIC_CELL, useLogic, type LogicTab } from '../../state/logic';
import { convertProblem } from '../../logic/synth';
import { useStore } from '../../state/store';

const TABS: Array<[LogicTab, string]> = [
  ['inspect', '屬性'],
  ['table', '真值表'],
  ['check', '檢查'],
];

const btn = 'rounded px-2 py-1 text-xs disabled:opacity-50';

/** 規格（2026-10-13 logic-to-breadboard）第 2 節：不能轉就說明原因，否則打開設定對話框。 */
export function openConvert() {
  const problem = convertProblem(useLogic.getState().diagram);
  if (problem) useStore.getState().toast('warning', problem);
  else useStore.getState().openDialog('to-breadboard');
}
const bitText = (b: OutValue) => (b === 'X' ? '?' : String(b));
/** 顯示器的欄（數字）用另一個顏色。 */
const outTone = (b: OutValue, display: boolean) => (display ? (b === 'X' ? 'text-slate-400' : 'text-amber-300') : bitTone(b as Bit));
const bitTone = (b: Bit) => (b === 1 ? 'text-red-400' : b === 0 ? 'text-sky-400' : 'text-slate-400');

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-b border-slate-800 p-3 text-sm">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</div>
      {children}
    </section>
  );
}

function NameEditor({ node }: { node: LogicNode }) {
  const [draft, setDraft] = useState(node.name ?? '');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(node.name ?? '');
    setError(null);
  }, [node.id, node.name]);
  const commit = () => {
    if (draft.trim() === node.name) return;
    const s = useLogic.getState();
    const r = renameNode(s.diagram, node.id, draft);
    if (r.ok) {
      s.apply(r, `改名 ${node.name} → ${draft.trim()}`);
      setError(null);
    } else {
      setError(r.reason);
      setDraft(node.name ?? '');
    }
  };
  return (
    <div>
      <label className="flex items-center gap-2">
        <span className="w-12 text-slate-400">名稱</span>
        <input
          aria-label="名稱"
          value={draft}
          maxLength={8}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          className="w-28 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
        />
      </label>
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}

function Inspector({ diagram }: { diagram: LogicDiagram }) {
  const selection = useLogic((s) => s.selection);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [selection]);
  const s = useLogic.getState();
  const run = (r: Parameters<typeof s.apply>[0], label: string) => {
    if (!s.apply(r, label) && !r.ok) setError(r.reason);
    else setError(null);
  };

  if (selection?.kind === 'node') {
    const node = diagram.nodes.find((n) => n.id === selection.id);
    if (!node) return null;
    return (
      <Section title={isGate(node.kind) ? '邏輯閘' : node.kind === 'INPUT' ? '輸入端' : node.kind === 'DISPLAY' ? '7 段顯示器' : node.kind === 'BLOCK' ? 'IC 方塊' : node.kind === 'HIGH' || node.kind === 'LOW' ? '常數' : '輸出端'}>
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold text-slate-50">{node.name ?? (node.kind === 'BLOCK' ? `${node.id}（${node.chip}）` : node.id)}</div>
          <button type="button" className={`${btn} bg-red-800 text-white hover:bg-red-700`} onClick={() => s.apply({ ok: true, diagram: removeNodes(diagram, [node.id]) }, `刪除 ${node.id}`, null)}>
            刪除
          </button>
        </div>
        {isGate(node.kind) && (
          <>
            <div className="flex items-center gap-2">
              <span className="w-12 text-slate-400">種類</span>
              <div className="flex flex-wrap gap-1">
                {GATE_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={node.kind === k}
                    onClick={() => run(setGateKind(diagram, node.id, k), `改成 ${k}`)}
                    className={`${btn} ${node.kind === k ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
            {node.kind !== 'NOT' && node.kind !== 'XOR' && (
              <div className="flex items-center gap-2">
                <span className="w-12 text-slate-400">輸入數</span>
                {[2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`輸入數 ${n}`}
                    aria-pressed={node.inputs === n}
                    onClick={() => run(setInputCount(diagram, node.id, n), `${node.id} 改成 ${n} 個輸入`)}
                    className={`${btn} w-8 ${node.inputs === n ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {(node.kind === 'INPUT' || node.kind === 'OUTPUT' || node.kind === 'DISPLAY') && <NameEditor node={node} />}
        {(node.kind === 'HIGH' || node.kind === 'LOW') && (
          <div className="flex items-center gap-2">
            <span className="w-12 text-slate-400">值</span>
            {(['HIGH', 'LOW'] as const).map((k) => (
              <button key={k} type="button" aria-pressed={node.kind === k} onClick={() => run(setConstant(diagram, node.id, k), `${node.id} 改成 ${k === 'HIGH' ? '5V' : 'GND'}`)} className={`${btn} ${node.kind === k ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>
                {k === 'HIGH' ? '5V（1）' : 'GND（0）'}
              </button>
            ))}
          </div>
        )}
        {node.kind === 'BLOCK' && <BlockValues diagram={diagram} node={node} />}
        {node.kind === 'DISPLAY' && <DisplayValue diagram={diagram} node={node} />}
        {node.kind === 'INPUT' && (
          <div className="flex items-center gap-2">
            <span className="w-12 text-slate-400">目前值</span>
            <button type="button" className={`${btn} bg-slate-800 text-slate-100 hover:bg-slate-700`} onClick={() => s.toggleInput(node.id)}>
              {node.value ?? 0}（點一下切換）
            </button>
          </div>
        )}
        {error && <p className="text-xs text-red-300">{error}</p>}
      </Section>
    );
  }
  if (selection?.kind === 'nodes') {
    return (
      <Section title="多個元件">
        <p className="text-slate-200">已選取 {selection.ids.length} 個元件：{selection.ids.join('、')}</p>
        <p className="text-xs leading-5 text-slate-400">拖曳其中一個可以整組移動；Ctrl+C 複製、Ctrl+V 貼上；Del 刪除。</p>
        <button type="button" className={`${btn} bg-red-800 text-white hover:bg-red-700`} onClick={() => s.deleteSelection()}>
          刪除這 {selection.ids.length} 個
        </button>
      </Section>
    );
  }
  if (selection?.kind === 'wire') {
    const w = diagram.wires.find((x) => x.id === selection.id);
    const from = w && diagram.nodes.find((n) => n.id === w.from);
    const to = w && diagram.nodes.find((n) => n.id === w.to.node);
    if (!w || !from || !to) return null;
    return (
      <Section title="線">
        <p className="text-slate-200">
          {nodeLabel(from)} → {nodeLabel(to)}
          {from.kind === 'BLOCK' && from.chip && `（${BLOCK_PINS[from.chip].outputs[w.fromPin ?? 0]}）`}
          {to.kind === 'DISPLAY' ? `${'ABCD'[w.to.pin]} 腳` : to.kind === 'BLOCK' && to.chip ? `的 ${BLOCK_PINS[to.chip].inputs[w.to.pin]} 腳` : to.kind !== 'OUTPUT' && `第 ${w.to.pin + 1} 個輸入`}
        </p>
        <button type="button" className={`${btn} bg-red-800 text-white hover:bg-red-700`} onClick={() => s.apply({ ok: true, diagram: removeWire(diagram, w.id) }, '刪除線', null)}>
          刪除
        </button>
      </Section>
    );
  }
  const count = (pred: (n: LogicNode) => boolean) => diagram.nodes.filter(pred).length;
  return (
    <Section title="邏輯圖">
      <p className="text-slate-200">
        閘 {count((n) => isGate(n.kind))}・輸入端 {count((n) => n.kind === 'INPUT')}・輸出端 {count((n) => n.kind === 'OUTPUT')}{count((n) => n.kind === 'DISPLAY') > 0 && `・顯示器 ${count((n) => n.kind === 'DISPLAY')}`}{count((n) => n.kind === 'BLOCK') > 0 && `・IC 方塊 ${count((n) => n.kind === 'BLOCK')}`}・線 {diagram.wires.length}
      </p>
      <p className="text-xs leading-5 text-slate-400">從左邊放邏輯閘、輸入端、輸出端，再從一個腳拖到另一個腳連線。點輸入端的開關切換 0 / 1，線和燈號會即時顯示結果。</p>
      <button type="button" className={`${btn} bg-emerald-600 text-white hover:bg-emerald-500`} onClick={openConvert}>
        轉成麵包板…
      </button>
    </Section>
  );
}

/** 規格（2026-10-13 seven-seg）第 5 節：顯示器目前的值與 D C B A 四條線。 */
function DisplayValue({ diagram, node }: { diagram: LogicDiagram; node: LogicNode }) {
  const values = useMemo(() => evaluate(diagram), [diagram]);
  const v = values.displays.get(node.id) ?? 'X';
  const driver = new Map(diagram.wires.map((w) => [`${w.to.node}#${w.to.pin}`, w.from]));
  const bits = [3, 2, 1, 0].map((pin) => {
    const from = driver.get(`${node.id}#${pin}`);
    return bitText(from === undefined ? 'X' : (values.nodes.get(from) ?? 'X'));
  });
  return (
    <p data-testid="display-value" className="text-slate-300">
      {v === 'X' ? '有沒接好或不確定的輸入，顯示「–」' : `目前顯示 ${v}`}（輸入 D C B A = {bits.join(' ')}）
      {typeof v === 'number' && v > 9 && <span className="block text-xs text-slate-400">10–15 不是 BCD 數字，74LS47 會亮出特殊的圖形。</span>}
    </p>
  );
}

/** 子專案 21：方塊每個輸出腳目前的值。 */
function BlockValues({ diagram, node }: { diagram: LogicDiagram; node: LogicNode }) {
  const values = useMemo(() => evaluate(diagram), [diagram]);
  if (!node.chip) return null;
  return (
    <div className="text-xs text-slate-300" data-testid="block-values">
      <div className="text-slate-400">輸出（目前的值）</div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono">
        {BLOCK_PINS[node.chip].outputs.map((name, k) => (
          <span key={name}>
            {name} = {bitText(values.nodes.get(signalOf(node.id, k)) ?? 'X')}
          </span>
        ))}
      </div>
      <p className="mt-1 text-slate-400">要在真值表看結果，把輸出接到輸出端或 7 段顯示器。</p>
    </div>
  );
}

function TruthTableTab({ diagram }: { diagram: LogicDiagram }) {
  const table = useMemo(() => truthTable(diagram), [diagram]);
  if (!table.ok) {
    const text =
      table.reason === 'loop'
        ? `邏輯圖有迴圈（${(table.loop ?? []).join('、')}），不能算真值表`
        : table.reason === 'too-many'
          ? '輸入超過 8 個，真值表太長（256 列以上），請用模擬檢查'
          : '先放輸入端和輸出端';
    return <p className="p-3 text-sm text-slate-300">{text}</p>;
  }
  const { inputs, outputs } = sortedIo(diagram);
  const current = inputs.map((n) => (n.value ?? 0) as 0 | 1).join('');
  return (
    <div className="p-3">
      <table data-testid="truth-table" className="w-full border-collapse text-center font-mono text-sm">
        <thead>
          <tr className="text-slate-300">
            {table.inputs.map((n) => (
              <th key={`i${n}`} className="border-b border-slate-700 px-1 py-1">
                {n}
              </th>
            ))}
            {table.outputs.map((n, i) => (
              <th key={`o${n}`} className={`border-b border-slate-700 px-1 py-1 text-amber-300 ${i === 0 ? 'border-l' : ''}`}>
                {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r) => {
            const key = r.in.join('');
            const here = key === current;
            return (
              <tr
                key={key}
                data-row={key}
                aria-current={here ? 'true' : undefined}
                onClick={() => useLogic.getState().setInputs(Object.fromEntries(inputs.map((n, i) => [n.id, r.in[i]])))}
                className={`cursor-pointer ${here ? 'bg-sky-900/60' : 'hover:bg-slate-800'}`}
                title="點一下把開關設成這一列"
              >
                {r.in.map((b, i) => (
                  <td key={`i${i}`} className={`px-1 py-0.5 ${bitTone(b)}`}>
                    {b}
                  </td>
                ))}
                {r.out.map((b, i) => (
                  <td key={`o${i}`} className={`px-1 py-0.5 font-bold ${outTone(b, outputs[i]?.kind === 'DISPLAY')} ${i === 0 ? 'border-l border-slate-700' : ''}`}>
                    {bitText(b)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-400">標亮的是目前開關的組合；點一列可以把開關設成那個組合。</p>
    </div>
  );
}

function CheckTab({ diagram }: { diagram: LogicDiagram }) {
  const issues = useMemo(() => checkDiagram(diagram), [diagram]);
  if (issues.length === 0) return <p className="p-3 text-sm text-emerald-300">沒有發現問題</p>;
  const focus = (ids: string[]) => {
    const node = diagram.nodes.find((n) => n.id === ids[0]);
    if (!node) return;
    const s = useLogic.getState();
    s.select({ kind: 'node', id: node.id });
    const { w, h } = nodeSize(node);
    const rect = { x: (node.x - 1) * LOGIC_CELL, y: (node.y - 1) * LOGIC_CELL, width: (w + 2) * LOGIC_CELL, height: (h + 2) * LOGIC_CELL };
    s.setViewport(centerOn(s.viewport, rect, s.canvasSize.width, s.canvasSize.height));
  };
  return (
    <ul className="space-y-1 p-2">
      {issues.map((issue, i) => (
        <li key={i}>
          <button
            type="button"
            onClick={() => focus(issue.nodeIds)}
            className={`w-full rounded px-2 py-1.5 text-left text-xs leading-5 ${issue.severity === 'error' ? 'bg-red-950/60 text-red-200' : 'bg-amber-950/50 text-amber-200'} hover:brightness-125`}
          >
            {issue.severity === 'error' ? '✕ ' : '⚠ '}
            {issue.message}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** 規格第 5 節：邏輯圖時的右側面板（屬性、真值表、檢查）。 */
export function LogicPanel() {
  const diagram = useLogic((s) => s.diagram);
  const tab = useLogic((s) => s.tab);
  const open = useStore((s) => s.drawer === 'info');
  const problems = useMemo(() => checkDiagram(diagram), [diagram]);
  return (
    <aside
      aria-label="邏輯圖資訊"
      className={`${open ? 'flex' : 'hidden'} absolute inset-y-0 right-0 z-30 w-80 max-w-[90vw] shrink-0 flex-col border-l border-slate-800 bg-slate-900 shadow-2xl lg:static lg:z-auto lg:flex lg:h-full lg:shadow-none`}
    >
      <div className="flex border-b border-slate-800" role="tablist">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => useLogic.getState().setTab(id)}
            className={`flex-1 whitespace-nowrap px-2 py-2 text-sm ${tab === id ? 'border-b-2 border-sky-500 text-slate-50' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {label}
            {id === 'check' && problems.length > 0 && (
              <span className={`ml-1.5 rounded-full px-1.5 text-[10px] ${problems.some((p) => p.severity === 'error') ? 'bg-red-600 text-white' : 'bg-amber-500 text-black'}`}>{problems.length}</span>
            )}
          </button>
        ))}
      </div>
      <div className="bbl-scroll min-h-0 flex-1 overflow-y-auto">
        {tab === 'inspect' && <Inspector diagram={diagram} />}
        {tab === 'table' && <TruthTableTab diagram={diagram} />}
        {tab === 'check' && <CheckTab diagram={diagram} />}
      </div>
    </aside>
  );
}
