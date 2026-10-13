import { create } from 'zustand';
import { getLayout } from '../core/breadboard/registry';
import { getComponentDefinition } from '../core/circuit/library';
import { applyMoves } from '../core/icPlacement/relocate';
import { applyRouting } from '../core/routing/apply';
import {
  adoptSimState,
  clockLevel,
  compileSimulation,
  initialSimState,
  nextClockEdge,
  settle,
  type SimInputs,
  type SimResult,
  type SimState,
} from '../core/simulation/simulate';
import { analyzeCircuit } from '../editor/analysis';
import { addBoard, boardMoveProblem, crossBoardWires, detachBoard, groupMembers, MAX_BOARDS, moveBoards, removeBoard } from '../editor/boards';
import { pruneChecklist, setChecked, type ChecklistState } from '../editor/checklist';
import {
  addComponent,
  addWire,
  moveComponent,
  moveWireEnd,
  removeItems,
  replaceWires,
  rotateComponent,
  setComponentSpan,
  setWireColor,
  toggleSwitch,
  setLabel,
  updateComponentProps,
} from '../editor/commands';
import { emptyCircuit, parseCircuitText } from '../editor/fileFormat';
import { LOGIC_EXAMPLES } from '../logic/examples';
import { toBreadboard, type ConvertOptions } from '../logic/toBreadboard';
import type { VerifyMap } from '../logic/verifyBreadboard';
import { emptyDiagram, type LogicDiagram } from '../logic/types';
import { logicDirty, useLogic } from './logic';
import { boardFrames, gridBounds, MM_TO_PX, worldBounds } from '../editor/geometry';
import { emptyHistory, record, redo, undo, type History } from '../editor/history';
import type { LibraryItem } from '../editor/library';
import { DEFAULT_WIRE_COLOR, defaultWireColor, straightProblemText, straightWireProblem } from '../editor/manualWire';
import { centerOn, DEFAULT_VIEWPORT, fitRect, screenToWorld, zoomAt, type Viewport } from '../editor/viewport';
import type { BreadboardInstance, LayoutId } from '../types/board';
import type { Circuit, NoteColor, Wire } from '../types/circuit';
import type { ComponentInstance, ComponentProps, Rotation } from '../types/component';
import type { GridPoint } from '../types/geometry';
import type { IcMove, RoutingMetrics, RoutingResult } from '../types/routing';
import { RoutingCancelled, startRouting, type RoutingJob } from '../workers/routingClient';
import * as persistence from './persistence';
import { addNote, moveNote, NOTE_WIDTH_MM, removeNote, setNoteColor, setNoteTarget, setNoteText } from '../editor/notes';

export type Selection =
  | { kind: 'component'; id: string }
  | { kind: 'pin'; componentId: string; pinNumber: number }
  | { kind: 'wire'; id: string }
  | { kind: 'hole'; point: GridPoint }
  | { kind: 'board'; id: string }
  | { kind: 'net'; netId: string }
  | { kind: 'issue'; index: number }
  /** 子專案 18：便條。 */
  | { kind: 'note'; id: string }
  | null;

/** 從元件庫拿起、還沒放下的元件。 */
export interface PlacingTool {
  item: LibraryItem;
  rotation: Rotation;
  /** true：按住拖曳中，放開就放置；false：點一下後 ghost 跟著游標，再點板子放置。 */
  dragging: boolean;
  /** 在元件庫按下時的螢幕座標，用來分辨「點一下」與「拖曳」。 */
  origin: { x: number; y: number } | null;
}

export type Mode = 'manual' | 'auto' | 'compare';
export type RightTab = 'inspect' | 'nets' | 'check' | 'checklist';
export type Dialog = 'open' | 'save-as' | 'confirm-new' | 'help' | 'ai-key' | 'to-breadboard' | null;
/** 窄螢幕（寬度 < 1024 px，例如直放的平板）時，左右面板改成可以開關的抽屜。 */
export type Drawer = 'library' | 'info' | null;

export interface Comparison {
  /** 佈線當時使用者的導線。 */
  beforeWires: Wire[];
  beforeScore: { metrics: RoutingMetrics; score: number };
  result: RoutingResult;
  /** 佈線當時的元件與麵包板陣列（參照）；元件或板子一改變，這份對照就過期。 */
  components: ComponentInstance[];
  boards: BreadboardInstance[];
  /** 套用了有搬移 IC 的結果之後的元件陣列（參照）；沒有搬移時為 null。 */
  appliedComponents: ComponentInstance[] | null;
}

export interface WireAnimation {
  key: number;
  /** wire id → 開始時間（ms）。 */
  delays: Record<string, number>;
  drawMs: number;
  totalMs: number;
  /** 子專案 8：這次搬動的 IC（動畫期間畫出原位置與新位置）。 */
  moves: IcMove[];
}

/** 模擬模式的執行狀態（不存檔、不進 Undo）。 */
export interface SimulationRun {
  /** 模擬時間（ms）；時脈依它決定電位，每個 tick 固定前進 25 ms，結果可重現。 */
  time: number;
  paused: boolean;
  /** 目前按住的按鈕。 */
  pressed: Record<string, boolean>;
  state: SimState;
  result: SimResult;
}

export const SIM_TICK_MS = 25;

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface AppState {
  circuit: Circuit;
  history: History<Circuit>;
  projectName: string | null;
  /** 上次存檔時的電路參照；不同就代表有未儲存的修改。 */
  savedCircuit: Circuit | null;
  selection: Selection;
  placing: PlacingTool | null;
  view: 'edit' | 'compare';
  /** 規格（2026-10-11 logic-diagram）第 5 節：「邏輯圖｜麵包板」切換；和 view（edit / compare）無關。 */
  workspace: 'breadboard' | 'logic';
  /** 規格（2026-10-13 logic-to-breadboard）第 7 節：最近一次從邏輯圖轉換的設定；檢查分頁用它即時比對真值表。開別的電路時清掉。 */
  conversion: (VerifyMap & { switchTo: ConvertOptions['switchTo'] }) | null;
  compareLayout: 'side' | 'stacked';
  showCheck: boolean;
  routing: { startedAt: number; purpose: 'apply' | 'compare'; moveIcs: boolean } | null;
  comparison: Comparison | null;
  animation: WireAnimation | null;
  resultVisible: boolean;
  wireColor: string;
  viewport: Viewport;
  /** 使用者還沒自己縮放或平移：畫布大小改變（平板轉向、調整視窗）時自動重新 Fit to Screen。 */
  viewportAuto: boolean;
  /** 板上正在閃的孔（flashPoints）；id 每次加一，計時只清掉自己那一次。 */
  flash: { points: GridPoint[]; id: number } | null;
  canvasSize: { width: number; height: number };
  /** 子專案 18：正在雙擊編輯的便條。 */
  editingNote: string | null;
  rightTab: RightTab;
  dialog: Dialog;
  drawer: Drawer;
  toasts: Toast[];
  storageWarned: boolean;
  simulation: SimulationRun | null;
  /** 接線清單的勾選進度（不進 Undo；隨自動儲存與專案存檔保存）。 */
  checklist: ChecklistState;
}

