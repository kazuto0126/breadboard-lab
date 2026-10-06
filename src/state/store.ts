import { create } from 'zustand';
import { getComponentDefinition } from '../core/circuit/library';
import { applyRouting } from '../core/routing/apply';
import { analyzeCircuit } from '../editor/analysis';
import {
  addComponent,
  addWire,
  moveComponent,
  removeItems,
  replaceWires,
  rotateComponent,
  setComponentSpan,
  setWireColor,
  toggleSwitch,
  updateComponentProps,
} from '../editor/commands';
import { emptyCircuit, parseCircuitText } from '../editor/fileFormat';
import { boardFrames, gridBounds, worldBounds } from '../editor/geometry';
import { emptyHistory, record, redo, undo, type History } from '../editor/history';
import type { LibraryItem } from '../editor/library';
import { DEFAULT_WIRE_COLOR, defaultWireColor } from '../editor/manualWire';
import { centerOn, DEFAULT_VIEWPORT, fitRect, zoomAt, type Viewport } from '../editor/viewport';
import type { Circuit, Wire } from '../types/circuit';
import type { ComponentInstance, ComponentProps, Rotation } from '../types/component';
import type { GridPoint } from '../types/geometry';
import type { RoutingMetrics, RoutingResult } from '../types/routing';
import { RoutingCancelled, startRouting, type RoutingJob } from '../workers/routingClient';
import * as persistence from './persistence';

export type Selection =
  | { kind: 'component'; id: string }
  | { kind: 'pin'; componentId: string; pinNumber: number }
  | { kind: 'wire'; id: string }
  | { kind: 'hole'; point: GridPoint }
  | { kind: 'net'; netId: string }
  | { kind: 'issue'; index: number }
  | null;

/** 從元件庫拿起、還沒放下的元件。 */
export interface PlacingTool {
  item: LibraryItem;
  rotation: Rotation;
  /** true：按住拖曳中，放開就放置；false：點一下後 ghost 跟著游標，再點板子放置。 */
  dragging: boolean;
}

export type Mode = 'manual' | 'auto' | 'compare';
export type RightTab = 'inspect' | 'nets' | 'check';
export type Dialog = 'open' | 'save-as' | 'confirm-new' | 'help' | null;

export interface Comparison {
  /** 佈線當時使用者的導線。 */
  beforeWires: Wire[];
  beforeScore: { metrics: RoutingMetrics; score: number };
  result: RoutingResult;
  /** 佈線當時的元件陣列（參照）；元件一改變，這份對照就過期。 */
  components: ComponentInstance[];
}

export interface WireAnimation {
  key: number;
  /** wire id → 開始時間（ms）。 */
  delays: Record<string, number>;
  drawMs: number;
  totalMs: number;
}

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
  compareLayout: 'side' | 'stacked';
  showCheck: boolean;
  routing: { startedAt: number; purpose: 'apply' | 'compare' } | null;
  comparison: Comparison | null;
  animation: WireAnimation | null;
  resultVisible: boolean;
  wireColor: string;
  viewport: Viewport;
  canvasSize: { width: number; height: number };
  rightTab: RightTab;
  dialog: Dialog;
  toasts: Toast[];
  storageWarned: boolean;
}

