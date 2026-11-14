import { create } from 'zustand';
import { emptyHistory, record, redo, undo, type History } from '../editor/history';
import { DEFAULT_VIEWPORT, fitRect, screenToWorld, type Viewport } from '../editor/viewport';
import { addLogicNote, moveLogicNote, removeLogicNote, setLogicNoteColor, setLogicNoteTarget, setLogicNoteText } from '../logic/notes';
import type { NoteColor } from '../types/circuit';
import { addNode, copyNodes, flipNodes, pasteNodes, removeNodes, removeWire, rotateNodes, setInputValue, type EditResult, type LogicClipboard, type Turn } from '../logic/edit';
import { boxOf } from '../logic/shapes';
import { clockNodes, evaluate, type SeqState } from '../logic/evaluate';
import { emptyDiagram, type LogicDiagram, type NodeKind, type BlockChip, type Rotation } from '../logic/types';
import * as persistence from './persistence';
import { addCustomNode, applyBlockEdit, blockDiagram, blockOf, wrapAsBlock } from '../logic/customBlocks';

/** 選取：一個元件、一條線，或框選的多個元件（子專案 15）。 */
export type LogicSelection = { kind: 'node'; id: string } | { kind: 'wire'; id: string } | { kind: 'nodes'; ids: string[] } | { kind: 'note'; id: string } | null;
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
  /** 子專案 29：正在直接編輯文字的便條。 */
  editingNote: string | null;
  /** 子專案 40：輸出端下面顯示布林式（不存檔、不進 Undo）。 */
  showFormulas: boolean;
  /** 子專案 46：時序方塊目前的狀態（正反器的 Q、計數值）；不存檔、不進 Undo。 */
  seq: SeqState;
  /** 子專案 46：時序表列到第幾次脈衝。 */
  pulses: number;
  /** 子專案 50：時序表分頁顯示表格或波形（不存檔、不進 Undo）。 */
  seqView: 'table' | 'wave';
  /** 子專案 64：時序表送時脈的順序（名稱，空白隔開；空字串是送名稱排第一個的時脈）。不存檔、不進 Undo。 */
  clockOrder: string;
  /** 子專案 65：放置自訂方塊時是哪一個。 */
  placingBlock: string | null;
  /** 子專案 65：進到方塊裡編輯時，外面每一層（最後一個是上一層）；diagram 是方塊的內容。 */
  outer: Array<{ diagram: LogicDiagram; history: History<LogicDiagram>; blockId: string; viewport: Viewport }>;
  /** 子專案 65：點兩下方塊進到裡面編輯；回到上一層時整次修改是一步 Undo。 */
  enterBlock(nodeId: string): void;
  exitBlock(): void;
  /** 子專案 65：選取的元件包成方塊；不能包時回傳原因。 */
  wrapSelection(name: string): string | null;
  load(d: LogicDiagram): void;
  markSaved(): void;
  apply(r: EditResult, label: string, selection?: LogicSelection): boolean;
  undo(): void;
  redo(): void;
  select(sel: LogicSelection): void;
  startPlacing(kind: NodeKind | null, chip?: BlockChip, block?: string): void;
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
  setShowFormulas(on: boolean): void;
  /** 子專案 46：送一個脈衝（時脈 0 → 1 → 0）。沒有時脈時什麼都不做。子專案 64：clockId 指定送哪個時脈（沒給時是名稱排第一個的）。 */
  pulse(clockId?: string): void;
  setClockOrder(order: string): void;
  /** 子專案 46：時序方塊全部回到上電狀態（0）。 */
  resetSeq(): void;
  setPulses(n: number): void;
  setSeqView(v: 'table' | 'wave'): void;
  /** 子專案 29：便條（格子座標）；新增後選取並開始編輯。 */
  addNoteAt(x: number, y: number): void;
  addNoteAtCenter(): void;
  startNoteEdit(id: string): void;
  /** 結束編輯：空白的便條直接拿掉。 */
  finishNoteEdit(text: string): void;
  moveNote(id: string, x: number, y: number): void;
  setNoteText(id: string, text: string): void;
  setNoteColor(id: string, color: NoteColor): void;
  setNoteTarget(id: string, target: string | null): void;
  deleteNote(id: string): void;
}

export function initialLogicState(): Pick<LogicState, 'diagram' | 'saved' | 'history' | 'selection' | 'placing' | 'placingChip' | 'placingTurn' | 'viewport' | 'canvasSize' | 'tab' | 'editingNote' | 'showFormulas' | 'seq' | 'pulses' | 'seqView' | 'clockOrder' | 'placingBlock' | 'outer'> {
  const restored = typeof window !== 'undefined' ? persistence.loadAutosave()?.logic : undefined;
  const diagram = restored ?? emptyDiagram();
  return { diagram, saved: diagram, history: emptyHistory(), selection: null, placing: null, placingChip: null, placingTurn: {}, viewport: DEFAULT_VIEWPORT, canvasSize: { width: 1200, height: 700 }, tab: 'inspect', editingNote: null, showFormulas: false, seq: evaluate(diagram).seq, pulses: 16, seqView: 'table', clockOrder: '', placingBlock: null, outer: [] };
}

