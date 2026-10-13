import { useMemo, type ReactNode } from 'react';
import { getBoard, getLayout } from '../../core/breadboard/registry';
import { resolveFootprint, effectiveSpan } from '../../core/circuit/footprint';
import { getComponentDefinition, RESISTOR_PRESETS } from '../../core/circuit/library';
import { netColor } from '../../core/routing/colors';
import { analyzeCircuit, netOfPin, type CircuitAnalysis } from '../../editor/analysis';
import { boardRect, crossBoardWires, groupMembers, MAX_BOARDS } from '../../editor/boards';
import { checklistProgress, checklistRows, type ChecklistRow } from '../../editor/checklist';
import { CAPACITOR_PRESETS, formatCapacitance, formatResistance, LED_COLOR_NAMES, LED_COLORS } from '../../editor/library';
import { WIRE_COLORS } from '../../editor/manualWire';
import { appliedMoves, deriveMode, isComparisonFresh, useStore, type RightTab, type Selection } from '../../state/store';
import type { Circuit, CircuitError, Net } from '../../types/circuit';
import type { LedColor } from '../../types/component';
import { groupIdAt } from '../../editor/analysis';
import { LEVEL_COLORS } from '../../render/theme';
import type { Level } from '../../types/logic';
import { boardGroupText, LevelTag } from '../Breadboard/CanvasHud';
import {
  describeMove,
  FAILURE_NAMES,
  groupLabel,
  groupOf,
  holeContents,
  holeLabel,
  issuesAtPoint,
  issuesOfComponent,
  issuesOfWire,
  pinLabel,
  ROLE_NAMES,
  wireSummary,
} from '../common/describe';
import { sortedIo } from '../../logic/evaluate';
import { verifyBreadboard, verifyText } from '../../logic/verifyBreadboard';
import { useLogic } from '../../state/logic';
import { ExplanationCard } from './ExplanationCard';
import { NoteInspector } from './NoteInspector';
import { PinoutDiagram } from './PinoutDiagram';
import { RoutingSummaryCard } from './RoutingSummaryCard';
import { WireExplanationCard } from './WireExplanationCard';

const CLOCK_FREQUENCIES = [0.5, 1, 2, 5, 10];

/** 名稱輸入框：Enter 或離開時存（子專案 14）。 */
function LabelInput({ value, ariaLabel, placeholder, onCommit }: { value: string; ariaLabel: string; placeholder?: string; onCommit: (text: string) => void }) {
  return (
    <input
      defaultValue={value}
      aria-label={ariaLabel}
      placeholder={placeholder}
      maxLength={8}
      onBlur={(e) => e.currentTarget.value.trim() !== value && onCommit(e.currentTarget.value)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className="w-full min-w-0 rounded border border-slate-600 bg-slate-950 px-1.5 py-0.5 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
    />
  );
}

function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-b border-slate-800 px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-0.5 text-sm">
      <span className="shrink-0 text-slate-400">{label}</span>
      <span className="min-w-0 text-right text-slate-100">{children}</span>
    </div>
  );
}

