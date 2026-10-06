import { create } from 'zustand';
import { createStore, type StateCreator } from 'zustand/vanilla';
import { indexCircuit } from '../../core/circuit/circuitIndex';
import { extractNetsWith, terminalClusters } from '../../core/circuit/nets';
import { validateCircuit } from '../../core/circuit/validate';
import { scoreRouting } from '../../core/routing/score';
import type { Circuit, Wire } from '../../types/circuit';
import { clearChecklist as clearChecklistDoc, setChecklistItem as setChecklistItemDoc, type CommandResult } from '../commands/commands';
import { DEFAULT_WIRE_COLOR } from '../model/colors';
import type {
  Analysis,
  CompareView,
  Ghost,
  Mode,
  Notice,
  PartTemplate,
  RightTab,
  RoutingJob,
  Selection,
  Viewport,
  WirePreview,
} from '../model/editorTypes';
import { createProject, type ProjectFile, type RoutingRecord } from '../model/projectFile';

export const HISTORY_LIMIT = 100;

export interface Snapshot {
  circuit: Circuit;
  routing: RoutingRecord | null;
}

export interface EditorState {
  doc: ProjectFile;
  history: { past: Snapshot[]; future: Snapshot[] };
  dirty: boolean;
  projectId: string | null;
  mode: Mode;
  selection: Selection | null;
  wireColor: string;
  viewport: Viewport;
  analysis: Analysis;
  rightTab: RightTab;
  routingJob: RoutingJob;
  compareView: CompareView;
  notice: Notice | null;
  checkPassedAt: number | null;
  ghost: Ghost | null;
  wirePreview: WirePreview | null;
  armedPart: PartTemplate | null;
  focusWireId: string | null;
  previewWires: Wire[];
}

export interface EditorActions {
  run(command: (doc: ProjectFile) => CommandResult): boolean;
  undo(): void;
  redo(): void;
  replaceDocument(doc: ProjectFile, options: { projectId: string | null; undoable: boolean; dirty: boolean }): void;
  markSaved(projectId: string, doc: ProjectFile): void;
  setChecklistItem(wireId: string, done: boolean): void;
  clearChecklist(): void;
  select(selection: Selection | null): void;
  setMode(mode: Mode): void;
  setWireColor(hex: string): void;
  setViewport(viewport: Viewport): void;
  setRightTab(tab: RightTab): void;
  setCompareView(view: CompareView): void;
  setRoutingJob(job: RoutingJob): void;
  notify(text: string, tone?: Notice['tone']): void;
  dismissNotice(): void;
  refreshAnalysis(): void;
  runCheck(): void;
  setGhost(ghost: Ghost | null): void;
  setWirePreview(preview: WirePreview | null): void;
  setArmedPart(part: PartTemplate | null): void;
  setFocusWire(id: string | null): void;
  setPreviewWires(wires: Wire[]): void;
}

export type EditorStore = EditorState & EditorActions;

/** 狀態列與即時檢查用的分析結果。 */
export function analyzeCircuit(circuit: Circuit): Analysis {
  const index = indexCircuit(circuit);
  const nets = extractNetsWith(index, circuit.wires);
  return {
    liveCheck: validateCircuit(circuit),
    wireCount: circuit.wires.length,
    netCount: nets.filter((n) => terminalClusters(n, index).length >= 2).length,
    score: scoreRouting(circuit).score,
  };
}

export function initialEditorState(doc: ProjectFile = createProject(), projectId: string | null = null): EditorState {
  return {
    doc,
    history: { past: [], future: [] },
    dirty: false,
    projectId,
    mode: 'edit',
    selection: null,
    wireColor: DEFAULT_WIRE_COLOR,
    viewport: { scale: 1, tx: 0, ty: 0 },
    analysis: analyzeCircuit(doc.circuit),
    rightTab: 'selection',
    routingJob: { status: 'idle' },
    compareView: 'ai',
    notice: null,
    checkPassedAt: null,
    ghost: null,
    wirePreview: null,
    armedPart: null,
    focusWireId: null,
    previewWires: [],
  };
}

function sanitizeSelection(selection: Selection | null, circuit: Circuit): Selection | null {
  if (!selection) return null;
  switch (selection.kind) {
    case 'component':
      return circuit.components.some((c) => c.id === selection.id) ? selection : null;
    case 'pin':
      return circuit.components.some((c) => c.id === selection.componentId) ? selection : null;
    case 'wire':
      return circuit.wires.some((w) => w.id === selection.id) ? selection : null;
    case 'hole':
      return selection;
  }
}

