import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { getComponentDefinition } from '../../core/circuit/library';
import { analyzeCircuit, netOfPin, type CircuitAnalysis } from '../../editor/analysis';
import { EXAMPLES } from '../../editor/examples';
import { WIRE_COLORS } from '../../editor/manualWire';
import { darkReasonText, whyDark } from '../../core/simulation/darkDisplay';
import { compileSimulation, type SimResult } from '../../core/simulation/simulate';
import { LEVEL_COLORS, LEVEL_NAMES } from '../../render/theme';
import type { Level } from '../../types/logic';
import { deriveMode, useStore } from '../../state/store';
import type { Circuit } from '../../types/circuit';
import type { GridPoint } from '../../types/geometry';
import type { RoutingMetrics } from '../../types/routing';
import { groupIdAt } from '../../editor/analysis';
import { boardGroups, crossBoardWires, groupMembers, MAX_BOARDS } from '../../editor/boards';
import {
  boardGroupTitle,
  describeMove,
  FAILURE_NAMES,
  groupLabel,
  groupOf,
  holeContents,
  holeLabel,
  issuesAtPoint,
  issuesOfComponent,
  issuesOfWire,
  ROLE_NAMES,
  wireSummary,
} from '../common/describe';

export type Hover =
  | { kind: 'hole'; point: GridPoint; x: number; y: number }
  | { kind: 'pin'; componentId: string; pinNumber: number; x: number; y: number }
  | { kind: 'wire'; id: string; x: number; y: number }
  | { kind: 'component'; id: string; x: number; y: number }
  | { kind: 'board'; id: string; x: number; y: number };

export interface MenuState {
  x: number;
  y: number;
  target: { kind: 'component'; id: string } | { kind: 'wire'; id: string } | { kind: 'board'; id: string } | { kind: 'canvas' };
}

/** 麵包板所屬的群組說明，例如「Board Group 1 · 2 Boards（b1、b2）」；單獨一塊回傳 null。 */
export function boardGroupText(circuit: Circuit, boardId: string): string | null {
  const groups = boardGroups(circuit);
  const index = groups.findIndex((g) => g.boardIds.includes(boardId));
  return index < 0 ? null : `${boardGroupTitle(groups[index], index)}（${groups[index].boardIds.join('、')}）`;
}

function Line({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <div className={muted ? 'text-slate-400' : undefined}>{children}</div>;
}

/** 模擬時的電位標籤（色點 + 文字）。 */
export function LevelTag({ level }: { level: Level }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: LEVEL_COLORS[String(level)] }} />
      {LEVEL_NAMES[String(level)]}
    </span>
  );
}