export interface AppActions {
  undo(): void;
  redo(): void;
  select(selection: Selection): void;
  startPlacing(item: LibraryItem, dragging: boolean): void;
  setPlacingDragging(dragging: boolean): void;
  rotatePlacing(): void;
  cancelPlacing(): void;
  placeComponent(item: LibraryItem, rotation: Rotation, boardId: string, anchor: { x: number; y: number }): void;
  moveComponent(id: string, anchor: { x: number; y: number }, rotation?: Rotation): void;
  rotateComponent(id: string): void;
  rotateSelection(): void;
  deleteSelection(): void;
  deleteComponent(id: string): void;
  deleteWire(id: string): void;
  addWire(path: GridPoint[]): void;
  updateProps(id: string, patch: ComponentProps): void;
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
  setRightTab(tab: RightTab): void;
  setShowCheck(show: boolean): void;
  runCheck(): void;
  runAutoRoute(purpose: 'apply' | 'compare'): void;
  cancelRouting(): void;
  finishAnimation(): void;
  dismissResult(): void;
  setMode(mode: Mode): void;
  applyComparison(): void;
  restoreManualWires(): void;
  setCompareLayout(layout: 'side' | 'stacked'): void;
  newCircuit(): void;
  loadCircuit(circuit: Circuit, name: string | null, message?: string): void;
  saveProject(name?: string): void;
  openProject(name: string): void;
  deleteProject(name: string): void;
  importJson(text: string): void;
  openDialog(dialog: Dialog): void;
  closeDialog(): void;
  toast(kind: Toast['kind'], message: string): void;
  dismissToast(id: number): void;
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
  return s.comparison !== null && s.comparison.components === s.circuit.components;
}

