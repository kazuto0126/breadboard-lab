import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { centerOn } from '../../editor/viewport';
import { checkDiagram, nodeLabel } from '../../logic/check';
import { removeNodes, removeWire, renameNode, setActiveLow, setConstant, setDisplayMode, setFlip, setGateKind, setInputCount, setRotation } from '../../logic/edit';
import { BLOCK_DEFAULTS, BLOCK_PINS, isSequentialChip } from '../../logic/blocks';
import { clockNodes, evaluate, isSequential, parseClockOrder, MAX_TABLE_INPUTS, PULSE_CHOICES, segmentToken, sequenceTable, sortedIo, truthTable, type Bit, type OutValue } from '../../logic/evaluate';
import { boxOf } from '../../logic/shapes';
import { canRotate, GATE_KINDS, isGate, signalOf, type LogicDiagram, type LogicNode } from '../../logic/types';
import { LOGIC_CELL, useLogic, type LogicTab } from '../../state/logic';
import { convertProblem } from '../../logic/synth';
import { diagramFormulas, type OutputFormula } from '../../logic/formula';
import { useStore } from '../../state/store';
import { LogicNoteInspector } from './LogicNoteInspector';
import { blockOf, nextBlockName, renameBlock } from '../../logic/customBlocks';
import { blockPins } from '../../logic/flatten';
import { TaskTab } from './TaskTab';
import { Waveform } from './Waveform';

const TABS: Array<[LogicTab, string]> = [
  ['inspect', '屬性'],
  ['table', '真值表'],
  ['task', '題目'],
  ['check', '檢查'],
];