export interface AppActions {
  undo(): void;
  redo(): void;
  /** 選取；keepTab 為 true 時不切換右側面板的分頁（例如從接線清單點選導線）。 */
  select(selection: Selection, options?: { keepTab?: boolean }): void;
  startPlacing(item: LibraryItem, dragging: boolean, origin?: { x: number; y: number }): void;
  setPlacingDragging(dragging: boolean): void;
  rotatePlacing(): void;
  cancelPlacing(): void;
  placeComponent(item: LibraryItem, rotation: Rotation, boardId: string, anchor: { x: number; y: number }): void;
  moveComponent(id: string, anchor: { x: number; y: number }, rotation?: Rotation, boardId?: string): void;
  rotateComponent(id: string): void;
  rotateSelection(): void;
  deleteSelection(): void;
  deleteComponent(id: string): void;
  deleteWire(id: string): void;
  /** 手動接線：兩孔之間的一條直線（規格 2026-10-10 straight-wires）；不合法時跳出提示、不建立。 */
  addWire(start: GridPoint, end: GridPoint): void;
  /** 拖曳導線的一端到 point；這條線變成直線導線。 */
  moveWireEnd(id: string, which: 'start' | 'end', point: GridPoint): void;
  addBoard(layoutId?: LayoutId): void;
  /** 移動麵包板（位移以格為單位，呼叫端先用 snapBoardMove 算好吸附與檢查）。 */
  moveBoards(ids: string[], dx: number, dy: number): void;
  removeBoard(id: string): void;
  detachBoard(id: string): void;
  updateProps(id: string, patch: ComponentProps): void;
  /** 子專案 14：開關第 index 個開關或 LED 的名稱（進 Undo）。 */
  setLabel(id: string, index: number, text: string): void;
  /** 在目前畫面中間新增便條，選取並開始編輯。 */
  addNoteAtCenter(): void;
  /** 子專案 20：在世界座標（mm，左上角）新增便條，選取並開始編輯（從元件庫拖曳放下）。 */
  addNoteAt(x: number, y: number): void;
  startNoteEdit(id: string): void;
  /** 結束編輯並寫回文字；空白時刪掉這張便條。 */
  finishNoteEdit(text: string): void;
  setNoteText(id: string, text: string): void;
  setNoteColor(id: string, color: NoteColor): void;
  setNoteTarget(id: string, target: string | null): void;
  /** 位置是世界座標 mm（會對齊格點）。 */
  moveNote(id: string, x: number, y: number): void;
  deleteNote(id: string): void;
  setSpan(id: string, span: number): void;
  toggleSwitch(id: string, index: number): void;
  setWireColors(ids: string[], color: string): void;
  setDefaultWireColor(color: string): void;
  clearWires(): void;
  setViewport(viewport: Viewport): void;
  setCanvasSize(width: number, height: number): void;
  zoomBy(factor: number): void;
  fitToScreen(): void;
  resetView(): void;
  focusPoints(points: GridPoint[]): void;
  /** 規格（2026-10-11 ai-links）第 4 節：點 AI 回答或說明裡的孔位：畫面移過去並閃一下；不改選取、不進 Undo。 */
  flashPoints(points: GridPoint[]): void;
  setRightTab(tab: RightTab): void;
  /** 子專案 17：取消選取、切到屬性分頁，看「這次佈線」。 */
  showRoutingSummary(): void;
  /** 切到右側面板的分頁並打開資訊抽屜（窄螢幕時面板平常收起來）；給面板以外的「顯示…」按鈕用。 */
  showRightTab(tab: RightTab): void;
  setShowCheck(show: boolean): void;
  runCheck(): void;
  runAutoRoute(purpose: 'apply' | 'compare', options?: { moveIcs?: boolean }): void;
  cancelRouting(): void;
  finishAnimation(): void;
  dismissResult(): void;
  setMode(mode: Mode): void;
  closeCompare(): void;
  applyComparison(): void;
  restoreManualWires(): void;
  setCompareLayout(layout: 'side' | 'stacked'): void;
  newCircuit(): void;
  loadCircuit(circuit: Circuit, name: string | null, message?: string, checklist?: ChecklistState, logic?: LogicDiagram): void;
  setWorkspace(workspace: 'breadboard' | 'logic'): void;
  /** 載入邏輯圖範例：麵包板清空，切到邏輯圖。 */
  loadExampleLogic(id: string): void;
  /** 規格第 2 節：邏輯圖轉成麵包板（取代目前的電路，一個 Undo 步驟），接著執行 AI 佈線（可移動 IC）。 */
  convertLogic(options: ConvertOptions): void;
  saveProject(name?: string): void;
  openProject(name: string): void;
  deleteProject(name: string): void;
  importJson(text: string): void;
  openDialog(dialog: Dialog): void;
  /** 打開某個抽屜；再按一次同一個（或傳 null）就關閉。寬螢幕時兩側面板一直顯示，不受影響。 */
  toggleDrawer(drawer: Drawer): void;
  closeDialog(): void;
  toast(kind: Toast['kind'], message: string): void;
  dismissToast(id: number): void;
  startSimulation(): void;
  stopSimulation(): void;
  toggleClockPause(): void;
  stepClock(): void;
  resetSimulation(): void;
  pressButton(id: string, down: boolean): void;
  tickSimulation(dtMs: number): void;
  setWireChecked(id: string, checked: boolean): void;
  clearChecklist(): void;
}

export type Store = AppState & AppActions;

// ---------- 衍生狀態 ----------