export function isDirty(s: Pick<AppState, 'circuit' | 'savedCircuit'>): boolean {
  return s.circuit !== s.savedCircuit && (s.circuit.components.length > 0 || s.circuit.wires.length > 0);
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
    case 'net':
      return analyzeCircuit(circuit).netById.has(selection.netId) ? selection : null;
    case 'issue':
      return null;
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

let routingJob: RoutingJob | null = null;
let animationTimer: ReturnType<typeof setTimeout> | null = null;
let toastId = 1;
let animationKey = 1;

function clearAnimationTimer() {
  if (animationTimer) clearTimeout(animationTimer);
  animationTimer = null;
}

/** 依佈線順序逐條描線：每條最多間隔 160 ms，總長約 2.5 秒內。 */
export function planAnimation(wires: Wire[]): WireAnimation {
  const n = wires.length;
  const stepMs = n > 0 ? Math.min(160, 2000 / n) : 0;
  const drawMs = Math.max(260, Math.min(520, stepMs * 3));
  const delays: Record<string, number> = {};
  wires.forEach((w, i) => (delays[w.id] = Math.round(i * stepMs)));
  return { key: animationKey++, delays, drawMs, totalMs: Math.round((n - 1) * stepMs + drawMs) };
}

function initialState(): AppState {
  const restored = typeof window !== 'undefined' ? persistence.loadAutosave() : null;
  const circuit = restored?.circuit ?? emptyCircuit();
  return {
    circuit,
    history: emptyHistory(),
    projectName: restored?.name || null,
    savedCircuit: circuit,
    selection: null,
    placing: null,
    view: 'edit',
    compareLayout: 'stacked',
    showCheck: false,
    routing: null,
    comparison: null,
    animation: null,
    resultVisible: false,
    wireColor: DEFAULT_WIRE_COLOR,
    viewport: DEFAULT_VIEWPORT,
    canvasSize: { width: 1200, height: 700 },
    rightTab: 'inspect',
    dialog: null,
    toasts: [],
    storageWarned: false,
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
      ...rest,
    });
  };

  const guardRouting = (): boolean => {
    if (get().routing) {
      get().toast('info', 'AI 標準佈線計算中，請稍候或先取消');
      return true;
    }
    return false;
  };

  const startAnimation = (wires: Wire[]) => {
    clearAnimationTimer();
    const animation = planAnimation(wires);
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
      set({ circuit: step.state, history: step.history, selection: pruneSelection(s.selection, step.state), animation: null, resultVisible: false });
      get().toast('info', `已復原：${step.label}`);
    },

    redo() {
      if (guardRouting()) return;
      const s = get();
      const step = redo(s.history, s.circuit);
      if (!step) return;
      clearAnimationTimer();
      set({ circuit: step.state, history: step.history, selection: pruneSelection(s.selection, step.state), animation: null, resultVisible: false });
      get().toast('info', `已重做：${step.label}`);
    },

    select(selection) {
      set({ selection, rightTab: selection && selection.kind !== 'issue' ? 'inspect' : get().rightTab });
    },

    startPlacing(item, dragging) {
      if (guardRouting() || !getComponentDefinition(item.defId)) return;
      set({ placing: { item, rotation: 0, dragging }, selection: null, view: 'edit' });
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
      if (guardRouting()) return;
      const s = get();
      const { circuit, id } = addComponent(s.circuit, { defId: item.defId, rotation, props: item.props }, boardId, anchor);
      commit(`放置 ${item.name} ${id}`, circuit, { selection: { kind: 'component', id }, placing: null });
    },

    moveComponent(id, anchor, rotation) {
      if (guardRouting()) return;
      const s = get();
      commit(`移動 ${componentName(s.circuit, id)}`, moveComponent(s.circuit, id, anchor, rotation));
    },

    rotateComponent(id) {
      if (guardRouting()) return;
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
    },

    deleteComponent(id) {
      if (guardRouting()) return;
      const s = get();
      commit(`刪除 ${componentName(s.circuit, id)}`, removeItems(s.circuit, { componentIds: [id] }), { selection: null });
    },

    deleteWire(id) {
      if (guardRouting()) return;
      const s = get();
      commit(`刪除導線 ${id}`, removeItems(s.circuit, { wireIds: [id] }), { selection: null });
    },

    addWire(path) {
      if (guardRouting()) return;
      const s = get();
      if (path.length < 2) return;
      const color = defaultWireColor(s.circuit, path[0], path[path.length - 1], s.wireColor);
      const { circuit, id } = addWire(s.circuit, path, color);
      commit(`接線 ${id}`, circuit, { selection: { kind: 'wire', id } });
    },

    updateProps(id, patch) {
      const s = get();
      commit(`修改 ${componentName(s.circuit, id)}`, updateComponentProps(s.circuit, id, patch));
    },

    setSpan(id, span) {
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
      if (guardRouting()) return;
      const s = get();
      if (s.circuit.wires.length === 0) return;
      commit('清除所有導線', replaceWires(s.circuit, []), { selection: null });
    },

    setViewport(viewport) {
      set({ viewport });
    },

    setCanvasSize(width, height) {
      const s = get();
      if (s.canvasSize.width === width && s.canvasSize.height === height) return;
      set({ canvasSize: { width, height } });
    },

    zoomBy(factor) {
      const s = get();
      set({ viewport: zoomAt(s.viewport, factor, s.canvasSize.width / 2, s.canvasSize.height / 2) });
    },

    fitToScreen() {
      const s = get();
      const bounds = worldBounds(boardFrames(s.circuit));
      if (bounds) set({ viewport: fitRect(bounds, s.canvasSize.width, s.canvasSize.height, 28) });
    },

    resetView() {
      const s = get();
      const bounds = worldBounds(boardFrames(s.circuit));
      set({ viewport: bounds ? centerOn({ ...DEFAULT_VIEWPORT, scale: 1 }, bounds, s.canvasSize.width, s.canvasSize.height) : DEFAULT_VIEWPORT });
    },

    focusPoints(points) {
      const s = get();
      const rect = gridBounds(boardFrames(s.circuit), points, 3);
      if (rect) set({ viewport: centerOn(s.viewport, rect, s.canvasSize.width, s.canvasSize.height) });
    },

    setRightTab(rightTab) {
      set({ rightTab });
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

    runAutoRoute(purpose) {
      const s = get();
      if (s.routing) return;
      const circuit = s.circuit;
      if (circuit.components.length === 0) {
        get().toast('warning', '板上還沒有元件。先放置元件並手動接線，再執行 AI 標準佈線。');
        return;
      }
      clearAnimationTimer();
      set({ routing: { startedAt: performance.now(), purpose }, animation: null, resultVisible: false, placing: null });
      const job = startRouting(circuit);
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
          commit('AI 標準佈線', applyRouting(circuit, result), { comparison, selection: null, view: 'edit' });
          startAnimation(get().circuit.wires);
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
      if (s.routing) return;
      const current = deriveMode(s);
      if (mode === 'compare') {
        if (isComparisonFresh(s)) set({ view: 'compare', placing: null });
        else s.runAutoRoute('compare');
        return;
      }
      set({ view: 'edit' });
      if (mode === 'auto' && current !== 'auto') s.runAutoRoute('apply');
      if (mode === 'manual' && deriveMode({ view: 'edit', circuit: s.circuit }) === 'auto') s.restoreManualWires();
    },

    applyComparison() {
      const s = get();
      const cmp = s.comparison;
      if (!cmp || !isComparisonFresh(s) || cmp.result.status !== 'success') return;
      commit('AI 標準佈線', applyRouting(s.circuit, cmp.result), { view: 'edit', selection: null });
      startAnimation(get().circuit.wires);
    },

    restoreManualWires() {
      const s = get();
      if (!s.comparison || !isComparisonFresh(s)) {
        get().toast('info', '找不到佈線前的手動導線（元件已經變動）。可以用 Undo 回到之前的狀態。');
        return;
      }
      commit('切回手動接線', replaceWires(s.circuit, s.comparison.beforeWires), { view: 'edit', selection: null });
    },

    setCompareLayout(compareLayout) {
      set({ compareLayout });
    },

    newCircuit() {
      if (guardRouting()) return;
      get().loadCircuit(emptyCircuit(), null, '已建立新電路');
    },

    loadCircuit(circuit, name, message) {
      if (guardRouting()) return;
      clearAnimationTimer();
      set({
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
        dialog: null,
      });
      get().fitToScreen();
      if (message) get().toast('success', message);
    },

    saveProject(name) {
      const s = get();
      const target = (name ?? s.projectName ?? '').trim();
      if (!target) {
        set({ dialog: 'save-as' });
        return;
      }
      if (!persistence.saveProject(target, s.circuit)) {
        get().toast('error', '無法儲存：瀏覽器不允許使用本機儲存空間。請改用「匯出 JSON」。');
        return;
      }
      set({ projectName: target, savedCircuit: s.circuit, dialog: null });
      get().toast('success', `已儲存「${target}」`);
    },

    openProject(name) {
      const result = persistence.loadProject(name);
      if (!result.ok) {
        get().toast('error', result.error);
        return;
      }
      get().loadCircuit(result.circuit, name, `已開啟「${name}」`);
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
      get().loadCircuit(result.circuit, result.name, `已匯入${result.name ? `「${result.name}」` : ' JSON'}`);
    },

    openDialog(dialog) {
      set({ dialog });
    },

    closeDialog() {
      set({ dialog: null });
    },

    toast(kind, message) {
      const id = toastId++;
      set({ toasts: [...get().toasts.slice(-3), { id, kind, message }] });
      setTimeout(() => get().dismissToast(id), kind === 'error' ? 7000 : 4200);
    },

    dismissToast(id) {
      set({ toasts: get().toasts.filter((t) => t.id !== id) });
    },
  };
});

// ---------- 自動儲存 ----------

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

/** 電路或專案名稱改變後 400 ms 寫入 localStorage；第一次失敗時提示一次。 */
export function startAutosave(): () => void {
  return useStore.subscribe((s, prev) => {
    if (s.circuit === prev.circuit && s.projectName === prev.projectName) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      const now = useStore.getState();
      if (!persistence.writeAutosave(now.circuit, now.projectName) && !now.storageWarned) {
        useStore.setState({ storageWarned: true });
        now.toast('warning', '瀏覽器不允許使用本機儲存空間，無法自動儲存。請記得「匯出 JSON」。');
      }
    }, 400);
  });
}