/** 游標停在孔、腳、導線、元件上時的說明。 */
export function HoverTooltip({
  hover,
  container,
  circuit,
  analysis,
  sim,
}: {
  hover: Hover;
  container: HTMLDivElement | null;
  circuit: Circuit;
  analysis: CircuitAnalysis;
  sim: SimResult | null;
}) {
  if (!container) return null;
  let level: Level | undefined;
  const rect = container.getBoundingClientRect();
  const lines: ReactNode[] = [];
  let issues: string[] = [];
  let title = '';

  if (hover.kind === 'hole') {
    const g = groupOf(circuit, hover.point);
    const net = g ? analysis.netByGroup.get(g) : undefined;
    title = holeLabel(circuit, hover.point);
    if (sim && g) level = sim.groupLevels[g] ?? 'Z';
    lines.push(<Line key="g" muted>{groupLabel(g, circuit.boards.length > 1)}</Line>);
    if (net) lines.push(<Line key="n">Net：{net.name}</Line>);
    for (const [i, text] of holeContents(circuit, hover.point).entries()) lines.push(<Line key={`c${i}`}>{text}</Line>);
    issues = issuesAtPoint(analysis, hover.point).map((e) => e.message);
  } else if (hover.kind === 'pin') {
    const c = circuit.components.find((x) => x.id === hover.componentId);
    const def = c ? getComponentDefinition(c.defId) : undefined;
    const pin = def?.pins.find((p) => p.number === hover.pinNumber);
    const net = netOfPin(analysis, { componentId: hover.componentId, pinNumber: hover.pinNumber });
    title = `${hover.componentId} · ${def?.name ?? ''}`;
    if (sim) level = sim.pinLevels[`${hover.componentId}#${hover.pinNumber}`] ?? 'Z';
    if (pin) lines.push(<Line key="p">腳 {pin.number}：{pin.name}（{ROLE_NAMES[pin.role]}）</Line>);
    lines.push(<Line key="n">Net：{net ? `${net.name}（${net.pins.length} 隻腳）` : '—'}</Line>);
    issues = issuesOfComponent(analysis, hover.componentId).map((e) => e.message);
  } else if (hover.kind === 'wire') {
    const w = circuit.wires.find((x) => x.id === hover.id);
    if (!w) return null;
    const net = analysis.netByWire.get(w.id);
    title = `導線 ${w.id}`;
    const g = groupIdAt(circuit, w.start);
    if (sim && g) level = sim.groupLevels[g] ?? 'Z';
    lines.push(<Line key="s" muted>{`${holeLabel(circuit, w.start)} → ${holeLabel(circuit, w.end)} · ${wireSummary(w, circuit)}`}</Line>);
    lines.push(<Line key="n">Net：{net?.name ?? '—'}{w.source === 'auto' ? ' · AI 標準佈線' : ' · 手動'}</Line>);
    issues = issuesOfWire(analysis, w.id).map((e) => e.message);
  } else if (hover.kind === 'board') {
    title = `麵包板 ${hover.id} · MB-102`;
    lines.push(<Line key="g">{boardGroupText(circuit, hover.id) ?? '單獨一塊（沒有和其他板貼在一起）'}</Line>);
    const parts = circuit.components.filter((c) => c.boardId === hover.id).length;
    lines.push(<Line key="c" muted>{`${parts} 個元件`}</Line>);
    if (!sim) {
      const grouped = groupMembers(circuit, hover.id).length > 1;
      lines.push(
        <Line key="h" muted>
          {grouped ? '拖曳移動整個群組 · Alt / Shift + 拖曳只移動這一塊' : '拖曳移動 · 靠近另一塊板的邊會自動吸附'}
        </Line>,
      );
    }
  } else {
    const c = circuit.components.find((x) => x.id === hover.id);
    const def = c ? getComponentDefinition(c.defId) : undefined;
    title = `${hover.id} · ${def?.name ?? ''}`;
    if (def?.description) lines.push(<Line key="d" muted>{def.description}</Line>);
    if (!sim) lines.push(<Line key="h" muted>拖曳移動 · R 旋轉 · Del 刪除</Line>);
    else if (def?.category === 'dip-switch') lines.push(<Line key="h" muted>點小開關切換 ON / OFF（ON = 兩側接通）</Line>);
    else if (def?.category === 'pushbutton') lines.push(<Line key="h" muted>按住按鈕 = 接通、放開 = 斷開</Line>);
    if (sim?.unpowered.includes(hover.id)) lines.push(<Line key="u">⚠ 沒有接好 VCC / GND，不會運作</Line>);
    // 7 段顯示器全暗時說明原因（74LS47 輸入 15 也是全暗，和沒通電看起來一樣）。
    const dark = sim && def?.category === 'seven-seg' ? whyDark(compileSimulation(circuit), sim, hover.id) : null;
    if (dark) lines.push(<Line key="dark">全暗：{darkReasonText(dark)}</Line>);
    issues = issuesOfComponent(analysis, hover.id).map((e) => e.message);
  }

  const left = Math.min(hover.x - rect.left + 16, rect.width - 300);
  const top = Math.min(hover.y - rect.top + 18, rect.height - 140);
  return (
    <div
      className="pointer-events-none absolute z-20 max-w-[290px] rounded-md border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs leading-5 text-slate-200 shadow-xl"
      style={{ left, top }}
      data-testid="hover-info"
    >
      <div className="font-semibold text-slate-50">{title}</div>
      {level !== undefined && (
        <div className="my-0.5">
          電位：<LevelTag level={level} />
        </div>
      )}
      {lines}
      {issues.slice(0, 3).map((m, i) => (
        <div key={i} className="mt-1 text-amber-300">
          {m}
        </div>
      ))}
    </div>
  );
}