let noticeCounter = 0;

const editorStateCreator: StateCreator<EditorStore> = (set, get) => ({
  ...initialEditorState(),

  run(command) {
    const state = get();
    if (state.mode !== 'edit') return false;
    const result = command(state.doc);
    if (!result.ok) {
      get().notify(result.reason, 'error');
      return false;
    }
    const snapshot: Snapshot = { circuit: state.doc.circuit, routing: state.doc.routing };
    set({
      doc: result.doc,
      history: { past: [...state.history.past, snapshot].slice(-HISTORY_LIMIT), future: [] },
      dirty: true,
      selection: result.select === undefined ? sanitizeSelection(state.selection, result.doc.circuit) : result.select,
    });
    return true;
  },

  undo() {
    const { mode, history, doc, selection } = get();
    if (mode !== 'edit' || history.past.length === 0) return;
    const previous = history.past[history.past.length - 1];
    const nextDoc: ProjectFile = { ...doc, circuit: previous.circuit, routing: previous.routing };
    set({
      doc: nextDoc,
      history: { past: history.past.slice(0, -1), future: [{ circuit: doc.circuit, routing: doc.routing }, ...history.future] },
      dirty: true,
      selection: sanitizeSelection(selection, nextDoc.circuit),
      routingJob: { status: 'idle' },
      previewWires: [],
    });
  },

  redo() {
    const { mode, history, doc, selection } = get();
    if (mode !== 'edit' || history.future.length === 0) return;
    const [next, ...rest] = history.future;
    const nextDoc: ProjectFile = { ...doc, circuit: next.circuit, routing: next.routing };
    set({
      doc: nextDoc,
      history: { past: [...history.past, { circuit: doc.circuit, routing: doc.routing }].slice(-HISTORY_LIMIT), future: rest },
      dirty: true,
      selection: sanitizeSelection(selection, nextDoc.circuit),
      routingJob: { status: 'idle' },
      previewWires: [],
    });
  },

  replaceDocument(doc, { projectId, undoable, dirty }) {
    const state = get();
    const history = undoable
      ? { past: [...state.history.past, { circuit: state.doc.circuit, routing: state.doc.routing }].slice(-HISTORY_LIMIT), future: [] }
      : { past: [], future: [] };
    set({
      doc,
      projectId,
      dirty,
      history,
      selection: null,
      mode: 'edit',
      routingJob: { status: 'idle' },
      previewWires: [],
      ghost: null,
      wirePreview: null,
      armedPart: null,
      focusWireId: null,
      analysis: analyzeCircuit(doc.circuit),
    });
  },

  markSaved(projectId, doc) {
    set({ projectId, doc, dirty: false });
  },

  setChecklistItem(wireId, done) {
    const doc = setChecklistItemDoc(get().doc, wireId, done);
    if (doc !== get().doc) set({ doc, dirty: true });
  },

  clearChecklist() {
    const doc = clearChecklistDoc(get().doc);
    if (doc !== get().doc) set({ doc, dirty: true });
  },

  select: (selection) => set({ selection }),
  setMode: (mode) => set({ mode }),
  setWireColor: (wireColor) => set({ wireColor }),
  setViewport: (viewport) => set({ viewport }),
  setRightTab: (rightTab) => set({ rightTab }),
  setCompareView: (compareView) => set({ compareView }),
  setRoutingJob: (routingJob) => set({ routingJob }),

  notify(text, tone = 'info') {
    noticeCounter += 1;
    set({ notice: { id: noticeCounter, text, tone } });
  },

  dismissNotice: () => set({ notice: null }),

  refreshAnalysis() {
    set({ analysis: analyzeCircuit(get().doc.circuit) });
  },

  runCheck() {
    const analysis = analyzeCircuit(get().doc.circuit);
    const passed = analysis.liveCheck.every((e) => e.severity === 'info');
    set({ analysis, rightTab: 'check', checkPassedAt: passed ? Date.now() : null });
  },

  setGhost: (ghost) => set({ ghost }),
  setWirePreview: (wirePreview) => set({ wirePreview }),
  setArmedPart: (armedPart) => set({ armedPart }),
  setFocusWire: (focusWireId) => set({ focusWireId }),
  setPreviewWires: (previewWires) => set({ previewWires }),
});

export const createEditorStore = () => createStore<EditorStore>()(editorStateCreator);

export const useEditor = create<EditorStore>()(editorStateCreator);

export function resetEditor(doc: ProjectFile = createProject(), projectId: string | null = null): void {
  useEditor.setState(initialEditorState(doc, projectId));
}