/** 模式由資料推導，不另外存，所以一定和 Undo / Redo 一致。 */
export function deriveMode(s: Pick<AppState, 'view' | 'circuit'>): Mode {
  if (s.view === 'compare') return 'compare';
  const wires = s.circuit.wires;
  return wires.length > 0 && wires.every((w) => w.source === 'auto') ? 'auto' : 'manual';
}

export function isComparisonFresh(s: Pick<AppState, 'comparison' | 'circuit'>): boolean {
  const c = s.comparison;
  return c !== null && c.boards === s.circuit.boards && (c.components === s.circuit.components || c.appliedComponents === s.circuit.components);
}

/** 子專案 17：已經套用到電路上、還沒過期的佈線結果（「這次佈線」說明用）；比較畫面時是 null。 */
export function appliedRouting(s: Pick<AppState, 'comparison' | 'circuit' | 'view'>): Comparison | null {
  if (!s.comparison || s.view === 'compare' || !isComparisonFresh(s)) return null;
  return s.circuit.wires.some((w) => w.source === 'auto') ? s.comparison : null;
}

/** 比較畫面左右兩邊的電路：左邊是佈線前的元件與手動導線，右邊是（搬移後的）元件與 AI 導線。 */
export function comparisonSides(c: Comparison): { before: Circuit; after: Circuit } {
  return {
    before: { version: 1, boards: c.boards, components: c.components, wires: c.beforeWires },
    after: { version: 1, boards: c.boards, components: applyMoves(c.components, c.result.moves ?? []), wires: c.result.wires },
  };
}

const NO_MOVES: IcMove[] = [];

/** 板上現在是套用了有搬移 IC 的結果時，回傳那些搬移（接線清單要先提醒把 IC 插到新位置）；否則回傳同一個空陣列。 */
export function appliedMoves(s: Pick<AppState, 'comparison' | 'circuit'>): IcMove[] {
  const c = s.comparison;
  if (!c || c.appliedComponents === null || c.appliedComponents !== s.circuit.components || c.boards !== s.circuit.boards) return NO_MOVES;
  return c.result.moves ?? NO_MOVES;
}

/** Undo 紀錄的名稱。 */
function routingLabel(result: RoutingResult): string {
  return result.moves ? 'AI 佈線（可移動 IC）' : 'AI 標準佈線';
}

/** 套用之後記住新的元件陣列，讓「切回手動接線」與比較畫面仍認得這份對照。 */
function withApplied(c: Comparison, applied: Circuit): Comparison {
  return { ...c, appliedComponents: applied.components !== c.components ? applied.components : null };
}

export function isDirty(s: Pick<AppState, 'circuit' | 'savedCircuit'>): boolean {
  const c = s.circuit;
  // 邏輯圖也算（子專案 12）。
  if (logicDirty()) return true;
  return c !== s.savedCircuit && (c.components.length > 0 || c.wires.length > 0 || c.boards.length > 1);
}

function pruneSelection(selection: Selection, circuit: Circuit): Selection {
  if (!selection) return null;
  switch (selection.kind) {
    case 'component':
      return circuit.components.some((c) => c.id === selection.id) ? selection : null;
    case 'pin':
      return circuit.components.some((c) => c.id === selection.componentId) ? selection : null;
    case 'wire':
      return circuit.wires.some((w) => w.id === selection.id) ? selection : null;
    case 'board':
      return circuit.boards.some((b) => b.id === selection.id) ? selection : null;
    case 'net':
      return analyzeCircuit(circuit).netById.has(selection.netId) ? selection : null;
    case 'issue':
      return null;
    case 'note':
      return (circuit.notes ?? []).some((n) => n.id === selection.id) ? selection : null;
    default:
      return selection;
  }
}

function componentName(circuit: Circuit, id: string): string {
  const c = circuit.components.find((x) => x.id === id);
  const def = c ? getComponentDefinition(c.defId) : undefined;
  return def ? `${def.name} ${id}` : id;
}

// ---------- 模組層級的非序列化狀態 ----------

const TOAST_MS: Record<Toast['kind'], number> = { info: 2500, success: 3500, warning: 5000, error: 7000 };

let routingJob: RoutingJob | null = null;
let simTimer: ReturnType<typeof setInterval> | null = null;
let simHintShown = false;

function simInputs(circuit: Circuit, run: Pick<SimulationRun, 'time' | 'pressed'>): SimInputs {
  const clocks: Record<string, 0 | 1> = {};
  for (const c of compileSimulation(circuit).clocks) clocks[c.componentId] = clockLevel(c.frequency, run.time);
  return { pressed: run.pressed, clocks };
}

/** 依目前的電路與輸入重新算到穩定；電路被編輯時沿用 IC 的內部狀態（fresh = 回到上電狀態）。 */
export function resimulate(circuit: Circuit, run: Omit<SimulationRun, 'result'> & { result?: SimResult }, fresh = false): SimulationRun {
  const sim = compileSimulation(circuit);
  const state = fresh ? initialSimState(sim) : adoptSimState(sim, run.state);
  const settled = settle(sim, state, simInputs(circuit, run));
  return { time: run.time, paused: run.paused, pressed: run.pressed, state: settled.state, result: settled.result };
}
let animationTimer: ReturnType<typeof setTimeout> | null = null;
let toastId = 1;

/** 寬螢幕（≥ 1024 px，Tailwind 的 lg）：左右面板一直顯示，不用抽屜。 */
function wideLayout(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1024px)').matches;
}
let animationKey = 1;

function clearAnimationTimer() {
  if (animationTimer) clearTimeout(animationTimer);
  animationTimer = null;
}

/** 搬過的 IC 先標示這麼久，導線才開始出現。 */
export const MOVE_HIGHLIGHT_MS = 600;

/** 依佈線順序逐條描線：每條最多間隔 160 ms，總長約 2.5 秒內；有搬移 IC 時整體延後 MOVE_HIGHLIGHT_MS。 */
export function planAnimation(wires: Wire[], moves: IcMove[] = []): WireAnimation {
  const n = wires.length;
  const offset = moves.length > 0 ? MOVE_HIGHLIGHT_MS : 0;
  const stepMs = n > 0 ? Math.min(160, 2000 / n) : 0;
  const drawMs = Math.max(260, Math.min(520, stepMs * 3));
  const delays: Record<string, number> = {};
  wires.forEach((w, i) => (delays[w.id] = offset + Math.round(i * stepMs)));
  return { key: animationKey++, delays, drawMs, totalMs: offset + Math.round((n - 1) * stepMs + drawMs), moves };
}