const btn = 'rounded px-2 py-1 text-xs disabled:opacity-50';
/** 子專案 26：方向按鈕（輸出朝哪裡）。 */
const DIRECTIONS = [
  [0, '右', '→'],
  [90, '下', '↓'],
  [180, '左', '←'],
  [270, '上', '↑'],
] as const;

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
  const inBlock = useLogic((s) => s.outer.length > 0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [selection]);
  const s = useLogic.getState();
  const run = (r: Parameters<typeof s.apply>[0], label: string) => {
    if (!s.apply(r, label) && !r.ok) setError(r.reason);
    else setError(null);
  };

  if (selection?.kind === 'note') {
    const note = diagram.notes?.find((n) => n.id === selection.id);
    return note ? <LogicNoteInspector diagram={diagram} note={note} /> : null;
  }
  if (selection?.kind === 'node') {
    const node = diagram.nodes.find((n) => n.id === selection.id);
    if (!node) return null;
    return (
      <Section title={isGate(node.kind) ? '邏輯閘' : node.kind === 'INPUT' ? '輸入端' : node.kind === 'DISPLAY' ? '7 段顯示器' : node.kind === 'BLOCK' ? (isSequentialChip(node.chip) ? '正反器 / 計數器' : 'IC 方塊') : node.kind === 'HIGH' || node.kind === 'LOW' ? '常數' : node.kind === 'CLOCK' ? '時脈' : node.kind === 'CUSTOM' ? '自訂方塊' : '輸出端'}>
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
        {canRotate(node.kind) && (
          <div>
            <div className="flex items-center gap-2">
              <span className="w-12 text-slate-400">方向</span>
              <div className="flex gap-1">
                {DIRECTIONS.map(([angle, word, arrow]) => (
                  <button
                    key={angle}
                    type="button"
                    aria-label={`輸出朝${word}`}
                    title={`輸出朝${word}`}
                    aria-pressed={(node.rotation ?? 0) === angle}
                    onClick={() => run(setRotation(diagram, node.id, angle), `${node.id} 輸出朝${word}`)}
                    className={`${btn} w-8 ${(node.rotation ?? 0) === angle ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
                  >
                    {arrow}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="w-12 text-slate-400">鏡射</span>
              <button
                type="button"
                aria-pressed={!!node.flip}
                onClick={() => run(setFlip(diagram, node.id, !node.flip), node.flip ? `${node.id} 取消鏡射` : `${node.id} 鏡射`)}
                className={`${btn} ${node.flip ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
              >
                左右鏡射
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">選取後按 R 順時針轉 90°、按 M 鏡射；放置前也可以先按 R / M。</p>
          </div>
        )}
        {(node.kind === 'INPUT' || node.kind === 'OUTPUT' || node.kind === 'DISPLAY' || node.kind === 'CLOCK') && <NameEditor node={node} />}
        {node.kind === 'CLOCK' && <SeqControls clockId={node.id} note="點「送一個脈衝」或畫布上時脈的按鈕：送出 0 → 1 → 0（上升緣、下降緣各一次）。" />}
        {node.kind === 'OUTPUT' && (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-12 text-slate-400">燈號</span>
              {([[false, '1 時亮'], [true, '0 時亮（低態致動）']] as const).map(([low, label]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={!!node.activeLow === low}
                  onClick={() => run(setActiveLow(diagram, node.id, low), low ? `${node.name} 改成低態致動` : `${node.name} 改成 1 時亮`)}
                  className={`${btn} ${!!node.activeLow === low ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400">低態致動：轉成麵包板時 LED 正極接 +5 V、負極經過電阻接到輸出，訊號 0 時亮（例如 74LS138 的 /Y0–/Y7）。真值表仍然寫訊號的 0 / 1。</p>
          </div>
        )}
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
        {node.kind === 'OUTPUT' && <OutputFormulas diagram={diagram} node={node} />}
        {node.kind === 'BLOCK' && <BlockValues diagram={diagram} node={node} />}
        {node.kind === 'CUSTOM' && <CustomBlockInspector diagram={diagram} node={node} />}
        {WRAPPABLE(node.kind) && <WrapForm diagram={diagram} />}
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
        <p className="text-xs leading-5 text-slate-400">拖曳其中一個可以整組移動；R 轉向、M 鏡射；Ctrl+C 複製、Ctrl+V 貼上；Del 刪除。</p>
        <button type="button" className={`${btn} bg-red-800 text-white hover:bg-red-700`} onClick={() => s.deleteSelection()}>
          刪除這 {selection.ids.length} 個
        </button>
        <WrapForm diagram={diagram} />
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
          {nodeLabel(from, diagram)} → {nodeLabel(to, diagram)}
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
      {inBlock ? (
        <p className="text-xs leading-5 text-emerald-200">現在在方塊裡：輸入端是方塊的輸入腳、輸出端是輸出腳（由上到下的順序）。要轉成麵包板請先按畫布上方的「回到上一層」。</p>
      ) : (
        <button type="button" className={`${btn} bg-emerald-600 text-white hover:bg-emerald-500`} onClick={openConvert}>
          轉成麵包板…
        </button>
      )}
    </Section>
  );
}

/** 子專案 65：可以包進方塊的元件。 */
const WRAPPABLE = (kind: LogicNode['kind']) => isGate(kind) || kind === 'BLOCK' || kind === 'CUSTOM' || kind === 'HIGH' || kind === 'LOW';

/** 子專案 65（規格 2026-11-14 custom-blocks 第 3 節）：選取的元件包成方塊。 */
function WrapForm({ diagram }: { diagram: LogicDiagram }) {
  const [name, setName] = useState(() => nextBlockName(diagram));
  const [error, setError] = useState<string | null>(null);
  const wrap = () => setError(useLogic.getState().wrapSelection(name.trim()));
  return (
    <div data-testid="wrap-block" className="space-y-1 rounded border border-emerald-800 bg-emerald-950/30 p-2">
      <div className="flex items-center gap-2">
        <input aria-label="方塊名稱" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && wrap()} className="w-24 rounded border border-slate-600 bg-slate-950 px-2 py-0.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none" />
        <button type="button" className={`${btn} bg-emerald-700 text-white hover:bg-emerald-600`} onClick={wrap}>
          包成方塊
        </button>
      </div>
      <p className="text-xs text-slate-400">穿過框的線變成方塊的腳；之後從左邊「自訂方塊」可以再放好幾個，點兩下方塊進去改。</p>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}

/** 子專案 65（規格第 4 節）：自訂方塊：名稱、腳、打開。 */
function CustomBlockInspector({ diagram, node }: { diagram: LogicDiagram; node: LogicNode }) {
  const b = blockOf(diagram, node.block);
  const [name, setName] = useState(b?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setName(b?.name ?? ''), [b?.name]);
  if (!b) return <p className="text-xs text-red-300">找不到這個方塊的定義</p>;
  const pins = blockPins(b);
  const uses = diagram.nodes.filter((n) => n.kind === 'CUSTOM' && n.block === b.id).length;
  const rename = () => {
    if (name.trim() === b.name) return;
    const r = renameBlock(diagram, b.id, name);
    if (!r.ok) setError(r.reason);
    else {
      setError(null);
      useLogic.getState().apply(r, `方塊改名 ${name.trim()}`);
    }
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="w-12 text-slate-400">名稱</span>
        <input aria-label="自訂方塊名稱" value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} onKeyDown={(e) => e.key === 'Enter' && rename()} className="w-24 rounded border border-slate-600 bg-slate-950 px-2 py-0.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none" />
      </div>
      <p className="text-xs text-slate-300">
        輸入 {pins.inputs.map((n) => n.name).join('、') || '沒有'} → 輸出 {pins.outputs.map((n) => n.name).join('、') || '沒有'}（這張圖用了 {uses} 個）
      </p>
      <button type="button" className={`${btn} bg-emerald-700 text-white hover:bg-emerald-600`} onClick={() => useLogic.getState().enterBlock(node.id)}>
        打開方塊（點兩下也可以）
      </button>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}

/** 規格（2026-10-13 seven-seg）第 5 節：顯示器目前的值與 D C B A 四條線。 */
function DisplayValue({ diagram, node }: { diagram: LogicDiagram; node: LogicNode }) {
  const seq = useLogic((l) => l.seq);
  const values = useMemo(() => evaluate(diagram, {}, seq), [diagram, seq]);
  const s = useLogic.getState();
  // 子專案 32：BCD（A–D 與 DP）或每段直接控制（a–g、dp）。
  const modes = (
    <div className="flex items-center gap-2">
      <span className="w-12 text-slate-400">輸入</span>
      {([[false, 'BCD（A–D）'], [true, '每段直接控制']] as const).map(([segments, label]) => (
        <button
          key={label}
          type="button"
          aria-pressed={!!node.segments === segments}
          onClick={() => {
            const r = setDisplayMode(diagram, node.id, segments);
            if (!r.ok) useStore.getState().toast('warning', r.reason);
            else s.apply(r, segments ? `${node.name} 改成每段直接控制` : `${node.name} 改成 BCD`);
          }}
          className={`${btn} ${!!node.segments === segments ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
  if (node.segments) {
    const lit = values.segs.get(node.id) ?? 'X';
    return (
      <div className="space-y-2">
        {modes}
        <p data-testid="display-value" className="text-slate-300">
          {lit === 'X' ? '有不確定的輸入' : lit.length === 0 ? '目前每一段都不亮' : `目前亮的段：${segmentToken(lit)}`}
          <span className="block text-xs text-slate-400">每隻腳直接控制一段：1 就亮。沒接的段不亮。切換時會拿掉接到這個顯示器的線。</span>
        </p>
      </div>
    );
  }
  const v = values.displays.get(node.id) ?? 'X';
  const dot = values.dps.get(node.id) === 1;
  const driver = new Map(diagram.wires.map((w) => [`${w.to.node}#${w.to.pin}`, w.from]));
  const bits = [3, 2, 1, 0].map((pin) => {
    const from = driver.get(`${node.id}#${pin}`);
    return bitText(from === undefined ? 'X' : (values.nodes.get(from) ?? 'X'));
  });
  return (
    <div className="space-y-2">
      {modes}
      <p data-testid="display-value" className="text-slate-300">
        {v === 'X' ? '有沒接好或不確定的輸入，顯示「–」' : `目前顯示 ${v}${dot ? '.' : ''}`}（輸入 D C B A = {bits.join(' ')}）
        {typeof v === 'number' && v > 9 && <span className="block text-xs text-slate-400">10–15 不是 BCD 數字，74LS47 會亮出特殊的圖形。</span>}
        <span className="block text-xs text-slate-400">DP 腳（B 和 C 中間）接 1 時點亮小數點，可以不接。</span>
      </p>
    </div>
  );
}

/** 子專案 46：送一個脈衝、重設（正反器、計數器回到 0）。子專案 64：好幾個時脈時每個時脈一個按鈕（clockId 指定時只有那一個）。 */
function SeqControls({ note, clockId }: { note?: string; clockId?: string }) {
  const diagram = useLogic((l) => l.diagram);
  const all = useMemo(() => clockNodes(diagram), [diagram]);
  const clocks = clockId ? all.filter((n) => n.id === clockId) : all;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {clocks.length === 0 && (
          <button type="button" disabled className={`${btn} bg-violet-700 text-white`}>
            送一個脈衝
          </button>
        )}
        {clocks.map((n) => (
          <button key={n.id} type="button" className={`${btn} bg-violet-700 text-white hover:bg-violet-600`} onClick={() => useLogic.getState().pulse(n.id)}>
            {all.length > 1 ? `送一個脈衝（${n.name}）` : '送一個脈衝'}
          </button>
        ))}
        <button type="button" className={`${btn} bg-slate-800 text-slate-200 hover:bg-slate-700`} onClick={() => useLogic.getState().resetSeq()}>
          重設（正反器、計數器回到 0）
        </button>
      </div>
      {note && <p className="text-xs text-slate-400">{note}</p>}
    </div>
  );
}

/** 子專案 46：時序方塊沒接的腳（用預設的值）。 */
function unconnectedDefaults(diagram: LogicDiagram, node: LogicNode): string {
  if (!node.chip) return '';
  const names = BLOCK_PINS[node.chip].inputs;
  const wired = new Set(diagram.wires.filter((w) => w.to.node === node.id).map((w) => names[w.to.pin]));
  return Object.entries(BLOCK_DEFAULTS[node.chip] ?? {})
    .filter(([name]) => !wired.has(name))
    .map(([name, v]) => `${name} = ${v}`)
    .join('、');
}

/** 子專案 21：方塊每個輸出腳目前的值。 */
function BlockValues({ diagram, node }: { diagram: LogicDiagram; node: LogicNode }) {
  const seq = useLogic((l) => l.seq);
  const values = useMemo(() => evaluate(diagram, {}, seq), [diagram, seq]);
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
      {isSequentialChip(node.chip) ? (
        <div className="mt-2 space-y-1">
          <SeqControls />
          <p className="text-slate-400">沒接的腳：{unconnectedDefaults(diagram, node) || '沒有'}（轉成麵包板時接到 +5 V 或 GND）。</p>
        </div>
      ) : (
        <p className="mt-1 text-slate-400">要在真值表看結果，把輸出接到輸出端或 7 段顯示器。</p>
      )}
    </div>
  );
}

/** 子專案 40：一個輸出的兩種布林式（照圖寫出來、化簡後）。 */
function FormulaLines({ f }: { f: OutputFormula }) {
  return (
    <div data-formula={f.name} className="space-y-0.5 font-mono text-sm">
      <div data-read={f.read ?? ''} className={f.read === null ? 'text-xs text-slate-400' : 'text-slate-100'}>
        <span className="text-amber-300">{f.name}</span> = {f.read ?? f.readProblem}
      </div>
      <div data-simplified={f.simplified ?? ''} className={f.simplified === null ? 'text-xs text-slate-400' : 'text-emerald-200'}>
        <span className="font-sans text-xs text-slate-400">化簡：</span>
        {f.simplified ?? f.simplifiedProblem}
      </div>
    </div>
  );
}

/** 子專案 40（規格 2026-10-23 diagram-formulas）：真值表分頁下面的「布林式」區。 */
function Formulas({ diagram }: { diagram: LogicDiagram }) {
  const formulas = useMemo(() => diagramFormulas(diagram), [diagram]);
  const show = useLogic((s) => s.showFormulas);
  if (formulas.outputs.length === 0 && !formulas.displays) return null;
  return (
    <div data-testid="formulas" className="mt-3 rounded border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs leading-5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-200">布林式</span>
        <label className="flex cursor-pointer items-center gap-1 text-slate-300">
          <input type="checkbox" checked={show} onChange={(e) => useLogic.getState().setShowFormulas(e.target.checked)} />
          在圖上顯示
        </label>
      </div>
      <div className="mt-1 space-y-2">
        {formulas.outputs.map((f) => (
          <FormulaLines key={f.id} f={f} />
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        第一行照著閘寫出來（不化簡），第二行是從真值表化簡的結果。寫法和「輸入布林式」一樣：' 是反相、連寫是 AND、+ 是 OR、⊕ 是 XOR。
        {formulas.displays && ' 7 段顯示器不列布林式。'}
      </p>
    </div>
  );
}

/** 子專案 40：選取輸出端時列出它的布林式。 */
function OutputFormulas({ diagram, node }: { diagram: LogicDiagram; node: LogicNode }) {
  const f = useMemo(() => diagramFormulas(diagram).outputs.find((o) => o.id === node.id), [diagram, node.id]);
  if (!f) return null;
  return (
    <div data-testid="output-formula" className="space-y-1">
      <div className="text-slate-400">布林式</div>
      <FormulaLines f={f} />
    </div>
  );
}

/** 子專案 64（規格 2026-11-14 multiple-clocks 第 2 節）：好幾個時脈時選送哪一個，或寫自訂順序。 */
function ClockOrder({ clocks }: { clocks: string[] }) {
  const text = useLogic((l) => l.clockOrder);
  const set = (t: string) => useLogic.getState().setClockOrder(t);
  const single = clocks.find((c) => text === c) ?? (text === '' ? clocks[0] : null);
  return (
    <div data-testid="clock-order" className="mb-2 space-y-1 text-xs text-slate-300">
      <div className="flex flex-wrap items-center gap-1">
        <span>每次送</span>
        {clocks.map((c) => (
          <button key={c} type="button" aria-pressed={single === c} onClick={() => set(c === clocks[0] ? '' : c)} className={`${btn} ${single === c ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>
            {c}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1">
        <span className="shrink-0">自訂順序</span>
        <input
          aria-label="送時脈的順序"
          value={single ? '' : text}
          placeholder={`例如 ${clocks[0]} ${clocks[0]} ${clocks[1]}（照順序一直重複）`}
          onChange={(e) => set(e.target.value)}
          className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-0.5 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
        />
      </label>
    </div>
  );
}

/** 子專案 46（規格 2026-10-24 sequential-logic 第 4 節）：時序電路的時序表（從重設開始，第 0 到第 n 次脈衝）。 */
function SequenceTab({ diagram }: { diagram: LogicDiagram }) {
  const pulses = useLogic((l) => l.pulses);
  const view = useLogic((l) => l.seqView);
  const orderText = useLogic((l) => l.clockOrder);
  const table = useMemo(() => sequenceTable(diagram, pulses, {}, 0, parseClockOrder(orderText)), [diagram, pulses, orderText]);
  const clocks = useMemo(() => clockNodes(diagram).map((n) => n.name ?? n.id), [diagram]);
  /** 顯示器的欄（數字）用另一個顏色。 */
  const kinds = useMemo(() => sortedIo(diagram).outputs.map((o) => o.kind === 'DISPLAY'), [diagram]);
  if (!table.ok && table.reason === 'bad-order')
    return (
      <div className="space-y-2 p-3">
        <ClockOrder clocks={clocks} />
        <p className="text-sm text-amber-200">沒有叫 {table.unknown.join('、')} 的時脈（圖上的時脈：{clocks.join('、')}）。</p>
      </div>
    );
  if (!table.ok) {
    const text =
      table.reason === 'no-clock'
          ? '放一個時脈（元件庫的「時脈」），接到正反器或計數器的 CLK，就會列出每次脈衝後的輸出'
          : '先放輸出端或 7 段顯示器';
    return (
      <div className="space-y-2 p-3">
        <p className="text-sm text-slate-300">{text}</p>
        <SeqControls />
      </div>
    );
  }
  const multi = table.clocks.length > 1;
  return (
    <div className="p-3">
      {/* 子專案 50：表格 / 波形切換。 */}
      <div className="mb-2 flex gap-1">
        {(['table', 'wave'] as const).map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => useLogic.getState().setSeqView(v)} className={`${btn} ${view === v ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>
            {v === 'table' ? '表格' : '波形'}
          </button>
        ))}
      </div>
      <div className="mb-2 flex items-center gap-2 text-xs text-slate-300">
        <span>列到第</span>
        {PULSE_CHOICES.map((n) => (
          <button key={n} type="button" aria-pressed={pulses === n} onClick={() => useLogic.getState().setPulses(n)} className={`${btn} ${pulses === n ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>
            {n}
          </button>
        ))}
        <span>次脈衝</span>
      </div>
      {clocks.length > 1 && <ClockOrder clocks={clocks} />}
      {view === 'wave' ? (
        <Waveform table={table} />
      ) : (
      <table data-testid="sequence-table" className="w-full border-collapse text-center font-mono text-sm">
        <thead>
          <tr className="text-slate-300">
            <th className="border-b border-slate-700 px-1 py-1 font-sans text-xs">{multi ? '第幾次' : `${table.clock} 第幾次`}</th>
            {multi && <th className="border-b border-slate-700 px-1 py-1 font-sans text-xs">時脈</th>}
            {table.outputs.map((n, i) => (
              <th key={n} className={`border-b border-slate-700 px-1 py-1 text-amber-300 ${i === 0 ? 'border-l' : ''}`}>
                {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r) => (
            <tr key={r.pulse} data-pulse={r.pulse}>
              <td className="px-1 py-0.5 text-slate-400">{r.pulse}</td>
              {multi && <td className="px-1 py-0.5 text-violet-300">{r.clock ?? '–'}</td>}
              {r.out.map((b, i) => (
                <td key={i} className={`px-1 py-0.5 font-bold ${outTone(b, kinds[i])} ${i === 0 ? 'border-l border-slate-700' : ''}`}>
                  {bitText(b)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      )}
      <p className="mt-2 text-xs text-slate-400">
        從重設（正反器、計數器都是 0）開始，其他輸入用目前開關的值；{view === 'wave' ? '每格是那次脈衝之後的值，第 0 格是還沒有脈衝時。' : '第 0 列是還沒有脈衝時。'}
      </p>
      <div className="mt-2">
        <SeqControls />
      </div>
    </div>
  );
}

function TruthTableTab({ diagram }: { diagram: LogicDiagram }) {
  const table = useMemo(() => truthTable(diagram), [diagram]);
  if (!table.ok && table.reason === 'sequential') return <SequenceTab diagram={diagram} />;
  if (!table.ok) {
    const text =
      table.reason === 'too-many'
        ? `輸入超過 ${MAX_TABLE_INPUTS} 個，真值表太長（${1 << MAX_TABLE_INPUTS} 列以上），請用模擬檢查`
        : '先放輸入端和輸出端';
    return (
      <div className="p-3">
        <p className="text-sm text-slate-300">{text}</p>
        <Formulas diagram={diagram} />
      </div>
    );
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
      {table.feedback && <p className="mt-1 text-xs text-slate-400">有迴授（閘接回前面）：「保持」是跟之前的狀態有關（維持原來的值），「不穩定」是一直來回跳、停不下來（例如 T 閂鎖 T = CP = 1 時的競跑）。</p>}
      <Formulas diagram={diagram} />
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
    const { w, h } = boxOf(node);
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

/** 規格第 5 節：邏輯圖時的右側面板（屬性、真值表、題目（子專案 24）、檢查）。 */
export function LogicPanel() {
  const diagram = useLogic((s) => s.diagram);
  const tab = useLogic((s) => s.tab);
  const open = useStore((s) => s.drawer === 'info');
  const problems = useMemo(() => checkDiagram(diagram), [diagram]);
  // 子專案 46：時序電路的「真值表」分頁改名為「時序表」。
  const sequentialTab = useMemo(() => isSequential(diagram), [diagram]);
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
            {id === 'table' && sequentialTab ? '時序表' : label}
            {id === 'check' && problems.length > 0 && (
              <span className={`ml-1.5 rounded-full px-1.5 text-[10px] ${problems.some((p) => p.severity === 'error') ? 'bg-red-600 text-white' : 'bg-amber-500 text-black'}`}>{problems.length}</span>
            )}
          </button>
        ))}
      </div>
      <div className="bbl-scroll min-h-0 flex-1 overflow-y-auto">
        {tab === 'inspect' && <Inspector diagram={diagram} />}
        {tab === 'table' && <TruthTableTab diagram={diagram} />}
        {tab === 'task' && <TaskTab diagram={diagram} />}
        {tab === 'check' && <CheckTab diagram={diagram} />}
      </div>
    </aside>
  );
}
