import { create } from 'zustand';
import { emptyHistory, record, redo, undo, type History } from '../editor/history';
import { DEFAULT_VIEWPORT, fitRect, type Viewport } from '../editor/viewport';
import { addNode, copyNodes, pasteNodes, removeNodes, removeWire, setInputValue, type EditResult, type LogicClipboard } from '../logic/edit';
import { nodeSize } from '../logic/shapes';
import { emptyDiagram, type LogicDiagram, type NodeKind, type BlockChip } from '../logic/types';
import * as persistence from './persistence';

/** 選取：一個元件、一條線，或框選的多個元件（子專案 15）。 */
export type LogicSelection = { kind: 'node'; id: string } | { kind: 'wire'; id: string } | { kind: 'nodes'; ids: string[] } | null;
export type LogicTab = 'inspect' | 'table' | 'check';
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
  paste(): boolean;
  toggleInput(id: string): void;
  setInputs(values: Record<string, 0 | 1>): void;
  setViewport(v: Viewport): void;
  setCanvasSize(width: number, height: number): void;
  fit(): void;
  setTab(tab: LogicTab): void;
}

export function initialLogicState(): Pick<LogicState, 'diagram' | 'saved' | 'history' | 'selection' | 'placing' | 'placingChip' | 'viewport' | 'canvasSize' | 'tab'> {
  const restored = typeof window !== 'undefined' ? persistence.loadAutosave()?.logic : undefined;
  const diagram = restored ?? emptyDiagram();
  return { diagram, saved: diagram, history: emptyHistory(), selection: null, placing: null, placingChip: null, viewport: DEFAULT_VIEWPORT, canvasSize: { width: 1200, height: 700 }, tab: 'inspect' };
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
    set({ placing, placingChip: placing === 'BLOCK' ? (chip ?? null) : null, selection: null });
  },
  place(kind, x, y) {
    const chip = get().placingChip ?? undefined;
    const r = addNode(get().diagram, kind, x, y, chip);
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
    const xs = diagram.nodes.flatMap((n) => [n.x, n.x + nodeSize(n).w + 1]);
    const ys = diagram.nodes.flatMap((n) => [n.y, n.y + nodeSize(n).h]);
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