/** 初始狀態（有自動儲存就還原）。測試也用它重設 store。 */
/** 子專案 15：記住上次看的是邏輯圖還是麵包板（只存在這台電腦的瀏覽器）。 */
const WORKSPACE_KEY = 'breadboard-lab:workspace';

function readWorkspace(): 'breadboard' | 'logic' {
  try {
    return globalThis.localStorage?.getItem(WORKSPACE_KEY) === 'logic' ? 'logic' : 'breadboard';
  } catch {
    return 'breadboard';
  }
}

function writeWorkspace(workspace: 'breadboard' | 'logic'): void {
  try {
    globalThis.localStorage?.setItem(WORKSPACE_KEY, workspace);
  } catch {
    // 瀏覽器不允許時就不記。
  }
}

/** 孔位閃爍的時間。 */
export const FLASH_MS = 2000;

export function initialState(): AppState {
  const restored = typeof window !== 'undefined' ? persistence.loadAutosave() : null;
  const circuit = restored?.circuit ?? emptyCircuit();
  return {
    circuit,
    history: emptyHistory(),
    projectName: restored?.name || null,
    // 重新整理前有未儲存的修改：沒有「上次存檔」的電路，isDirty 才會繼續成立。
    savedCircuit: restored?.unsaved ? null : circuit,
    selection: null,
    placing: null,
    view: 'edit',
    workspace: readWorkspace(),
    conversion: null,
    compareLayout: 'stacked',
    showCheck: false,
    routing: null,
    comparison: null,
    animation: null,
    resultVisible: false,
    wireColor: DEFAULT_WIRE_COLOR,
    viewport: DEFAULT_VIEWPORT,
    viewportAuto: true,
    flash: null,
    canvasSize: { width: 1200, height: 700 },
    editingNote: null,
    rightTab: 'inspect',
    dialog: null,
    drawer: null,
    toasts: [],
    storageWarned: false,
    simulation: null,
    checklist: restored?.checklist ?? {},
  };
}

