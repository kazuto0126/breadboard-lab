import { create } from 'zustand';
import { emptyHistory, record, redo, undo, type History } from '../editor/history';
import { DEFAULT_VIEWPORT, fitRect, type Viewport } from '../editor/viewport';
import { addNode, copyNodes, flipNodes, pasteNodes, removeNodes, removeWire, rotateNodes, setInputValue, type EditResult, type LogicClipboard, type Turn } from '../logic/edit';
import { boxOf } from '../logic/shapes';
import { emptyDiagram, type LogicDiagram, type NodeKind, type BlockChip, type Rotation } from '../logic/types';
import * as persistence from './persistence';

/** 選取：一個元件、一條線，或框選的多個元件（子專案 15）。 */
export type LogicSelection = { kind: 'node'; id: string } | { kind: 'wire'; id: string } | { kind: 'nodes'; ids: string[] } | null;
export type LogicTab = 'inspect' | 'table' | 'task' | 'check';
/** 邏輯圖一格的畫面大小（px，縮放 1 時）。 */
export const LOGIC_CELL = 20;

export interface LogicState {
  diagram: LogicDiagram;
  saved: LogicDiagram;
  history: History<LogicDiagram>;
  selection: LogicSelection;
  placing: NodeKind | null;
  /** 子專案 21：放置 IC 方塊時是哪一顆。 */
  placingChip: BlockChip | null;
  /** 子專案 28：放置中的元件的方向（按 R / M 先轉好）。 */
  placingTurn: Turn;
  viewport: Viewport;
  canvasSize: { width: number; height: number };
  tab: LogicTab;
  load(d: LogicDiagram): void;
  markSaved(): void;
  apply(r: EditResult, label: string, selection?: LogicSelection): boolean;
  undo(): void;
  redo(): void;
  select(sel: LogicSelection): void;
  startPlacing(kind: NodeKind | null, chip?: BlockChip): void;
  place(kind: NodeKind, x: number, y: number): boolean;
  deleteSelection(): void;
  /** 子專案 15：複製選取的元件（只放在這個分頁的記憶體）、貼上。 */
  copy(): void;
  /** 子專案 26：選取的閘與 IC 方塊順時針轉 90°（一個 Undo 步驟）；不能轉時回傳原因，沒有選取時什麼都不做。 */
  rotateSelection(): string | null;
  /** 子專案 28：選取的元件左右鏡射（一個 Undo 步驟）；不能鏡射時回傳原因。 */
  flipSelection(): string | null;
  /** 子專案 28：放置中的元件先轉 90° 或鏡射。 */
  turnPlacing(how: 'rotate' | 'flip'): void;
  paste(): boolean;
  toggleInput(id: string): void;
  setInputs(values: Record<string, 0 | 1>): void;
  setViewport(v: Viewport): void;
  setCanvasSize(width: number, height: number): void;
  fit(): void;
  setTab(tab: LogicTab): void;
}

export function initialLogicState(): Pick<LogicState, 'diagram' | 'saved' | 'history' | 'selection' | 'placing' | 'placingChip' | 'placingTurn' | 'viewport' | 'canvasSize' | 'tab'> {
  const restored = typeof window !== 'undefined' ? persistence.loadAutosave()?.logic : undefined;
  const diagram = restored ?? emptyDiagram();
  return { diagram, saved: diagram, history: emptyHistory(), selection: null, placing: null, placingChip: null, placingTurn: {}, viewport: DEFAULT_VIEWPORT, canvasSize: { width: 1200, height: 700 }, tab: 'inspect' };
}