function SmallButton({ children, onClick, danger, title }: { children: ReactNode; onClick: () => void; danger?: boolean; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs ${danger ? 'bg-red-900/70 text-red-100 hover:bg-red-800' : 'bg-slate-700 text-slate-100 hover:bg-slate-600'}`}
    >
      {children}
    </button>
  );
}

function IssueList({ issues }: { issues: CircuitError[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="mt-2 space-y-1">
      {issues.map((e, i) => (
        <div key={i} className={`rounded px-2 py-1 text-xs ${e.severity === 'error' ? 'bg-red-950/70 text-red-200' : 'bg-amber-950/70 text-amber-200'}`}>
          {e.message}
        </div>
      ))}
    </div>
  );
}

function LevelDot({ level }: { level: Level | undefined }) {
  if (level === undefined) return null;
  return <span className="inline-block h-2.5 w-2.5 rounded-full" title={String(level)} style={{ background: LEVEL_COLORS[String(level)] }} />;
}

/** 模擬中某個導通群組的電位（沒有模擬時為 undefined）。 */
function useGroupLevel(groupId: string | null | undefined): Level | undefined {
  return useStore((s) => (s.simulation && groupId ? (s.simulation.result.groupLevels[groupId] ?? 'Z') : undefined));
}

/** 模擬中顯示某個導通群組電位的一列（獨立元件，避免在條件分支裡呼叫 hook）。 */
function LevelRow({ groupId }: { groupId: string | null }) {
  const level = useGroupLevel(groupId);
  if (level === undefined) return null;
  return (
    <Row label="電位（模擬）">
      <LevelTag level={level} />
    </Row>
  );
}

function NetChip({ net, index }: { net: Net; index: number }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-slate-500" style={{ background: netColor(net.kind, index) }} />;
}

function signalIndex(analysis: CircuitAnalysis, net: Net): number {
  return analysis.nets.filter((n) => n.kind === 'signal').indexOf(net);
}

function NetLink({ net, analysis }: { net: Net | undefined; analysis: CircuitAnalysis }) {
  if (!net) return <span className="text-slate-500">—</span>;
  return (
    <button type="button" className="inline-flex items-center gap-1.5 text-sky-300 hover:underline" onClick={() => useStore.getState().select({ kind: 'net', netId: net.id })}>
      <NetChip net={net} index={signalIndex(analysis, net)} />
      {net.name}
    </button>
  );
}

function CircuitSummary({ circuit, analysis }: { circuit: Circuit; analysis: CircuitAnalysis }) {
  const projectName = useStore((s) => s.projectName);
  const mode = useStore((s) => deriveMode(s));
  return (
    <>
      <Section title="電路">
        <Row label="名稱">{projectName ?? '未命名電路'}</Row>
        <Row label="麵包板">
          <span className="inline-flex items-center gap-2">
            {circuit.boards.length} 塊
            {circuit.boards.length < MAX_BOARDS && (
              <SmallButton onClick={() => useStore.getState().addBoard()} title="新增一塊 MB-102 麵包板">
                ＋ 新增
              </SmallButton>
            )}
          </span>
        </Row>
        <Row label="元件">{circuit.components.length}</Row>
        <Row label="導線">{circuit.wires.length}</Row>
        <Row label="Electrical Nets">{analysis.nets.filter((n) => n.pins.length > 1).length}</Row>
        <Row label="Routing Score">{analysis.routing.score}</Row>
        <Row label="模式">{mode === 'auto' ? 'AUTO ROUTE（AI 標準佈線）' : mode === 'compare' ? 'COMPARE' : 'MANUAL（手動接線）'}</Row>
      </Section>
      <Section title="操作提示">
        <ul className="list-disc space-y-1 pl-4 text-xs leading-5 text-slate-300">
          <li>從左側拖曳元件到麵包板，放置時自動吸附到合法孔位。</li>
          <li>從空孔拖曳到另一個空孔建立導線；滑鼠停在孔上會高亮整個導通群組。</li>
          <li>點元件腳或導線，會高亮整個 Net。</li>
          <li>電路太大時可以新增麵包板；拖曳板子沒有孔的地方，靠近另一塊板的邊會自動吸附並組成群組，同一群組可以跨板接線。</li>
          <li>
            <kbd className="rounded bg-slate-700 px-1">R</kbd> 旋轉、<kbd className="rounded bg-slate-700 px-1">Del</kbd> 刪除、
            <kbd className="rounded bg-slate-700 px-1">Ctrl+Z</kbd> 復原、滾輪縮放、Space + 拖曳平移。
          </li>
        </ul>
      </Section>
    </>
  );
}

function ComponentInspector({ id, circuit, analysis }: { id: string; circuit: Circuit; analysis: CircuitAnalysis }) {
  const sim = useStore((s) => s.simulation?.result ?? null);
  const instance = circuit.components.find((c) => c.id === id);
  const def = instance ? getComponentDefinition(instance.defId) : undefined;
  if (!instance || !def) return null;
  const store = useStore.getState();
  const fp = resolveFootprint(instance, def);
  const pin1 = fp.pins.find((p) => p.pinNumber === 1)!;
  const span = effectiveSpan(instance, def);
  const props = { ...def.defaultProps, ...instance.props };
  const select = 'rounded border border-slate-600 bg-slate-950 px-1.5 py-0.5 text-sm text-slate-100';
  return (
    <>
      <Section
        title="元件"
        right={
          <div className="flex gap-1">
            <SmallButton onClick={() => store.rotateComponent(id)} title="旋轉 90°（R）">
              ⟳ 旋轉
            </SmallButton>
            <SmallButton onClick={() => store.deleteComponent(id)} danger title="刪除（Del）">
              刪除
            </SmallButton>
          </div>
        }
      >
        <div className="text-base font-semibold text-slate-50">
          {instance.id} <span className="text-slate-300">· {def.name}</span>
        </div>
        {def.description && <p className="mb-2 text-xs text-slate-400">{def.description}</p>}
        <Row label="腳 1 位置">{holeLabel(circuit, pin1.point)}</Row>
        <Row label="旋轉">{instance.rotation}°</Row>
        {def.category === 'resistor' && (
          <Row label="阻值">
            <select
              className={select}
              value={props.resistance}
              onChange={(e) => store.updateProps(id, { resistance: Number(e.target.value) })}
              aria-label="阻值"
            >
              {RESISTOR_PRESETS.map((r) => (
                <option key={r} value={r}>
                  {formatResistance(r)}
                </option>
              ))}
            </select>
          </Row>
        )}
        {def.category === 'led' && (
          <Row label="顏色">
            <select className={select} value={props.color} onChange={(e) => store.updateProps(id, { color: e.target.value as LedColor })} aria-label="LED 顏色">
              {LED_COLORS.map((c) => (
                <option key={c} value={c}>
                  {LED_COLOR_NAMES[c]}色
                </option>
              ))}
            </select>
          </Row>
        )}
        {def.package.type === 'two-lead' && (
          <Row label="兩腳間距">
            <span className="inline-flex items-center gap-1">
              <SmallButton onClick={() => store.setSpan(id, span - 1)} title="縮短">
                −
              </SmallButton>
              <span className="w-10 text-center tabular-nums">{span} 孔</span>
              <SmallButton onClick={() => store.setSpan(id, span + 1)} title="加長">
                +
              </SmallButton>
            </span>
          </Row>
        )}
        {(def.category === 'vcc' || def.category === 'dc-power') && <Row label="電壓">{props.voltage ?? 5} V</Row>}
        {(def.category === 'clock' || def.logic?.model === 'timer555') && (
          <Row label="頻率">
            <select className={select} value={props.frequency ?? 1} onChange={(e) => store.updateProps(id, { frequency: Number(e.target.value) })} aria-label="時脈頻率">
              {CLOCK_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f} Hz
                </option>
              ))}
            </select>
          </Row>
        )}
        {def.logic?.model === 'timer555' && (
          <p className="mt-1 text-xs leading-5 text-slate-400">
            實際頻率由外接元件決定：f ≈ 1.44 ÷ ((R1 + 2 × R2) × C)。例：R1 = 1 kΩ、R2 = 68 kΩ、C = 10 µF → 約 1 Hz。
          </p>
        )}
        {def.category === 'capacitor' && (
          <Row label="容量">
            <select className={select} value={props.capacitance} onChange={(e) => store.updateProps(id, { capacitance: Number(e.target.value) })} aria-label="電容量">
              {CAPACITOR_PRESETS.filter((p) => p.defId === def.id).map((p) => (
                <option key={p.farads} value={p.farads}>
                  {formatCapacitance(p.farads)}
                </option>
              ))}
            </select>
          </Row>
        )}
        {(def.category === 'led' || def.category === 'seven-seg') && (
          <Row label="名稱">
            <LabelInput key={`${id}-0-${props.labels?.[0] ?? ''}`} value={props.labels?.[0] ?? ''} ariaLabel={def.category === 'led' ? 'LED 名稱' : '顯示器名稱'} onCommit={(text) => store.setLabel(id, 0, text)} />
          </Row>
        )}
        {def.category === 'dip-switch' && (
          <div className="mt-2">
            <div className="mb-1 text-xs text-slate-400">每個開關的名稱（例如 A、B、Cin；最多 8 個字）</div>
            <div className="grid grid-cols-4 gap-1">
              {(props.switchStates ?? []).map((_, k) => (
                <LabelInput key={`${id}-${k}-${props.labels?.[k] ?? ''}`} value={props.labels?.[k] ?? ''} ariaLabel={`開關 ${k + 1} 名稱`} placeholder={String(k + 1)} onCommit={(text) => store.setLabel(id, k, text)} />
              ))}
            </div>
          </div>
        )}
        {def.category === 'dip-switch' && (
          <div className="mt-2">
            <div className="mb-1 text-xs text-slate-400">開關狀態（只影響之後的邏輯模擬，不影響佈線）</div>
            <div className="flex flex-wrap gap-1">
              {(props.switchStates ?? []).map((on, k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => store.toggleSwitch(id, k)}
                  className={`w-9 rounded px-1 py-0.5 text-xs ${on ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-slate-300'}`}
                >
                  {k + 1} {on ? 'ON' : 'OFF'}
                </button>
              ))}
            </div>
          </div>
        )}
        <IssueList issues={issuesOfComponent(analysis, id)} />
      </Section>
      <Section title={`腳位（${def.pins.length}）`}>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="text-left font-normal">#</th>
              <th className="text-left font-normal">名稱</th>
              <th className="text-left font-normal">功能</th>
              <th className="text-left font-normal">孔</th>
              <th className="text-left font-normal">Net</th>
              {sim && <th className="text-left font-normal">電位</th>}
            </tr>
          </thead>
          <tbody>
            {def.pins.map((pin) => {
              const at = fp.pins.find((p) => p.pinNumber === pin.number)!.point;
              const net = netOfPin(analysis, { componentId: id, pinNumber: pin.number });
              return (
                <tr
                  key={pin.number}
                  className="cursor-pointer hover:bg-slate-800"
                  onClick={() => store.select({ kind: 'pin', componentId: id, pinNumber: pin.number })}
                >
                  <td className="py-0.5 tabular-nums text-slate-400">{pin.number}</td>
                  <td className="py-0.5 text-slate-100">{pin.name}</td>
                  <td className="py-0.5 text-slate-400">{ROLE_NAMES[pin.role]}</td>
                  <td className="py-0.5 text-slate-300">{holeLabel(circuit, at)}</td>
                  <td className="py-0.5 text-slate-300">{net && net.pins.length > 1 ? net.name : <span className="text-slate-600">—</span>}</td>
                  {sim && (
                    <td className="py-0.5">
                      <LevelDot level={sim.pinLevels[`${id}#${pin.number}`] ?? 'Z'} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
    </>
  );
}

function BoardInspector({ id, circuit }: { id: string; circuit: Circuit }) {
  const instance = circuit.boards.find((b) => b.id === id);
  if (!instance) return null;
  const store = useStore.getState();
  const rect = boardRect(instance);
  const grouped = groupMembers(circuit, id).length > 1;
  const crossing = crossBoardWires(circuit, [id]);
  const parts = circuit.components.filter((c) => c.boardId === id).length;
  const wires = circuit.wires.filter((w) => w.path.some((p) => p.boardId === id)).length;
  const last = circuit.boards.length <= 1;
  const layout = getLayout(instance.layoutId);
  const holeNodes = getBoard(instance.layoutId, instance.id).nodes.filter((n) => n.kind === 'hole');
  const posts = holeNodes.filter((n) => n.groupId?.includes(':post-')).length;
  const holes = holeNodes.length - posts;
  return (
    <Section
      title="麵包板"
      right={
        <div className="flex gap-1">
          {grouped && (
            <SmallButton onClick={() => store.detachBoard(id)} title="把這塊板移到旁邊，離開目前的群組">
              移出群組
            </SmallButton>
          )}
          {!last && (
            <SmallButton onClick={() => store.removeBoard(id)} danger title="刪除這塊板（連同板上的元件與導線，可 Undo）">
              刪除麵包板
            </SmallButton>
          )}
        </div>
      }
    >
      <div className="text-base font-semibold text-slate-50">
        {id} <span className="text-slate-300">· {layout.name}（{holes} 孔{posts > 0 ? `、${posts} 支接線柱` : ''}）</span>
      </div>
      <Row label="位置（格）">{`x ${rect.x} · y ${rect.y}`}</Row>
      <Row label="大小（格）">{`${rect.width} × ${rect.height}`}</Row>
      <Row label="所屬群組">{boardGroupText(circuit, id) ?? '—（單獨一塊）'}</Row>
      <Row label="元件">{parts}</Row>
      <Row label="導線">{wires}</Row>
      {crossing.length > 0 && <Row label="跨板導線">{crossing.map((w) => w.id).join('、')}</Row>}
      <p className="mt-2 text-xs leading-5 text-slate-400">
        貼在一起的麵包板只是放在同一個群組，孔與孔之間<b className="text-slate-300">不會自動導通</b>，要用導線連接才會形成同一個 Net。
        {circuit.boards.length > 1 && ' 拖曳板子沒有孔的地方可以移動整個群組；按住 Alt 或 Shift 拖曳只移動這一塊。'}
      </p>
    </Section>
  );
}

function NetInspector({ net, circuit, analysis }: { net: Net; circuit: Circuit; analysis: CircuitAnalysis }) {
  const wires = circuit.wires.filter((w) => analysis.netByWire.get(w.id) === net);
  const store = useStore.getState();
  const level = useGroupLevel(net.groupIds[0]);
  return (
    <Section title="Electrical Net">
      <div className="mb-1 flex items-center gap-2 text-base font-semibold text-slate-50">
        <NetChip net={net} index={signalIndex(analysis, net)} />
        {net.name}
        <span className="text-xs font-normal text-slate-400">{net.kind === 'power' ? '電源' : net.kind === 'ground' ? '接地' : '訊號'}</span>
      </div>
      {level !== undefined && (
        <Row label="電位（模擬）">
          <LevelTag level={level} />
        </Row>
      )}
      <Row label="導通群組">{net.groupIds.length}</Row>
      <Row label="導線">{wires.length}</Row>
      <div className="mt-2 text-xs text-slate-400">連接的腳位（{net.pins.length}）</div>
      <ul className="mt-1 space-y-0.5 text-sm">
        {net.pins.map((ref) => (
          <li key={`${ref.componentId}#${ref.pinNumber}`}>
            <button type="button" className="text-sky-300 hover:underline" onClick={() => store.select({ kind: 'pin', ...ref })}>
              {pinLabel(circuit, ref.componentId, ref.pinNumber)}
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Inspector({ selection, circuit, analysis }: { selection: Selection; circuit: Circuit; analysis: CircuitAnalysis }) {
  const store = useStore.getState();
  if (!selection)
    return (
      <>
        <RoutingSummaryCard circuit={circuit} />
        <CircuitSummary circuit={circuit} analysis={analysis} />
      </>
    );
  switch (selection.kind) {
    case 'component': {
      const c = circuit.components.find((x) => x.id === selection.id);
      const def = c ? getComponentDefinition(c.defId) : undefined;
      return (
        <>
          {c && def && <PinoutDiagram instance={c} def={def} selectedPin={null} />}
          <ComponentInspector id={selection.id} circuit={circuit} analysis={analysis} />
        </>
      );
    }
    case 'pin': {
      const c = circuit.components.find((x) => x.id === selection.componentId);
      const def = c ? getComponentDefinition(c.defId) : undefined;
      const pin = def?.pins.find((p) => p.number === selection.pinNumber);
      const at = c && def ? resolveFootprint(c, def).pins.find((p) => p.pinNumber === selection.pinNumber)?.point : undefined;
      const net = netOfPin(analysis, selection);
      return (
        <>
          {c && def && <PinoutDiagram instance={c} def={def} selectedPin={selection.pinNumber} />}
          <Section title="腳位">
            <div className="text-base font-semibold text-slate-50">
              {selection.componentId} 腳 {selection.pinNumber} <span className="text-slate-300">· {pin?.name}</span>
            </div>
            <Row label="元件">
              <button type="button" className="text-sky-300 hover:underline" onClick={() => store.select({ kind: 'component', id: selection.componentId })}>
                {selection.componentId} {def?.name}
              </button>
            </Row>
            {pin && <Row label="功能">{ROLE_NAMES[pin.role]}</Row>}
            {at && <Row label="孔位">{holeLabel(circuit, at)}</Row>}
            {at && <Row label="導通群組">{groupLabel(groupOf(circuit, at), circuit.boards.length > 1)}</Row>}
            {at && <LevelRow groupId={groupOf(circuit, at)} />}
            <Row label="Net">
              <NetLink net={net} analysis={analysis} />
            </Row>
          </Section>
          {net && <NetInspector net={net} circuit={circuit} analysis={analysis} />}
        </>
      );
    }
    case 'wire': {
      const w = circuit.wires.find((x) => x.id === selection.id);
      if (!w) return null;
      return (
        <Section
          title="導線"
          right={
            <SmallButton onClick={() => store.deleteWire(w.id)} danger title="刪除（Del）">
              刪除
            </SmallButton>
          }
        >
          <div className="text-base font-semibold text-slate-50">{w.id}</div>
          <Row label="來源">{w.source === 'auto' ? 'AI 標準佈線' : '手動接線'}</Row>
          <Row label="起點 → 終點">{`${holeLabel(circuit, w.start)} → ${holeLabel(circuit, w.end)}`}</Row>
          <Row label="長度">{wireSummary(w, circuit)}</Row>
          <LevelRow groupId={groupIdAt(circuit, w.start)} />
          <Row label="Net">
            <NetLink net={analysis.netByWire.get(w.id)} analysis={analysis} />
          </Row>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {WIRE_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                title={`${c.name}色`}
                onClick={() => store.setWireColors([w.id], c.value)}
                className={`h-5 w-5 rounded-full border ${w.color === c.value ? 'border-sky-400 ring-2 ring-sky-500' : 'border-slate-600'}`}
                style={{ background: c.value }}
              />
            ))}
          </div>
          <IssueList issues={issuesOfWire(analysis, w.id)} />
          <WireExplanationCard circuit={circuit} wireId={w.id} />
        </Section>
      );
    }
    case 'hole': {
      const g = groupOf(circuit, selection.point);
      const net = g ? analysis.netByGroup.get(g) : undefined;
      return (
        <>
          <Section title="孔位">
            <div className="text-base font-semibold text-slate-50">{holeLabel(circuit, selection.point)}</div>
            <Row label="導通群組">{groupLabel(g, circuit.boards.length > 1)}</Row>
            <LevelRow groupId={g} />
            <Row label="Net">
              <NetLink net={net} analysis={analysis} />
            </Row>
            <ul className="mt-2 list-disc pl-4 text-xs text-slate-300">
              {holeContents(circuit, selection.point).map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
            <IssueList issues={issuesAtPoint(analysis, selection.point)} />
          </Section>
          {net && <NetInspector net={net} circuit={circuit} analysis={analysis} />}
        </>
      );
    }
    case 'board':
      return <BoardInspector id={selection.id} circuit={circuit} />;
    case 'net': {
      const net = analysis.netById.get(selection.netId);
      return net ? <NetInspector net={net} circuit={circuit} analysis={analysis} /> : null;
    }
    case 'issue': {
      const issue = analysis.issues[selection.index];
      return issue ? (
        <Section title="檢查結果">
          <IssueList issues={[issue]} />
          <ExplanationCard circuit={circuit} issue={issue} />
        </Section>
      ) : null;
    }
    case 'note': {
      const note = (circuit.notes ?? []).find((n) => n.id === selection.id);
      return note ? <NoteInspector circuit={circuit} note={note} /> : null;
    }
  }
}

function NetsTab({ circuit, analysis }: { circuit: Circuit; analysis: CircuitAnalysis }) {
  const selection = useStore((s) => s.selection);
  const comparison = useStore((s) => (isComparisonFresh(s) ? s.comparison : null));
  const failed = new Map((comparison?.result.failedNets ?? []).map((f) => [f.netId, f]));
  const store = useStore.getState();
  const multi = analysis.nets.filter((n) => n.pins.length > 1);
  const single = analysis.nets.filter((n) => n.pins.length === 1);
  return (
    <Section title={`Electrical Nets（${multi.length}）`}>
      {multi.length === 0 && <p className="text-xs text-slate-400">還沒有任何連在一起的腳位。用導線把腳位所在的導通群組接起來，就會形成 Net。</p>}
      <ul className="space-y-0.5">
        {multi.map((net) => {
          const active = selection?.kind === 'net' && selection.netId === net.id;
          const wires = circuit.wires.filter((w) => analysis.netByWire.get(w.id) === net).length;
          const f = failed.get(net.id);
          return (
            <li key={net.id}>
              <button
                type="button"
                onClick={() => store.select({ kind: 'net', netId: net.id })}
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm ${active ? 'bg-sky-900/60' : 'hover:bg-slate-800'}`}
              >
                <NetChip net={net} index={signalIndex(analysis, net)} />
                <span className="flex-1 text-slate-100">{net.name}</span>
                <span className="text-xs text-slate-400">
                  {net.pins.length} 腳 · {wires} 線
                </span>
              </button>
              {f && <div className="ml-6 text-xs text-red-300">✗ {FAILURE_NAMES[f.reason]}</div>}
            </li>
          );
        })}
      </ul>
      {single.length > 0 && <p className="mt-2 text-xs text-slate-500">另有 {single.length} 隻腳沒有和其他腳相連。</p>}
    </Section>
  );
}

/** 規格（2026-10-13 logic-to-breadboard）第 7 節：從邏輯圖轉來的麵包板，逐列模擬比對真值表（用目前的電路即時計算）。 */
function ConversionCard({ circuit }: { circuit: Circuit }) {
  const conversion = useStore((s) => s.conversion);
  const diagram = useLogic((l) => l.diagram);
  const result = useMemo(() => (conversion ? verifyBreadboard(diagram, circuit, conversion.switchTo, conversion) : null), [conversion, diagram, circuit]);
  if (!conversion || !result) return null;
  const ok = result.mismatches.length === 0;
  const names = sortedIo(diagram).outputs.map((n) => n.name ?? n.id);
  return (
    <div
      data-testid="conversion-check"
      className={`m-3 mb-0 rounded border px-3 py-2 text-xs leading-5 ${ok ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200' : 'border-red-700 bg-red-950/50 text-red-200'}`}
    >
      <div className="font-semibold">和邏輯圖的真值表比對</div>
      {verifyText(result, names)}
    </div>
  );
}

function CheckTab({ analysis }: { analysis: CircuitAnalysis }) {
  const showCheck = useStore((s) => s.showCheck);
  const circuit = useStore((s) => s.circuit);
  const selection = useStore((s) => s.selection);
  const store = useStore.getState();
  const errors = analysis.issues.filter((e) => e.severity === 'error');
  const warnings = analysis.issues.filter((e) => e.severity === 'warning');
  const focus = (issue: CircuitError, index: number) => {
    store.select({ kind: 'issue', index });
    store.setRightTab('check');
    if (issue.points.length > 0) store.focusPoints(issue.points);
  };
  const list = (items: CircuitError[], tone: string) =>
    items.map((issue) => {
      const index = analysis.issues.indexOf(issue);
      const active = selection?.kind === 'issue' && selection.index === index;
      return (
        <li key={index}>
          <button type="button" onClick={() => focus(issue, index)} className={`w-full rounded px-2 py-1 text-left text-xs leading-5 ${tone} ${active ? 'ring-1 ring-sky-400' : ''}`}>
            {issue.message}
          </button>
          {active && <ExplanationCard circuit={circuit} issue={issue} />}
        </li>
      );
    });
  return (
    <Section
      title="Check Circuit"
      right={
        <div className="flex gap-1">
          <SmallButton onClick={() => store.runCheck()}>重新檢查</SmallButton>
          <SmallButton onClick={() => store.setShowCheck(!showCheck)}>{showCheck ? '隱藏標記' : '顯示標記'}</SmallButton>
        </div>
      }
    >
      {analysis.valid ? (
        <div className="rounded bg-emerald-950/70 px-3 py-2 text-sm text-emerald-200" data-testid="circuit-valid">
          ✓ Circuit Valid：沒有錯誤也沒有警告
        </div>
      ) : (
        <>
          <div className="mb-2 text-sm text-slate-300">
            <span className="text-red-300">{errors.length} 個錯誤</span> · <span className="text-amber-300">{warnings.length} 個警告</span>
          </div>
          <ul className="space-y-1">
            {list(errors, 'bg-red-950/60 text-red-200 hover:bg-red-900/60')}
            {list(warnings, 'bg-amber-950/60 text-amber-200 hover:bg-amber-900/60')}
          </ul>
        </>
      )}
    </Section>
  );
}

const KIND_TITLES: Record<NonNullable<ChecklistRow['kind']> | 'none', string> = {
  power: '① 電源（VCC）',
  ground: '② 接地（GND）',
  signal: '③ 訊號',
  none: '其他（沒有接到元件腳）',
};

/** 接線清單：照著插實體麵包板的順序，插好一條勾一條。 */
function ChecklistTab({ circuit }: { circuit: Circuit }) {
  const checklist = useStore((s) => s.checklist);
  const selection = useStore((s) => s.selection);
  const mode = useStore((s) => deriveMode(s));
  const rows = useMemo(() => checklistRows(circuit, checklist), [circuit, checklist]);
  const moves = useStore((s) => appliedMoves(s));
  const store = useStore.getState();
  if (rows.length === 0) {
    return (
      <Section title="接線清單">
        <p className="text-xs leading-5 text-slate-400">還沒有導線。手動接線或執行 AI 標準佈線後，這裡會列出照著插實體麵包板的順序。</p>
      </Section>
    );
  }
  const done = rows.filter((r) => r.done).length;
  const focus = (id: string) => {
    const s = useStore.getState();
    const active = s.selection?.kind === 'wire' && s.selection.id === id;
    s.select(active ? null : { kind: 'wire', id }, { keepTab: true });
    const wire = s.circuit.wires.find((w) => w.id === id);
    if (!active && wire) s.focusPoints(wire.path);
  };
  return (
    <Section
      title="接線清單"
      right={
        <SmallButton onClick={() => store.clearChecklist()} title="清除所有勾選">
          全部清除
        </SmallButton>
      }
    >
      <div className="mb-1 flex items-center justify-between text-sm text-slate-200">
        <span data-testid="checklist-progress">
          已完成 {done} / {rows.length}
        </span>
        {done === rows.length && <span className="text-xs text-emerald-300">✓ 全部插好了</span>}
      </div>
      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${(done / rows.length) * 100}%` }} />
      </div>
      <p className="mb-2 text-xs leading-5 text-slate-400">
        {mode === 'auto' ? '依照 AI 標準佈線，' : '這是你的手動接線（執行 AI 標準佈線後會換成標準接法）；'}
        先接電源、再接地、最後接訊號。點一列可以在板上找到那條線，插好就打勾。
      </p>
      {moves.length > 0 && (
        <div className="mb-2 rounded border border-amber-700 bg-amber-950/50 px-2 py-1.5 text-xs leading-5 text-amber-200" data-testid="checklist-moves">
          <div className="font-semibold">插線前先把 IC 插到新的位置（第 1 腳所在的孔）：</div>
          {moves.map((m) => (
            <div key={m.componentId}>{describeMove(circuit, m)}</div>
          ))}
        </div>
      )}
      <ol className="space-y-0.5">
        {rows.map((row, i) => {
          const active = selection?.kind === 'wire' && selection.id === row.wireId;
          const group = row.kind ?? 'none';
          const header = i === 0 || (rows[i - 1].kind ?? 'none') !== group;
          return (
            <li key={row.wireId}>
              {header && <div className="mb-0.5 mt-2 text-[11px] font-semibold text-slate-400 first:mt-0">{KIND_TITLES[group]}</div>}
              <div
                data-checklist-row={row.wireId}
                className={`flex items-center gap-2 rounded px-1.5 py-1 ${active ? 'bg-sky-900/60 ring-1 ring-sky-500' : 'hover:bg-slate-800'}`}
              >
                <label className="flex shrink-0 items-center justify-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-emerald-500"
                    checked={row.done}
                    onChange={(e) => store.setWireChecked(row.wireId, e.target.checked)}
                    aria-label={`${row.from} → ${row.to} 已插好`}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => focus(row.wireId)}
                  title={`導線 ${row.wireId}${row.netName ? ` · ${row.netName}` : ''}`}
                  className={`flex min-w-0 flex-1 items-center gap-2 text-left text-xs ${row.done ? 'opacity-50 line-through' : ''}`}
                >
                  <span className="inline-block h-3 w-3 shrink-0 rounded-sm border border-slate-500" style={{ background: row.color }} />
                  <span className="w-6 shrink-0 text-slate-300">{row.colorName}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-slate-100">
                    {row.from} → {row.to}
                  </span>
                  {row.labels.length > 0 && <span className="shrink-0 rounded bg-slate-700 px-1 text-[10px] font-semibold text-slate-100">{row.labels.join('、')}</span>}
                  <span className="shrink-0 tabular-nums text-slate-400">{row.length} 格</span>
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

const TABS: Array<[RightTab, string]> = [
  ['inspect', '屬性'],
  ['nets', 'Nets'],
  ['check', '檢查'],
  ['checklist', '接線清單'],
];

/** 右側資訊面板：選取項目、Nets、檢查結果。 */
export function PropertyPanel() {
  const circuit = useStore((s) => s.circuit);
  const selection = useStore((s) => s.selection);
  const tab = useStore((s) => s.rightTab);
  const open = useStore((s) => s.drawer === 'info');
  const analysis = useMemo(() => analyzeCircuit(circuit), [circuit]);
  const problems = analysis.errorCount + analysis.warningCount;
  // 選擇器要回傳穩定的參照（zustand v5），進度在這裡用 useMemo 算。
  const checklist = useStore((s) => s.checklist);
  const progress = useMemo(() => checklistProgress(checklist, circuit), [checklist, circuit]);
  return (
    <aside
      aria-label="資訊"
      className={`${open ? 'flex' : 'hidden'} absolute inset-y-0 right-0 z-30 w-80 max-w-[90vw] shrink-0 flex-col border-l border-slate-800 bg-slate-900 shadow-2xl lg:static lg:z-auto lg:flex lg:h-full lg:shadow-none`}
    >
      <div className="flex border-b border-slate-800" role="tablist">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => useStore.getState().setRightTab(id)}
            className={`flex-1 whitespace-nowrap px-2 py-2 text-sm ${tab === id ? 'border-b-2 border-sky-500 text-slate-50' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {label}
            {id === 'check' && problems > 0 && (
              <span className={`ml-1.5 rounded-full px-1.5 text-[10px] ${analysis.errorCount > 0 ? 'bg-red-600 text-white' : 'bg-amber-500 text-black'}`}>{problems}</span>
            )}
            {id === 'nets' && <span className="ml-1.5 text-[10px] text-slate-500">{analysis.nets.filter((n) => n.pins.length > 1).length}</span>}
            {id === 'checklist' && progress.total > 0 && (
              <span className="ml-1.5 text-[10px] tabular-nums text-slate-500">
                {progress.done}/{progress.total}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="bbl-scroll min-h-0 flex-1 overflow-y-auto">
        {tab === 'inspect' && <Inspector selection={selection} circuit={circuit} analysis={analysis} />}
        {tab === 'nets' && <NetsTab circuit={circuit} analysis={analysis} />}
        {tab === 'check' && (
          <>
            <ConversionCard circuit={circuit} />
            <CheckTab analysis={analysis} />
          </>
        )}
        {tab === 'checklist' && <ChecklistTab circuit={circuit} />}
      </div>
    </aside>
  );
}