function MenuItem({ children, onClick, shortcut, danger }: { children: ReactNode; onClick: () => void; shortcut?: string; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left text-sm hover:bg-slate-700 ${danger ? 'text-red-300' : 'text-slate-100'}`}
    >
      <span>{children}</span>
      {shortcut && <span className="text-xs text-slate-400">{shortcut}</span>}
    </button>
  );
}

/** 選單和畫布邊緣至少留的距離（px）。 */
const MENU_MARGIN = 4;

export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const store = useStore.getState();
  // 在靠右或靠下的地方打開時，畫布放不下就翻到指標的左邊 / 上面（畫布是 overflow-hidden，超出的部分會被裁掉）。
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: menu.x, top: menu.y });
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    const fits = (start: number, size: number, room: number) => start + size <= room - MENU_MARGIN;
    setPos({
      left: fits(menu.x, el.offsetWidth, parent.clientWidth) ? menu.x : Math.max(MENU_MARGIN, menu.x - el.offsetWidth),
      top: fits(menu.y, el.offsetHeight, parent.clientHeight) ? menu.y : Math.max(MENU_MARGIN, menu.y - el.offsetHeight),
    });
  }, [menu.x, menu.y]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const t = menu.target;
  return (
    <div
      ref={ref}
      data-testid="context-menu"
      className="bbl-scroll absolute z-30 max-h-[calc(100%-8px)] min-w-[190px] overflow-y-auto rounded-md border border-slate-600 bg-slate-800 py-1 shadow-2xl"
      style={pos}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {t.kind === 'component' && (
        <>
          <MenuItem onClick={run(() => store.rotateComponent(t.id))} shortcut="R">
            旋轉 90°（Rotate）
          </MenuItem>
          <MenuItem
            onClick={run(() => {
              store.select({ kind: 'component', id: t.id });
              store.showRightTab('inspect');
            })}
          >
            顯示屬性
          </MenuItem>
          <MenuItem onClick={run(() => store.deleteComponent(t.id))} shortcut="Del" danger>
            刪除 {t.id}
          </MenuItem>
        </>
      )}
      {t.kind === 'wire' && (
        <>
          <div className="flex flex-wrap gap-1 px-3 py-2">
            {WIRE_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                title={`${c.name}色`}
                onClick={run(() => store.setWireColors([t.id], c.value))}
                className="h-5 w-5 rounded-full border border-slate-500"
                style={{ background: c.value }}
              />
            ))}
          </div>
          <MenuItem onClick={run(() => store.deleteWire(t.id))} shortcut="Del" danger>
            刪除導線 {t.id}
          </MenuItem>
        </>
      )}
      {t.kind === 'board' && (
        <BoardMenuItems id={t.id} run={run} />
      )}
      {t.kind === 'canvas' && (
        <>
          <MenuItem onClick={run(() => store.addBoard('MB102'))}>＋ 新增 MB-102</MenuItem>
          <MenuItem onClick={run(() => store.addBoard('EIC1106'))}>＋ 新增 EIC-1106</MenuItem>
          <MenuItem onClick={run(() => store.fitToScreen())} shortcut="F">
            Fit to Screen
          </MenuItem>
          <MenuItem onClick={run(() => store.resetView())} shortcut="0">
            Reset View
          </MenuItem>
          <MenuItem onClick={run(() => store.runCheck())}>Check Circuit</MenuItem>
          <MenuItem onClick={run(() => store.runAutoRoute('apply'))}>AI 標準佈線</MenuItem>
        </>
      )}
    </div>
  );
}

function BoardMenuItems({ id, run }: { id: string; run: (fn: () => void) => () => void }) {
  const store = useStore.getState();
  const circuit = store.circuit;
  const grouped = groupMembers(circuit, id).length > 1;
  const wired = crossBoardWires(circuit, [id]).length > 0;
  return (
    <>
      <MenuItem onClick={run(() => store.select({ kind: 'board', id }))}>顯示麵包板 {id} 的資訊</MenuItem>
      {grouped && (
        <MenuItem onClick={run(() => store.detachBoard(id))}>
          移出群組{wired ? '（有跨板導線）' : ''}
        </MenuItem>
      )}
      {circuit.boards.length < MAX_BOARDS && <MenuItem onClick={run(() => store.addBoard('MB102'))}>＋ 新增 MB-102</MenuItem>}
      {circuit.boards.length < MAX_BOARDS && <MenuItem onClick={run(() => store.addBoard('EIC1106'))}>＋ 新增 EIC-1106</MenuItem>}
      {circuit.boards.length > 1 && (
        <MenuItem onClick={run(() => store.removeBoard(id))} shortcut="Del" danger>
          刪除麵包板 {id}
        </MenuItem>
      )}
    </>
  );
}

function MetricsTable({ before, after }: { before: { metrics: RoutingMetrics; score: number }; after: { metrics: RoutingMetrics; score: number } }) {
  const rows: Array<[string, keyof RoutingMetrics | 'score', boolean]> = [
    ['Wire Count', 'wireCount', false],
    ['Total Length (holes)', 'totalLength', true],
    ['Bends', 'bends', true],
    ['Crossings', 'crossings', true],
    ['Overlaps', 'overlaps', true],
    ['Routing Score', 'score', false],
  ];
  const value = (s: { metrics: RoutingMetrics; score: number }, key: keyof RoutingMetrics | 'score') => (key === 'score' ? s.score : s.metrics[key]);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-slate-400">
          <th className="py-1 text-left font-normal" />
          <th className="py-1 text-right font-normal">手動接線</th>
          <th className="py-1 text-right font-normal">AI 標準佈線</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, key, lowerIsBetter]) => {
          const a = value(before, key);
          const b = value(after, key);
          const better = key === 'wireCount' ? false : lowerIsBetter ? b < a : b > a;
          return (
            <tr key={key} className={key === 'score' ? 'border-t border-slate-700 font-semibold' : undefined}>
              <td className="py-0.5 text-slate-300">{label}</td>
              <td className="py-0.5 text-right tabular-nums text-slate-400">{a}</td>
              <td className={`py-0.5 text-right tabular-nums ${better ? 'text-emerald-300' : 'text-slate-100'}`} data-metric={key}>
                {b}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ResultCard() {
  const comparison = useStore((s) => s.comparison);
  const visible = useStore((s) => s.resultVisible);
  const circuit = useStore((s) => s.circuit);
  if (!visible || !comparison) return null;
  const { result } = comparison;
  const ok = result.status === 'success';
  const after = { metrics: result.metrics, score: result.score };
  const store = useStore.getState();
  const applied = deriveMode({ view: 'edit', circuit }) === 'auto';
  return (
    <div className="absolute right-4 top-4 z-20 w-[330px] rounded-lg border border-slate-600 bg-slate-900/95 p-4 shadow-2xl" data-testid="routing-result">
      <div className="flex items-start justify-between gap-2">
        <div className={`text-base font-semibold ${ok ? 'text-emerald-300' : 'text-red-300'}`}>{ok ? '✓ ' : '✗ '}{result.message}</div>
        <button type="button" className="text-slate-400 hover:text-slate-100" onClick={() => store.dismissResult()} aria-label="關閉">
          ✕
        </button>
      </div>
      {ok ? (
        <p className="mt-1 text-xs text-slate-400">
          協商 {result.stats.iterations} 輪 · {result.stats.elapsedMs} ms · 只走水平 / 垂直、0 重疊，所有 Net 的電氣連接與你的接線相同。
        </p>
      ) : (
        <div className="mt-2 space-y-1 text-xs">
          <p className="text-slate-300">電路沒有被修改。以下 Net 無法佈線：</p>
          {result.failedNets.map((f) => (
            <div key={f.netId} className="rounded bg-red-950/60 px-2 py-1 text-red-200">
              <span className="font-semibold">{f.netId}</span>：{FAILURE_NAMES[f.reason]}
              <div className="text-red-300/80">{f.detail}</div>
            </div>
          ))}
        </div>
      )}
      {result.moves && (
        <div className="mt-2 rounded bg-amber-950/50 px-2 py-1 text-xs text-amber-200" data-testid="ic-moves">
          {result.moves.length === 0 ? 'IC 已經在最好的位置，沒有移動。' : result.moves.map((m) => <div key={m.componentId}>移動 {describeMove(circuit, m)}</div>)}
        </div>
      )}
      <div className="mt-3">
        <MetricsTable before={comparison.beforeScore} after={after} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="rounded bg-sky-600 px-3 py-1 text-sm text-white hover:bg-sky-500" onClick={() => store.setMode('compare')}>
          比較 Compare
        </button>
        {ok && applied && (
          <button type="button" className="rounded bg-slate-700 px-3 py-1 text-sm text-slate-100 hover:bg-slate-600" onClick={() => store.undo()}>
            復原 Undo
          </button>
        )}
        {applied && (
          <button type="button" data-testid="routing-explain" className="rounded bg-emerald-700 px-3 py-1 text-sm text-white hover:bg-emerald-600" onClick={() => store.showRoutingSummary()}>
            看說明
          </button>
        )}
        <button type="button" className="rounded bg-slate-700 px-3 py-1 text-sm text-slate-100 hover:bg-slate-600" onClick={() => store.dismissResult()}>
          關閉
        </button>
      </div>
    </div>
  );
}

function RoutingOverlay() {
  const routing = useStore((s) => s.routing);
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!routing) return;
    const timer = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(timer);
  }, [routing]);
  if (!routing) return null;
  const seconds = Math.max(0, (now - routing.startedAt) / 1000);
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/35">
      <div className="w-[340px] rounded-lg border border-slate-600 bg-slate-900/95 p-5 text-center shadow-2xl">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
        <div className="text-base font-semibold text-slate-100">
          {routing.converting ? '轉成麵包板：試好幾種擺法…' : routing.moveIcs ? 'AI 佈線（可移動 IC）計算中…' : 'AI 標準佈線計算中…'}
        </div>
        <div className="mt-1 text-xs text-slate-400">
          {routing.converting
            ? '每種擺法用可移動 IC 的佈線試一次，挑最好的（大電路要等十幾秒）'
            : routing.moveIcs
              ? '找 IC 位置 → 直線跳線佈線 → 合法性檢查'
              : '分析 Electrical Nets → 直線跳線搜尋 → 協商式拆線重排 → 合法性檢查'}
        </div>
        <div className="mt-2 text-sm tabular-nums text-slate-300">{seconds.toFixed(1)} 秒</div>
        <button type="button" className="mt-3 rounded bg-slate-700 px-4 py-1 text-sm text-slate-100 hover:bg-slate-600" onClick={() => useStore.getState().cancelRouting()}>
          取消
        </button>
      </div>
    </div>
  );
}

function EmptyHint() {
  const empty = useStore((s) => s.circuit.components.length === 0 && s.circuit.wires.length === 0);
  const placing = useStore((s) => s.placing);
  const [hidden, setHidden] = useState(false);
  if (!empty || placing || hidden) return null;
  const store = useStore.getState();
  return (
    <div className="absolute left-1/2 top-5 z-10 w-[560px] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg border border-slate-600 bg-slate-900/95 p-4 text-sm text-slate-200 shadow-2xl">
      <div className="flex items-start justify-between">
        <div className="text-base font-semibold text-slate-50">開始設計你的麵包板電路</div>
        <button type="button" className="text-slate-400 hover:text-slate-100" onClick={() => setHidden(true)} aria-label="關閉">
          ✕
        </button>
      </div>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-300">
        <li>從左側元件庫把 <b>74LS00</b> 拖到麵包板中央凹槽上（會自動吸附到合法孔位）。</li>
        <li>放入 LED、電阻、VCC、GND；選取後按 <kbd className="rounded bg-slate-700 px-1">R</kbd> 旋轉。</li>
        <li>從一個<b>空孔</b>按住拖曳到另一個空孔，建立只有水平 / 垂直的導線。</li>
        <li>按 <b>Check Circuit</b> 檢查，再按 <b>AI 標準佈線</b> 產生最整齊的接線。</li>
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400">或先看範例：</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.id}
            type="button"
            title={ex.description}
            className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-100 hover:bg-slate-600"
            onClick={() => store.loadCircuit(ex.build(), ex.name, `已載入範例「${ex.name}」：${ex.description}`)}
          >
            {ex.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function CheckBadge() {
  const showCheck = useStore((s) => s.showCheck);
  const circuit = useStore((s) => s.circuit);
  const simulating = useStore((s) => s.simulation !== null);
  if (!showCheck || simulating) return null;
  const store = useStore.getState();
  const analysis = analyzeForBadge(circuit);
  const tone = analysis.errors > 0 ? 'border-red-500/60 bg-red-950/90 text-red-200' : analysis.warnings > 0 ? 'border-amber-500/60 bg-amber-950/90 text-amber-200' : 'border-emerald-500/60 bg-emerald-950/90 text-emerald-200';
  return (
    <div className={`absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border px-4 py-1 text-sm shadow-lg ${tone}`} data-testid="check-badge">
      <button type="button" onClick={() => store.showRightTab('check')}>
        {analysis.errors === 0 && analysis.warnings === 0
          ? '✓ Circuit Valid'
          : `⚠ ${analysis.errors} 個錯誤 · ${analysis.warnings} 個警告`}
      </button>
      <button type="button" className="opacity-70 hover:opacity-100" onClick={() => store.setShowCheck(false)} aria-label="隱藏檢查標記">
        ✕
      </button>
    </div>
  );
}

function analyzeForBadge(circuit: Circuit) {
  const a = analyzeCircuit(circuit);
  return { errors: a.errorCount, warnings: a.warningCount };
}

function SimulationBar() {
  const run = useStore((s) => s.simulation);
  const circuit = useStore((s) => s.circuit);
  if (!run) return null;
  const store = useStore.getState();
  const clocks = circuit.components.filter((c) => c.defId === 'clock');
  const r = run.result;
  const btn = 'rounded px-2 py-0.5 text-xs hover:bg-slate-700';
  return (
    <div className="absolute left-1/2 top-3 z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col items-center gap-1" data-testid="simulation-bar">
      <div className="flex items-center gap-2 whitespace-nowrap rounded-full border border-emerald-600/60 bg-slate-900/95 px-3 py-1 text-sm text-slate-100 shadow-lg">
        <span className="flex items-center gap-1.5 font-semibold text-emerald-300">
          <span className="bbl-pulse inline-block h-2 w-2 rounded-full bg-emerald-400" />
          模擬中
        </span>
        {clocks.length > 0 && (
          <>
            <span className="tabular-nums text-slate-300">t = {(run.time / 1000).toFixed(2)} s</span>
            <span className="text-xs text-slate-400">時脈 {clocks.map((c) => `${c.props.frequency ?? 1}Hz`).join('、')}</span>
            <button type="button" className={btn} onClick={() => store.toggleClockPause()}>
              {run.paused ? '▶ 繼續' : '⏸ 暫停'}
            </button>
            <button type="button" className={btn} onClick={() => store.stepClock()} title="把時間推進到下一個時脈邊緣">
              ⏭ 單步
            </button>
          </>
        )}
        <button type="button" className={btn} onClick={() => store.resetSimulation()} title="回到上電狀態（正反器、計數器歸零）">
          ↺ 重置
        </button>
        <button type="button" className={`${btn} text-red-300`} onClick={() => store.stopSimulation()}>
          ■ 停止
        </button>
      </div>
      {(r.unpowered.length > 0 || !r.stable || r.conflicts.length > 0) && (
        <div className="rounded-md border border-amber-600/60 bg-amber-950/90 px-3 py-1 text-xs text-amber-200 shadow-lg">
          {r.unpowered.length > 0 && <div>⚠ {r.unpowered.join('、')} 沒有接好 VCC / GND，不會運作</div>}
          {!r.stable && <div>⚠ 電路不穩定（震盪）：輸出一直在改變，檢查是否有沒有接好的回授</div>}
          {r.conflicts.length > 0 && <div>⚠ {r.conflicts.length} 個導通群組電位衝突（X）：可能有輸出互接或短路</div>}
        </div>
      )}
    </div>
  );
}

/** 模擬時左下角的電位圖例。 */
function LevelLegend() {
  const simulating = useStore((s) => s.simulation !== null);
  if (!simulating) return null;
  const items: Array<[string, string]> = [
    ['1', 'HIGH'],
    ['0', 'LOW'],
    ['Z', '浮接'],
    ['X', '衝突 / 未知'],
  ];
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-3 rounded-md border border-slate-700 bg-slate-900/90 px-3 py-1.5 text-[11px] text-slate-300 shadow-lg">
      <span className="text-slate-500">電位</span>
      {items.map(([k, label]) => (
        <span key={k} className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: LEVEL_COLORS[k] }} />
          {k} {label}
        </span>
      ))}
    </div>
  );
}

function ZoomControls() {
  const scale = useStore((s) => s.viewport.scale);
  const store = useStore.getState();
  const btn = 'h-7 min-w-7 rounded px-2 text-sm text-slate-200 hover:bg-slate-700';
  return (
    <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/90 p-1 shadow-lg">
      <button type="button" className={btn} onClick={() => store.zoomBy(1 / 1.25)} title="縮小（-）">
        −
      </button>
      <span className="w-12 text-center text-xs tabular-nums text-slate-400" data-testid="zoom">
        {Math.round(scale * 100)}%
      </span>
      <button type="button" className={btn} onClick={() => store.zoomBy(1.25)} title="放大（+）">
        +
      </button>
      <button type="button" className={btn} onClick={() => store.fitToScreen()} title="Fit to Screen（F）">
        Fit
      </button>
      <button type="button" className={btn} onClick={() => store.resetView()} title="Reset View（0）">
        1:1
      </button>
    </div>
  );
}

function PlacingHint({ drawingWire, movingBoards }: { drawingWire: boolean; movingBoards: boolean }) {
  const placing = useStore((s) => s.placing);
  const simulating = useStore((s) => s.simulation !== null);
  const multiBoard = useStore((s) => s.circuit.boards.length > 1);
  let text: string | null = null;
  if (simulating) text = '點指撥開關切換 ON / OFF · 按住按鈕 · 停在孔或腳上看電位';
  else if (placing) text = `放置 ${placing.item.name}：${placing.dragging ? '拖到麵包板上放開' : '移到麵包板上點一下'} · R 旋轉 · Esc / 右鍵取消`;
  else if (movingBoards) text = '靠近另一塊板的邊會自動吸附並對齊 · 放開完成 · Esc 取消';
  else if (drawingWire) text = multiBoard ? '拖到另一個空孔放開即可接線（同一群組的另一塊板也可以）· Esc 取消' : '拖到另一個空孔放開即可接線 · Esc 取消';
  if (!text) return null;
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-slate-600 bg-slate-900/90 px-4 py-1 text-xs text-slate-200 shadow-lg">
      {text}
    </div>
  );
}

/** 疊在畫布上的 HTML 介面。 */
export function CanvasHud({ drawingWire, movingBoards }: { drawingWire: boolean; movingBoards: boolean }) {
  return (
    <>
      <EmptyHint />
      <CheckBadge />
      <SimulationBar />
      <LevelLegend />
      <ZoomControls />
      <PlacingHint drawingWire={drawingWire} movingBoards={movingBoards} />
      <ResultCard />
      <RoutingOverlay />
    </>
  );
}