export const useStore = create<Store>()((set, get) => {
  /** 記錄一個可 Undo 的動作。 */
  const commit = (label: string, next: Circuit, extra: Partial<AppState> = {}) => {
    const s = get();
    if (next === s.circuit) return;
    clearAnimationTimer();
    const { selection: requested, ...rest } = extra;
    set({
      circuit: next,
      history: record(s.history, s.circuit, label),
      selection: pruneSelection(requested !== undefined ? requested : s.selection, next),
      animation: null,
      simulation: s.simulation ? resimulate(next, s.simulation) : null,
      ...rest,
    });
    syncSimTimer();
  };

  /** 有模擬、沒暫停、而且電路裡有時脈時才讓計時器跑。 */
  const syncSimTimer = () => {
    const s = get();
    const run = s.simulation;
    const shouldRun = !!run && !run.paused && compileSimulation(s.circuit).clocks.length > 0;
    if (shouldRun && !simTimer) simTimer = setInterval(() => get().tickSimulation(SIM_TICK_MS), SIM_TICK_MS);
    if (!shouldRun && simTimer) {
      clearInterval(simTimer);
      simTimer = null;
    }
  };

  const guardSimulation = (): boolean => {
    if (get().simulation) {
      get().toast('info', '模擬中不能改變電路結構。請先按「■ 停止」再編輯。');
      return true;
    }
    return false;
  };

  const guardRouting = (): boolean => {
    if (get().routing) {
      get().toast('info', 'AI 標準佈線計算中，請稍候或先取消');
      return true;
    }
    return false;
  };

  /** 結構編輯（放置、移動、旋轉、刪除、接線、自動佈線…）在佈線計算中或模擬中都不允許。 */
  const guardEdit = (): boolean => guardRouting() || guardSimulation();

  const startAnimation = (wires: Wire[], moves: IcMove[] = []) => {
    clearAnimationTimer();
    const animation = planAnimation(wires, moves);
    set({ animation, resultVisible: false });
    animationTimer = setTimeout(() => get().finishAnimation(), animation.totalMs + 120);
  };

  return {
    ...initialState(),

    undo() {
      if (guardRouting()) return;
      const s = get();
      const step = undo(s.history, s.circuit);
      if (!step) return;
      clearAnimationTimer();
      set({
        circuit: step.state,
        history: step.history,
        selection: pruneSelection(s.selection, step.state),
        animation: null,
        resultVisible: false,
        simulation: s.simulation ? resimulate(step.state, s.simulation) : null,
      });
      syncSimTimer();
      get().toast('info', `已復原：${step.label}`);
    },

    redo() {
      if (guardRouting()) return;
      const s = get();
      const step = redo(s.history, s.circuit);
      if (!step) return;
      clearAnimationTimer();
      set({
        circuit: step.state,
        history: step.history,
        selection: pruneSelection(s.selection, step.state),
        animation: null,
        resultVisible: false,
        simulation: s.simulation ? resimulate(step.state, s.simulation) : null,
      });
      syncSimTimer();
      get().toast('info', `已重做：${step.label}`);
    },

    select(selection, options) {
      const inspect = selection !== null && selection.kind !== 'issue' && !options?.keepTab;
      set({ selection, rightTab: inspect ? 'inspect' : get().rightTab });
    },

    startPlacing(item, dragging, origin) {
      if (guardEdit() || !getComponentDefinition(item.defId)) return;
      // 從抽屜裡的元件庫拿起元件時收起抽屜，才點得到麵包板。
      set({ placing: { item, rotation: 0, dragging, origin: origin ?? null }, selection: null, view: 'edit', drawer: null });
    },

    setPlacingDragging(dragging) {
      const placing = get().placing;
      if (placing) set({ placing: { ...placing, dragging } });
    },

    rotatePlacing() {
      const placing = get().placing;
      if (placing) set({ placing: { ...placing, rotation: (((placing.rotation + 90) % 360) as Rotation) } });
    },

    cancelPlacing() {
      set({ placing: null });
    },

    placeComponent(item, rotation, boardId, anchor) {
      if (guardEdit()) return;
      const s = get();
      const { circuit, id } = addComponent(s.circuit, { defId: item.defId, rotation, props: item.props, span: item.span }, boardId, anchor);
      commit(`放置 ${item.name} ${id}`, circuit, { selection: { kind: 'component', id }, placing: null });
    },

    moveComponent(id, anchor, rotation, boardId) {
      if (guardEdit()) return;
      const s = get();
      commit(`移動 ${componentName(s.circuit, id)}`, moveComponent(s.circuit, id, anchor, rotation, boardId));
    },

    rotateComponent(id) {
      if (guardEdit()) return;
      const s = get();
      const next = rotateComponent(s.circuit, id);
      if (!next) {
        get().toast('warning', `${componentName(s.circuit, id)} 四周空間不足，無法旋轉`);
        return;
      }
      commit(`旋轉 ${componentName(s.circuit, id)}`, next);
    },

    rotateSelection() {
      const s = get();
      if (s.placing) return s.rotatePlacing();
      const sel = s.selection;
      if (sel?.kind === 'component') s.rotateComponent(sel.id);
      else if (sel?.kind === 'pin') s.rotateComponent(sel.componentId);
    },

    deleteSelection() {
      const sel = get().selection;
      if (sel?.kind === 'component') get().deleteComponent(sel.id);
      else if (sel?.kind === 'pin') get().deleteComponent(sel.componentId);
      else if (sel?.kind === 'wire') get().deleteWire(sel.id);
      else if (sel?.kind === 'board') get().removeBoard(sel.id);
      else if (sel?.kind === 'note') get().deleteNote(sel.id);
    },

    deleteComponent(id) {
      if (guardEdit()) return;
      const s = get();
      commit(`刪除 ${componentName(s.circuit, id)}`, removeItems(s.circuit, { componentIds: [id] }), { selection: null });
    },

    deleteWire(id) {
      if (guardEdit()) return;
      const s = get();
      commit(`刪除導線 ${id}`, removeItems(s.circuit, { wireIds: [id] }), { selection: null });
    },

    addWire(start, end) {
      if (guardEdit()) return;
      const s = get();
      const problem = straightWireProblem(s.circuit, start, end);
      if (problem) {
        if (problem.kind !== 'same-hole') get().toast('warning', straightProblemText(s.circuit, problem));
        return;
      }
      const color = defaultWireColor(s.circuit, start, end, s.wireColor);
      const { circuit, id } = addWire(s.circuit, start, end, color);
      commit(`接線 ${id}`, circuit, { selection: { kind: 'wire', id } });
    },

    moveWireEnd(id, which, point) {
      if (guardEdit()) return;
      const s = get();
      const w = s.circuit.wires.find((x) => x.id === id);
      if (!w) return;
      const current = which === 'start' ? w.start : w.end;
      if (current.boardId === point.boardId && current.x === point.x && current.y === point.y) return;
      const [start, end] = which === 'start' ? [point, w.end] : [w.start, point];
      const problem = straightWireProblem(s.circuit, start, end, id);
      if (problem) {
        if (problem.kind !== 'same-hole') get().toast('warning', straightProblemText(s.circuit, problem));
        return;
      }
      commit(`移動導線 ${id} 的端點`, moveWireEnd(s.circuit, id, which, point), { selection: { kind: 'wire', id } });
    },

    addBoard(layoutId) {
      if (guardEdit()) return;
      const added = addBoard(get().circuit, layoutId);
      if (!added) {
        get().toast('warning', `最多只能放 ${MAX_BOARDS} 塊麵包板`);
        return;
      }
      commit(`新增麵包板 ${added.id}（${getLayout(layoutId ?? 'MB102').name}）`, added.circuit, { selection: { kind: 'board', id: added.id }, view: 'edit' });
      get().fitToScreen();
      get().toast('info', `已新增麵包板 ${added.id}。拖曳它沒有孔的地方，靠近另一塊板的邊就會自動吸附成群組。`);
    },

    moveBoards(ids, dx, dy) {
      if (guardEdit()) return;
      const s = get();
      const problem = boardMoveProblem(s.circuit, ids, Math.round(dx), Math.round(dy));
      if (problem === 'overlap') {
        get().toast('warning', '麵包板不能重疊，已放回原位');
        return;
      }
      if (problem === 'wires') {
        const wires = crossBoardWires(s.circuit, ids);
        get().toast('warning', `有 ${wires.length} 條導線（${wires.map((w) => w.id).join('、')}）連到群組裡的其他麵包板，不能把這塊板拆開。請先刪除這些導線，或拖曳整個群組。`);
        return;
      }
      const label = ids.length === 1 ? `移動麵包板 ${ids[0]}` : `移動麵包板群組（${ids.join('、')}）`;
      commit(label, moveBoards(s.circuit, ids, dx, dy));
    },

    removeBoard(id) {
      if (guardEdit()) return;
      const s = get();
      const next = removeBoard(s.circuit, id);
      if (!next) {
        if (s.circuit.boards.some((b) => b.id === id)) get().toast('warning', '至少要保留一塊麵包板');
        return;
      }
      const parts = s.circuit.components.length - next.components.length;
      const wires = s.circuit.wires.length - next.wires.length;
      commit(`刪除麵包板 ${id}`, next, { selection: null });
      const extra = parts + wires > 0 ? `（連同 ${parts} 個元件、${wires} 條導線）` : '';
      get().toast('info', `已刪除麵包板 ${id}${extra}，可以按 Ctrl+Z 復原`);
    },

    detachBoard(id) {
      if (guardEdit()) return;
      const s = get();
      if (groupMembers(s.circuit, id).length < 2) {
        get().toast('info', `${id} 沒有和其他麵包板貼在一起`);
        return;
      }
      const wires = crossBoardWires(s.circuit, [id]);
      if (wires.length > 0) {
        get().toast('warning', `${id} 有 ${wires.length} 條導線（${wires.map((w) => w.id).join('、')}）連到群組裡的其他麵包板，請先刪除這些導線再移出群組`);
        return;
      }
      const next = detachBoard(s.circuit, id);
      if (next) commit(`移出群組 ${id}`, next);
    },

    // ---- 子專案 18：便條（不是結構編輯，佈線、模擬中也可以改） ----
    addNoteAtCenter() {
      const s = get();
      const center = screenToWorld(s.viewport, s.canvasSize.width / 2, s.canvasSize.height / 2);
      get().addNoteAt(center.x / MM_TO_PX - NOTE_WIDTH_MM / 2, center.y / MM_TO_PX - 2.54);
    },

    addNoteAt(x, y) {
      const { circuit, id } = addNote(get().circuit, x, y);
      commit(`新增便條 ${id}`, circuit, { selection: { kind: 'note', id }, editingNote: id });
    },

    startNoteEdit(id) {
      if ((get().circuit.notes ?? []).some((n) => n.id === id)) set({ editingNote: id, selection: { kind: 'note', id } });
    },

    finishNoteEdit(text) {
      const id = get().editingNote;
      if (!id) return;
      set({ editingNote: null });
      if (!text.trim()) get().deleteNote(id);
      else get().setNoteText(id, text);
    },

    setNoteText(id, text) {
      commit(`修改便條 ${id}`, setNoteText(get().circuit, id, text));
    },

    setNoteColor(id, color) {
      commit(`便條 ${id} 換顏色`, setNoteColor(get().circuit, id, color));
    },

    setNoteTarget(id, target) {
      commit(target ? `便條 ${id} 指向 ${target}` : `便條 ${id} 不指向元件`, setNoteTarget(get().circuit, id, target));
    },

    moveNote(id, x, y) {
      commit(`移動便條 ${id}`, moveNote(get().circuit, id, x, y));
    },

    deleteNote(id) {
      commit(`刪除便條 ${id}`, removeNote(get().circuit, id), { selection: null, editingNote: null });
    },

    setLabel(id, index, text) {
      if (guardEdit()) return;
      commit(`修改 ${componentName(get().circuit, id)} 的名稱`, setLabel(get().circuit, id, index, text));
    },

    updateProps(id, patch) {
      const s = get();
      commit(`修改 ${componentName(s.circuit, id)}`, updateComponentProps(s.circuit, id, patch));
    },

    setSpan(id, span) {
      if (guardEdit()) return;
      const s = get();
      const next = setComponentSpan(s.circuit, id, span);
      if (!next) {
        get().toast('warning', `無法把 ${componentName(s.circuit, id)} 的跨距改成 ${span}：腳會超出板子或插到已被佔用的孔`);
        return;
      }
      commit(`修改 ${componentName(s.circuit, id)} 跨距`, next);
    },

    toggleSwitch(id, index) {
      const s = get();
      commit(`切換 ${componentName(s.circuit, id)} 第 ${index + 1} 個開關`, toggleSwitch(s.circuit, id, index));
    },

    setWireColors(ids, color) {
      const s = get();
      commit(`導線改色`, setWireColor(s.circuit, ids, color));
    },

    setDefaultWireColor(color) {
      set({ wireColor: color });
    },

    clearWires() {
      if (guardEdit()) return;
      const s = get();
      if (s.circuit.wires.length === 0) return;
      commit('清除所有導線', replaceWires(s.circuit, []), { selection: null });
    },

    setViewport(viewport) {
      set({ viewport, viewportAuto: false });
    },

    setCanvasSize(width, height) {
      const s = get();
      if (s.canvasSize.width === width && s.canvasSize.height === height) return;
      set({ canvasSize: { width, height } });
      if (s.viewportAuto && width > 0 && height > 0) get().fitToScreen();
    },

    zoomBy(factor) {
      const s = get();
      set({ viewport: zoomAt(s.viewport, factor, s.canvasSize.width / 2, s.canvasSize.height / 2), viewportAuto: false });
    },

    fitToScreen() {
      const s = get();
      const bounds = worldBounds(boardFrames(s.circuit));
      if (bounds) set({ viewport: fitRect(bounds, s.canvasSize.width, s.canvasSize.height, 28), viewportAuto: true });
    },

    resetView() {
      const s = get();
      const bounds = worldBounds(boardFrames(s.circuit));
      set({
        viewport: bounds ? centerOn({ ...DEFAULT_VIEWPORT, scale: 1 }, bounds, s.canvasSize.width, s.canvasSize.height) : DEFAULT_VIEWPORT,
        viewportAuto: false,
      });
    },

    flashPoints(points) {
      if (points.length === 0) return;
      get().focusPoints(points);
      const id = (get().flash?.id ?? 0) + 1;
      set({ flash: { points, id } });
      setTimeout(() => {
        if (get().flash?.id === id) set({ flash: null });
      }, FLASH_MS);
    },

    focusPoints(points) {
      const s = get();
      const rect = gridBounds(boardFrames(s.circuit), points, 3);
      if (rect) set({ viewport: centerOn(s.viewport, rect, s.canvasSize.width, s.canvasSize.height), viewportAuto: false });
    },

    showRoutingSummary() {
      set({ selection: null });
      get().setRightTab('inspect');
    },

    setRightTab(rightTab) {
      set({ rightTab });
    },

    showRightTab(rightTab) {
      // 寬螢幕不碰抽屜狀態，之後視窗變窄時才不會突然冒出抽屜。
      set(wideLayout() ? { rightTab } : { rightTab, drawer: 'info' });
    },

    setShowCheck(showCheck) {
      set({ showCheck });
    },

    runCheck() {
      const analysis = analyzeCircuit(get().circuit);
      set({ showCheck: true, rightTab: 'check', view: 'edit' });
      if (analysis.errorCount > 0) get().toast('error', `Check Circuit：${analysis.errorCount} 個錯誤、${analysis.warningCount} 個警告`);
      else if (analysis.warningCount > 0) get().toast('warning', `Check Circuit：沒有錯誤，${analysis.warningCount} 個警告`);
      else get().toast('success', '✓ Circuit Valid：電路檢查通過');
    },

    runAutoRoute(purpose, options = {}) {
      const moveIcs = options.moveIcs === true;
      const s = get();
      if (s.routing || guardSimulation()) return;
      const circuit = s.circuit;
      if (circuit.components.length === 0) {
        get().toast('warning', '板上還沒有元件。先放置元件並手動接線，再執行 AI 標準佈線。');
        return;
      }
      clearAnimationTimer();
      set({ routing: { startedAt: performance.now(), purpose, moveIcs }, animation: null, resultVisible: false, placing: null });
      const job = startRouting(circuit, undefined, { moveIcs });
      routingJob = job;
      job.promise
        .then((result) => {
          if (routingJob !== job) return;
          const now = get();
          if (now.circuit !== circuit) {
            get().toast('warning', '電路在計算期間被修改，已捨棄這次的佈線結果');
            return;
          }
          const comparison: Comparison = {
            beforeWires: circuit.wires,
            beforeScore: analyzeCircuit(circuit).routing,
            result,
            components: circuit.components,
            boards: circuit.boards,
            appliedComponents: null,
          };
          if (result.status === 'success' && result.wires.length === 0) {
            set({ comparison: null });
            get().toast(
              'info',
              circuit.wires.length === 0
                ? 'AI 標準佈線會保留你接線所定義的電氣連接。請先手動接線，告訴系統哪些腳要連在一起。'
                : '沒有需要用導線連接的 Net（每個 Net 都已經在同一個導通群組裡）。',
            );
            return;
          }
          if (purpose === 'compare') {
            set({ comparison, view: 'compare' });
            return;
          }
          if (result.status !== 'success') {
            set({ comparison, resultVisible: true });
            return;
          }
          const applied = applyRouting(circuit, result);
          commit(routingLabel(result), applied, { comparison: withApplied(comparison, applied), selection: null, view: 'edit' });
          startAnimation(get().circuit.wires, result.moves ?? []);
        })
        .catch((err: unknown) => {
          if (err instanceof RoutingCancelled) get().toast('info', '已取消 AI 標準佈線');
          else get().toast('error', `AI 標準佈線失敗：${err instanceof Error ? err.message : String(err)}`);
        })
        .finally(() => {
          if (routingJob === job) {
            routingJob = null;
            set({ routing: null });
          }
        });
    },

    cancelRouting() {
      routingJob?.cancel();
    },

    finishAnimation() {
      clearAnimationTimer();
      if (get().animation) set({ animation: null, resultVisible: true });
    },

    dismissResult() {
      set({ resultVisible: false });
    },

    setMode(mode) {
      const s = get();
      if (s.routing || guardSimulation()) return;
      // 導線目前是手動還是自動，與「是否正在看比較畫面」無關。
      const wires = deriveMode({ view: 'edit', circuit: s.circuit });
      if (mode === 'compare') {
        if (isComparisonFresh(s)) set({ view: 'compare', placing: null });
        else s.runAutoRoute('compare');
        return;
      }
      set({ view: 'edit' });
      if (mode === 'auto' && wires !== 'auto') s.runAutoRoute('apply');
      if (mode === 'manual' && wires === 'auto') s.restoreManualWires();
    },

    closeCompare() {
      set({ view: 'edit' });
    },

    applyComparison() {
      if (guardSimulation()) return;
      const s = get();
      const cmp = s.comparison;
      if (!cmp || !isComparisonFresh(s) || cmp.result.status !== 'success') return;
      const applied = applyRouting(s.circuit, cmp.result);
      commit(routingLabel(cmp.result), applied, { view: 'edit', selection: null, comparison: withApplied(cmp, applied) });
      startAnimation(get().circuit.wires, cmp.result.moves ?? []);
    },

    restoreManualWires() {
      if (guardSimulation()) return;
      const s = get();
      if (!s.comparison || !isComparisonFresh(s)) {
        get().toast('info', '找不到佈線前的手動導線（元件或麵包板已經變動）。可以用 Undo 回到之前的狀態。');
        return;
      }
      const cmp = s.comparison;
      commit('切回手動接線', { ...replaceWires(s.circuit, cmp.beforeWires), components: cmp.components }, { view: 'edit', selection: null });
    },

    setCompareLayout(compareLayout) {
      set({ compareLayout });
    },

    newCircuit() {
      if (guardRouting()) return;
      get().loadCircuit(emptyCircuit(), null, '已建立新電路');
    },

    loadCircuit(circuit, name, message, checklist, logic) {
      if (guardRouting()) return;
      clearAnimationTimer();
      set({
        simulation: null,
        checklist: checklist ?? {},
        circuit,
        history: emptyHistory(),
        projectName: name,
        savedCircuit: circuit,
        selection: null,
        placing: null,
        view: 'edit',
        comparison: null,
        animation: null,
        resultVisible: false,
        showCheck: false,
        editingNote: null,
        dialog: null,
      });
      useLogic.getState().load(logic ?? emptyDiagram());
      set({ conversion: null });
      syncSimTimer();
      get().fitToScreen();
      if (message) get().toast('success', message);
    },

    setWorkspace(workspace) {
      if (workspace === get().workspace) return;
      useLogic.getState().startPlacing(null);
      set({ workspace, placing: null, drawer: null });
      writeWorkspace(workspace);
    },

    convertLogic(options) {
      if (guardEdit()) return;
      const result = toBreadboard(useLogic.getState().diagram, options);
      if (!result.ok) {
        get().toast('error', result.reason);
        return;
      }
      commit('邏輯圖轉成麵包板', result.circuit, { selection: null });
      set({
        workspace: 'breadboard',
        dialog: null,
        conversion: { switchTo: options.switchTo, switchId: result.switchId, inputs: result.inputs, leds: result.leds, displays: result.displays },
      });
      writeWorkspace('breadboard');
      get().fitToScreen();
      get().runAutoRoute('apply', { moveIcs: true });
      // 子專案 14：「自動」選了 MB-102 但 AI 佈線排不完時（例如只用 NAND，連線比較多），改用 EIC-1106 再轉一次。
      if (options.board === 'auto' && result.bom.layout === 'MB102') {
        const converted = result.circuit;
        const off = useStore.subscribe((s, prev) => {
          if (!prev.routing || s.routing) return;
          off();
          const done = s.comparison;
          if (!done || done.beforeWires !== converted.wires || done.result.status === 'success') return;
          if (s.circuit !== converted) return;
          get().toast('info', 'MB-102 上的線排不完，改用 EIC-1106 大型麵包板再轉一次');
          get().convertLogic({ ...options, board: 'EIC1106' });
        });
      }
    },

    loadExampleLogic(id) {
      const ex = LOGIC_EXAMPLES.find((e) => e.id === id);
      if (!ex) return;
      get().loadCircuit(emptyCircuit(), ex.name, `已載入範例「${ex.name}」：${ex.description}`, undefined, ex.build());
      set({ workspace: 'logic' });
      writeWorkspace('logic');
    },

    saveProject(name) {
      const s = get();
      const target = (name ?? s.projectName ?? '').trim();
      if (!target) {
        set({ dialog: 'save-as' });
        return;
      }
      if (!persistence.saveProject(target, s.circuit, pruneChecklist(s.checklist, s.circuit), useLogic.getState().diagram)) {
        get().toast('error', '無法儲存：瀏覽器不允許使用本機儲存空間。請改用「匯出 JSON」。');
        return;
      }
      useLogic.getState().markSaved();
      set({ projectName: target, savedCircuit: s.circuit, dialog: null });
      get().toast('success', `已儲存「${target}」`);
    },

    openProject(name) {
      const result = persistence.loadProject(name);
      if (!result.ok) {
        get().toast('error', result.error);
        return;
      }
      get().loadCircuit(result.circuit, name, `已開啟「${name}」`, result.checklist, result.logic);
    },

    deleteProject(name) {
      if (persistence.deleteProject(name)) get().toast('info', `已刪除專案「${name}」`);
      if (get().projectName === name) set({ projectName: null });
    },

    importJson(text) {
      const result = parseCircuitText(text);
      if (!result.ok) {
        get().toast('error', `匯入失敗：${result.error}`);
        return;
      }
      get().loadCircuit(result.circuit, result.name, `已匯入${result.name ? `「${result.name}」` : ' JSON'}`, result.checklist, result.logic);
    },

    openDialog(dialog) {
      set({ dialog });
    },

    toggleDrawer(drawer) {
      set({ drawer: drawer === null || get().drawer === drawer ? null : drawer });
    },

    closeDialog() {
      set({ dialog: null });
    },

    toast(kind, message) {
      const id = toastId++;
      set({ toasts: [...get().toasts.slice(-3), { id, kind, message }] });
      // 長訊息多留一點時間閱讀。
      setTimeout(() => get().dismissToast(id), Math.max(TOAST_MS[kind], 1500 + message.length * 50));
    },

    dismissToast(id) {
      set({ toasts: get().toasts.filter((t) => t.id !== id) });
    },

    startSimulation() {
      const s = get();
      if (s.simulation || guardRouting()) return;
      clearAnimationTimer();
      const run = resimulate(s.circuit, { time: 0, paused: false, pressed: {}, state: { models: {}, outputs: {} } }, true);
      set({ simulation: run, placing: null, view: 'edit', animation: null, resultVisible: false });
      syncSimTimer();
      const sim = compileSimulation(s.circuit);
      if (sim.ics.length === 0 && sim.leds.length === 0) get().toast('info', '模擬已開始，但電路中沒有 IC 或 LED 可以觀察。');
      else if (run.result.unpowered.length > 0) get().toast('warning', `${run.result.unpowered.join('、')} 沒有接好 VCC / GND，不會運作。`);
      else if (!simHintShown) {
        simHintShown = true;
        get().toast('success', '模擬開始：點指撥開關切換 ON / OFF、按住按鈕，LED 與腳位電位會即時更新。');
      }
    },

    stopSimulation() {
      if (!get().simulation) return;
      set({ simulation: null });
      syncSimTimer();
    },

    toggleClockPause() {
      const run = get().simulation;
      if (!run) return;
      set({ simulation: { ...run, paused: !run.paused } });
      syncSimTimer();
    },

    stepClock() {
      const s = get();
      const run = s.simulation;
      if (!run) return;
      const next = nextClockEdge(
        compileSimulation(s.circuit).clocks.map((c) => c.frequency),
        run.time,
      );
      if (next === null) {
        get().toast('info', '電路中沒有時脈元件（Clock）。可以從元件庫的「輸入」放一個。');
        return;
      }
      set({ simulation: resimulate(s.circuit, { ...run, time: next, paused: true }) });
      syncSimTimer();
    },

    resetSimulation() {
      const s = get();
      if (!s.simulation) return;
      set({ simulation: resimulate(s.circuit, { ...s.simulation, time: 0, pressed: {} }, true) });
      syncSimTimer();
    },

    pressButton(id, down) {
      const s = get();
      const run = s.simulation;
      if (!run || (run.pressed[id] ?? false) === down) return;
      set({ simulation: resimulate(s.circuit, { ...run, pressed: { ...run.pressed, [id]: down } }) });
    },

    setWireChecked(id, checked) {
      const s = get();
      const wire = s.circuit.wires.find((w) => w.id === id);
      if (wire) set({ checklist: setChecked(s.checklist, wire, checked) });
    },

    clearChecklist() {
      if (Object.keys(get().checklist).length > 0) set({ checklist: {} });
    },

    tickSimulation(dtMs) {
      const s = get();
      const run = s.simulation;
      if (!run || run.paused) return;
      const time = run.time + dtMs;
      const clocks = compileSimulation(s.circuit).clocks;
      const changed = clocks.some((c) => clockLevel(c.frequency, run.time) !== clockLevel(c.frequency, time));
      set({ simulation: changed ? resimulate(s.circuit, { ...run, time }) : { ...run, time } });
    },
  };
});

// ---------- 自動儲存 ----------

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

/** 電路、專案名稱、存檔狀態或接線清單的勾選改變後 400 ms 寫入 localStorage；第一次失敗時提示一次。 */
export function startAutosave(): () => void {
  const schedule = () => {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      const now = useStore.getState();
      const checklist = pruneChecklist(now.checklist, now.circuit);
      if (!persistence.writeAutosave(now.circuit, now.projectName, checklist, isDirty(now), useLogic.getState().diagram) && !now.storageWarned) {
        useStore.setState({ storageWarned: true });
        now.toast('warning', '瀏覽器不允許使用本機儲存空間，無法自動儲存。請記得「匯出 JSON」。');
      }
    }, 400);
  };
  const offStore = useStore.subscribe((s, prev) => {
    if (s.circuit === prev.circuit && s.projectName === prev.projectName && s.checklist === prev.checklist && s.savedCircuit === prev.savedCircuit) return;
    schedule();
  });
  // 邏輯圖（含開關狀態）改變也要暫存。
  const offLogic = useLogic.subscribe((l, prev) => {
    if (l.diagram !== prev.diagram || l.saved !== prev.saved) schedule();
  });
  return () => {
    offStore();
    offLogic();
  };
}