/** 規格第 1、2 節：邏輯圖自己的狀態與 Undo（不進主 store 的 Undo）。 */
export const useLogic = create<LogicState>((set, get) => ({
  ...initialLogicState(),

  load(d) {
    set({ diagram: d, saved: d, history: emptyHistory(), selection: null, placing: null });
    get().fit();
  },
  markSaved() {
    set({ saved: get().diagram });
  },
  apply(r, label, selection) {
    if (!r.ok) return false;
    if (r.diagram === get().diagram) return true;
    set({ history: record(get().history, get().diagram, label), diagram: r.diagram, ...(selection !== undefined ? { selection } : {}) });
    return true;
  },
  undo() {
    const step = undo(get().history, get().diagram);
    if (step) set({ history: step.history, diagram: step.state, selection: null });
  },
  redo() {
    const step = redo(get().history, get().diagram);
    if (step) set({ history: step.history, diagram: step.state, selection: null });
  },
  select(selection) {
    set({ selection });
  },
  startPlacing(placing, chip) {
    set({ placing, placingChip: placing === 'BLOCK' ? (chip ?? null) : null, placingTurn: {}, selection: null });
  },
  place(kind, x, y) {
    const chip = get().placingChip ?? undefined;
    const r = addNode(get().diagram, kind, x, y, chip, get().placingTurn);
    const name = kind === 'INPUT' ? '輸入端' : kind === 'OUTPUT' ? '輸出端' : kind === 'DISPLAY' ? '7 段顯示器' : kind === 'HIGH' ? '5V' : kind === 'LOW' ? 'GND' : kind === 'BLOCK' ? `${chip} 方塊` : kind;
    const done = get().apply(r, `新增 ${name}`, r.ok && r.id ? { kind: 'node', id: r.id } : undefined);
    if (done) set({ placing: null, placingChip: null });
    return done;
  },
  deleteSelection() {
    const { selection, diagram } = get();
    if (!selection) return;
    const ids = selectedIds(selection);
    const next = selection.kind === 'wire' ? removeWire(diagram, selection.id) : removeNodes(diagram, ids);
    get().apply({ ok: true, diagram: next }, selection.kind === 'wire' ? '刪除線' : `刪除 ${ids.join('、')}`, null);
  },
  copy() {
    const ids = selectedIds(get().selection);
    if (ids.length > 0) clipboard = copyNodes(get().diagram, ids);
  },
  rotateSelection() {
    const ids = selectedIds(get().selection);
    if (ids.length === 0) return null;
    const r = rotateNodes(get().diagram, ids);
    if (!r.ok) return r.reason;
    get().apply(r, '轉向');
    return null;
  },
  flipSelection() {
    const ids = selectedIds(get().selection);
    if (ids.length === 0) return null;
    const r = flipNodes(get().diagram, ids);
    if (!r.ok) return r.reason;
    get().apply(r, '鏡射');
    return null;
  },
  turnPlacing(how) {
    const t = get().placingTurn;
    if (how === 'flip') {
      const { flip: _old, ...rest } = t;
      set({ placingTurn: t.flip ? rest : { ...rest, flip: true } });
      return;
    }
    const angle = ((t.rotation ?? 0) + 90) % 360;
    const { rotation: _r, ...rest } = t;
    set({ placingTurn: angle === 0 ? rest : { ...rest, rotation: angle as Rotation } });
  },
  paste() {
    if (!clipboard) return false;
    const r = pasteNodes(get().diagram, clipboard);
    if (!r.ok) return false;
    return get().apply({ ok: true, diagram: r.diagram }, `貼上 ${r.ids.length} 個元件`, { kind: 'nodes', ids: r.ids });
  },
  toggleInput(id) {
    const node = get().diagram.nodes.find((n) => n.id === id);
    if (node?.kind === 'INPUT') set({ diagram: setInputValue(get().diagram, id, node.value === 1 ? 0 : 1) });
  },
  setInputs(values) {
    let d = get().diagram;
    for (const [id, v] of Object.entries(values)) d = setInputValue(d, id, v);
    set({ diagram: d });
  },
  setViewport(viewport) {
    set({ viewport });
  },
  setCanvasSize(width, height) {
    set({ canvasSize: { width, height } });
  },
  fit() {
    const { diagram, canvasSize } = get();
    if (diagram.nodes.length === 0) {
      set({ viewport: DEFAULT_VIEWPORT });
      return;
    }
    const xs = diagram.nodes.flatMap((n) => [n.x, n.x + boxOf(n).w + 1]);
    const ys = diagram.nodes.flatMap((n) => [n.y, n.y + boxOf(n).h]);
    const rect = { x: (Math.min(...xs) - 2) * LOGIC_CELL, y: (Math.min(...ys) - 2) * LOGIC_CELL, width: (Math.max(...xs) - Math.min(...xs) + 4) * LOGIC_CELL, height: (Math.max(...ys) - Math.min(...ys) + 4) * LOGIC_CELL };
    set({ viewport: fitRect(rect, canvasSize.width, canvasSize.height, 32) });
  },
  setTab(tab) {
    set({ tab });
  },
}));

/** 子專案 15：複製的內容（只在這個分頁）。 */
let clipboard: LogicClipboard | null = null;

/** 選取裡的元件 ID（線不算）。 */
export function selectedIds(sel: LogicSelection): string[] {
  if (!sel) return [];
  if (sel.kind === 'node') return [sel.id];
  if (sel.kind === 'nodes') return sel.ids;
  return [];
}

/** 邏輯圖有沒有還沒儲存的修改（開關切換也算：開關狀態會存檔；子專案 24 的題目也算）。 */
export function logicDirty(s: LogicState = useLogic.getState()): boolean {
  const hasContent = (d: LogicDiagram) => d.nodes.length > 0 || d.task !== undefined;
  return s.diagram !== s.saved && (hasContent(s.diagram) || hasContent(s.saved));
}