/** 子專案 46：圖或輸入改了之後，時序方塊從目前的狀態重算到穩定（新的方塊從上電狀態開始）。 */
const settled = (d: LogicDiagram, seq: SeqState): SeqState => evaluate(d, {}, seq).seq;

/** 規格第 1、2 節：邏輯圖自己的狀態與 Undo（不進主 store 的 Undo）。 */
export const useLogic = create<LogicState>((set, get) => ({
  ...initialLogicState(),

  load(d) {
    set({ diagram: d, saved: d, history: emptyHistory(), selection: null, placing: null, editingNote: null, seq: evaluate(d).seq, outer: [] });
    get().fit();
  },
  markSaved() {
    set({ saved: logicRoot(get()) });
  },
  enterBlock(nodeId) {
    const s = get();
    const node = s.diagram.nodes.find((n) => n.id === nodeId && n.kind === 'CUSTOM');
    const inner = node?.block ? blockDiagram(s.diagram, node.block) : null;
    if (!node || !inner) return;
    set({ outer: [...s.outer, { diagram: s.diagram, history: s.history, blockId: node.block!, viewport: s.viewport }], diagram: inner, history: emptyHistory(), selection: null, placing: null, editingNote: null, seq: evaluate(inner).seq });
    get().fit();
  },
  exitBlock() {
    const s = get();
    const top = s.outer[s.outer.length - 1];
    if (!top) return;
    const parent = applyBlockEdit(top.diagram, top.blockId, s.diagram);
    const name = blockOf(top.diagram, top.blockId)?.name ?? top.blockId;
    const history = parent === top.diagram ? top.history : record(top.history, top.diagram, `修改方塊 ${name}`);
    set({ outer: s.outer.slice(0, -1), diagram: parent, history, selection: null, placing: null, editingNote: null, viewport: top.viewport, seq: settled(parent, s.seq) });
  },
  wrapSelection(name) {
    const ids = selectedIds(get().selection);
    const r = wrapAsBlock(get().diagram, ids, name);
    if (!r.ok) return r.reason;
    get().apply(r, `包成方塊 ${name}`, r.id ? { kind: 'node', id: r.id } : null);
    return null;
  },
  apply(r, label, selection) {
    if (!r.ok) return false;
    if (r.diagram === get().diagram) return true;
    set({ history: record(get().history, get().diagram, label), diagram: r.diagram, seq: settled(r.diagram, get().seq), ...(selection !== undefined ? { selection } : {}) });
    return true;
  },
  undo() {
    const step = undo(get().history, get().diagram);
    if (step) set({ history: step.history, diagram: step.state, selection: null, seq: settled(step.state, get().seq) });
  },
  redo() {
    const step = redo(get().history, get().diagram);
    if (step) set({ history: step.history, diagram: step.state, selection: null, seq: settled(step.state, get().seq) });
  },
  select(selection) {
    set({ selection });
  },
  startPlacing(placing, chip, block) {
    set({ placing, placingChip: placing === 'BLOCK' ? (chip ?? null) : null, placingBlock: placing === 'CUSTOM' ? (block ?? null) : null, placingTurn: {}, selection: null });
  },
  place(kind, x, y) {
    const chip = get().placingChip ?? undefined;
    const block = get().placingBlock;
    const r = kind === 'CUSTOM' && block ? addCustomNode(get().diagram, block, x, y, get().placingTurn) : addNode(get().diagram, kind, x, y, chip, get().placingTurn);
    const name = kind === 'INPUT' ? '輸入端' : kind === 'OUTPUT' ? '輸出端' : kind === 'DISPLAY' ? '7 段顯示器' : kind === 'HIGH' ? '5V' : kind === 'LOW' ? 'GND' : kind === 'BLOCK' ? `${chip} 方塊` : kind === 'CUSTOM' ? `方塊 ${blockOf(get().diagram, block ?? undefined)?.name ?? ''}` : kind;
    const done = get().apply(r, `新增 ${name}`, r.ok && r.id ? { kind: 'node', id: r.id } : undefined);
    if (done) set({ placing: null, placingChip: null, placingBlock: null });
    return done;
  },
  deleteSelection() {
    const { selection, diagram } = get();
    if (!selection) return;
    if (selection.kind === 'note') {
      get().deleteNote(selection.id);
      return;
    }
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
    if (node?.kind !== 'INPUT') return;
    const d = setInputValue(get().diagram, id, node.value === 1 ? 0 : 1);
    set({ diagram: d, seq: settled(d, get().seq) });
  },
  setInputs(values) {
    let d = get().diagram;
    for (const [id, v] of Object.entries(values)) d = setInputValue(d, id, v);
    set({ diagram: d, seq: settled(d, get().seq) });
  },
  pulse(clockId) {
    const d = get().diagram;
    const clocks = clockNodes(d);
    const clock = clocks.find((n) => n.id === clockId) ?? clocks[0];
    if (!clock) return;
    const low = Object.fromEntries(clocks.map((n) => [n.id, 0 as const]));
    const up = evaluate(d, { ...low, [clock.id]: 1 }, get().seq).seq;
    set({ seq: evaluate(d, low, up).seq });
  },
  setClockOrder(clockOrder) {
    set({ clockOrder });
  },
  resetSeq() {
    set({ seq: evaluate(get().diagram).seq });
  },
  setPulses(n) {
    set({ pulses: n });
  },
  setSeqView(seqView) {
    set({ seqView });
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
  setShowFormulas(on) {
    set({ showFormulas: on });
  },
  addNoteAt(x, y) {
    const r = addLogicNote(get().diagram, x, y);
    get().apply({ ok: true, diagram: r.diagram }, '新增便條', { kind: 'note', id: r.id });
    set({ editingNote: r.id, placing: null, placingChip: null });
  },
  addNoteAtCenter() {
    const { viewport, canvasSize } = get();
    const w = screenToWorld(viewport, canvasSize.width / 2, canvasSize.height / 2);
    // 便條的左上角放在畫面中間往左上一點（便條大約 4 × 2 格）。
    get().addNoteAt(Math.round(w.x / LOGIC_CELL) - 2, Math.round(w.y / LOGIC_CELL) - 1);
  },
  startNoteEdit(id) {
    if (get().diagram.notes?.some((n) => n.id === id)) set({ editingNote: id, selection: { kind: 'note', id } });
  },
  finishNoteEdit(text) {
    const id = get().editingNote;
    if (!id) return;
    set({ editingNote: null });
    const d = get().diagram;
    if (text.trim() === '') get().apply({ ok: true, diagram: removeLogicNote(d, id) }, `刪除空白便條 ${id}`, null);
    else {
      const next = setLogicNoteText(d, id, text);
      if (next !== d) get().apply({ ok: true, diagram: next }, `便條 ${id} 改文字`);
    }
  },
  moveNote(id, x, y) {
    const d = get().diagram;
    const next = moveLogicNote(d, id, x, y);
    if (next !== d) get().apply({ ok: true, diagram: next }, `移動便條 ${id}`);
  },
  setNoteText(id, text) {
    const d = get().diagram;
    const next = setLogicNoteText(d, id, text);
    if (next !== d) get().apply({ ok: true, diagram: next }, `便條 ${id} 改文字`);
  },
  setNoteColor(id, color) {
    const d = get().diagram;
    const next = setLogicNoteColor(d, id, color);
    if (next !== d) get().apply({ ok: true, diagram: next }, `便條 ${id} 換顏色`);
  },
  setNoteTarget(id, target) {
    const d = get().diagram;
    const next = setLogicNoteTarget(d, id, target);
    if (next !== d) get().apply({ ok: true, diagram: next }, target ? `便條 ${id} 指向 ${target}` : `便條 ${id} 不指向元件`);
  },
  deleteNote(id) {
    const d = get().diagram;
    const next = removeLogicNote(d, id);
    if (next !== d) get().apply({ ok: true, diagram: next }, `刪除便條 ${id}`, null);
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
  const hasContent = (d: LogicDiagram) => d.nodes.length > 0 || d.task !== undefined || d.notes !== undefined;
  const root = logicRoot(s);
  return root !== s.saved && (hasContent(root) || hasContent(s.saved));
}

let rootMemo: { diagram: LogicDiagram; outer: LogicState['outer']; root: LogicDiagram } | null = null;

/**
 * 子專案 65（規格 2026-11-14 custom-blocks 第 4 節）：主圖：在方塊裡編輯時，把正在改的內容一層一層放回去
 * （存檔、自動儲存、匯出、和麵包板比對都用它）。同樣的狀態回傳同一個物件。
 */
export function logicRoot(s: Pick<LogicState, 'diagram' | 'outer'> = useLogic.getState()): LogicDiagram {
  if (s.outer.length === 0) return s.diagram;
  if (rootMemo && rootMemo.diagram === s.diagram && rootMemo.outer === s.outer) return rootMemo.root;
  let d = s.diagram;
  for (let i = s.outer.length - 1; i >= 0; i--) d = applyBlockEdit(s.outer[i].diagram, s.outer[i].blockId, d);
  rootMemo = { diagram: s.diagram, outer: s.outer, root: d };
  return d;
}
