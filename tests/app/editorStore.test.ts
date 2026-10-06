import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { applyRoutingResult, deleteWire, placeComponent } from '../../src/app/commands/commands';
import { createProject } from '../../src/app/model/projectFile';
import { analyzeCircuit, createEditorStore, HISTORY_LIMIT, type EditorStore } from '../../src/app/store/editorStore';
import { autoRoute } from '../../src/core/routing/autoRoute';
import { acceptanceCircuit } from '../fixtures/circuits';

let store: StoreApi<EditorStore>;
beforeEach(() => {
  store = createEditorStore();
});

const place = (defId: string, x: number, y: number) => store.getState().run((doc) => placeComponent(doc, defId, { x, y }));

describe('editor store', () => {
  it('runs commands, records history and selects the result', () => {
    expect(place('74LS00', 10, 11)).toBe(true);
    const s = store.getState();
    expect(s.doc.circuit.components.map((c) => c.id)).toEqual(['U1']);
    expect(s.history.past).toHaveLength(1);
    expect(s.dirty).toBe(true);
    expect(s.selection).toEqual({ kind: 'component', id: 'U1' });
  });

  it('reports a failing command as a notice and keeps the history', () => {
    place('74LS00', 10, 11);
    expect(place('74LS04', 10, 11)).toBe(false);
    expect(store.getState().notice).toMatchObject({ text: '第 1 腳會壓到 U1', tone: 'error' });
    expect(store.getState().history.past).toHaveLength(1);
  });

  it('undoes and redoes, dropping selections that no longer exist', () => {
    place('74LS00', 10, 11);
    store.getState().undo();
    expect(store.getState().doc.circuit.components).toEqual([]);
    expect(store.getState().selection).toBeNull();
    store.getState().redo();
    expect(store.getState().doc.circuit.components.map((c) => c.id)).toEqual(['U1']);
    expect(store.getState().history.future).toEqual([]);
  });

  it(`keeps at most ${HISTORY_LIMIT} undo steps`, () => {
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) store.getState().run((doc) => ({ ok: true, doc }));
    expect(store.getState().history.past).toHaveLength(HISTORY_LIMIT);
  });

  it('ignores commands and undo while routing', () => {
    place('74LS00', 10, 11);
    store.getState().setMode('routing');
    expect(place('74LS04', 30, 11)).toBe(false);
    store.getState().undo();
    expect(store.getState().doc.circuit.components.map((c) => c.id)).toEqual(['U1']);
  });

  it('ticks checklist items without touching the history', () => {
    store.getState().replaceDocument({ ...createProject(), circuit: acceptanceCircuit() }, { projectId: null, undoable: false, dirty: false });
    store.getState().run((d) => applyRoutingResult(d, autoRoute(d.circuit), 0));
    const steps = store.getState().history.past.length;
    const wireId = store.getState().doc.circuit.wires[0].id;
    store.getState().setChecklistItem(wireId, true);
    expect(store.getState().doc.routing!.checklist).toEqual({ [wireId]: true });
    expect(store.getState().history.past).toHaveLength(steps);
    store.getState().clearChecklist();
    expect(store.getState().doc.routing!.checklist).toEqual({});
  });

  it('forgets the focused checklist wire once it is deleted', () => {
    store.getState().replaceDocument({ ...createProject(), circuit: acceptanceCircuit() }, { projectId: null, undoable: false, dirty: false });
    store.getState().run((d) => applyRoutingResult(d, autoRoute(d.circuit), 0));
    const [first, second] = store.getState().doc.circuit.wires;
    store.getState().setFocusWire(first.id);
    store.getState().run((d) => deleteWire(d, second.id));
    expect(store.getState().focusWireId).toBe(first.id);
    store.getState().run((d) => deleteWire(d, first.id));
    expect(store.getState().focusWireId).toBeNull();
  });

  it('forgets the focused checklist wire when undo takes the routing back', () => {
    store.getState().replaceDocument({ ...createProject(), circuit: acceptanceCircuit() }, { projectId: null, undoable: false, dirty: false });
    store.getState().run((d) => applyRoutingResult(d, autoRoute(d.circuit), 0));
    store.getState().setFocusWire(store.getState().doc.circuit.wires[0].id);
    store.getState().undo();
    expect(store.getState().focusWireId).toBeNull();
  });

  it('replaces the document with or without an undo step', () => {
    place('74LS00', 10, 11);
    store.getState().replaceDocument(createProject('新的'), { projectId: 'p_1', undoable: true, dirty: true });
    expect(store.getState()).toMatchObject({ projectId: 'p_1', dirty: true, selection: null });
    expect(store.getState().doc.name).toBe('新的');
    store.getState().undo();
    expect(store.getState().doc.circuit.components.map((c) => c.id)).toEqual(['U1']);
    store.getState().replaceDocument(createProject(), { projectId: null, undoable: false, dirty: false });
    expect(store.getState().history).toEqual({ past: [], future: [] });
  });

  it('runs Check Circuit and remembers when it passed', () => {
    store.getState().runCheck();
    expect(store.getState().rightTab).toBe('check');
    expect(store.getState().checkPassedAt).not.toBeNull();
    place('74LS00', 10, 11);
    store.getState().runCheck();
    expect(store.getState().checkPassedAt).toBeNull();
  });

  it('analyses wires, routable nets and the score', () => {
    const analysis = analyzeCircuit(acceptanceCircuit());
    expect(analysis.wireCount).toBe(7);
    expect(analysis.netCount).toBe(4);
    expect(analysis.score).toBe(0);
    expect(analysis.liveCheck.length).toBeGreaterThan(0);
  });

  it('gives each notice a new id', () => {
    store.getState().notify('a');
    const first = store.getState().notice!.id;
    store.getState().notify('b', 'success');
    expect(store.getState().notice).toMatchObject({ text: 'b', tone: 'success' });
    expect(store.getState().notice!.id).toBeGreaterThan(first);
    store.getState().dismissNotice();
    expect(store.getState().notice).toBeNull();
  });
});
