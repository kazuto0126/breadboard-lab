import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addNode } from '../../src/logic/edit';
import { bcdDiagram, majorityDiagram } from '../../src/logic/examples';
import { emptyDiagram } from '../../src/logic/types';
import { initialLogicState, logicDirty, useLogic } from '../../src/state/logic';
import { initialState, isDirty, useStore } from '../../src/state/store';
import { circuit, comp } from '../fixtures/build';

const L = () => useLogic.getState();
const S = () => useStore.getState();

beforeEach(() => {
  useStore.setState(initialState());
  useLogic.setState(initialLogicState());
});

describe('logic store', () => {
  it('places parts with its own undo history, separate from the breadboard', () => {
    expect(L().place('AND', 4, 0)).toBe(true);
    expect(L().place('AND', 5, 0)).toBe(false);
    expect(L().diagram.nodes).toHaveLength(1);
    const breadboard = circuit([comp('R1', 'resistor', 'A10')]);
    useStore.setState({ circuit: breadboard });
    L().undo();
    expect(L().diagram.nodes).toHaveLength(0);
    expect(S().circuit.components).toHaveLength(1);
    L().redo();
    expect(L().diagram.nodes).toHaveLength(1);
  });

  it('toggles switches without undo, and deletes the selection', () => {
    L().load(majorityDiagram());
    L().toggleInput('i1');
    expect(L().diagram.nodes.find((n) => n.id === 'i1')!.value).toBe(1);
    expect(L().history.past).toHaveLength(0);
    L().setInputs({ i1: 0, i2: 1, i3: 1 });
    expect(L().diagram.nodes.filter((n) => n.kind === 'INPUT').map((n) => n.value)).toEqual([0, 1, 1]);
    L().select({ kind: 'node', id: 'g4' });
    L().deleteSelection();
    expect(L().diagram.nodes.some((n) => n.id === 'g4')).toBe(false);
    expect(L().diagram.wires.some((w) => w.from === 'g4' || w.to.node === 'g4')).toBe(false);
    expect(L().selection).toBeNull();
  });

  it('counts as unsaved work and is cleared by a new circuit', () => {
    expect(logicDirty()).toBe(false);
    L().apply(addNode(L().diagram, 'INPUT', 0, 0), '新增輸入端');
    expect(logicDirty()).toBe(true);
    expect(isDirty(S())).toBe(true);
    S().newCircuit();
    expect(L().diagram).toEqual(emptyDiagram());
    expect(logicDirty()).toBe(false);
  });

  it('counts a truth table task as unsaved work even without any parts', async () => {
    const { createTask } = await import('../../src/logic/task');
    const made = createTask(['A'], ['X']);
    if (!made.ok) throw new Error(made.reason);
    L().apply({ ok: true, diagram: { ...L().diagram, task: made.task } }, '建立題目');
    expect(logicDirty()).toBe(true);
    L().undo();
    expect(L().diagram.task).toBeUndefined();
    expect(logicDirty()).toBe(false);
  });

  it('loads the figure 2-5 example into the logic workspace', () => {
    S().loadExampleLogic('majority');
    expect(S().workspace).toBe('logic');
    expect(L().diagram.nodes).toHaveLength(8);
    expect(S().circuit.components).toHaveLength(0);
    expect(logicDirty()).toBe(false);
  });
});

describe('several parts at once', () => {
  it('deletes, copies and pastes a selection, each as one undo step', () => {
    L().load(majorityDiagram());
    L().select({ kind: 'nodes', ids: ['i1', 'i2', 'g1'] });
    L().copy();
    L().paste();
    expect(L().diagram.nodes).toHaveLength(11);
    expect(L().selection).toEqual({ kind: 'nodes', ids: ['i4', 'i5', 'g5'] });
    L().deleteSelection();
    expect(L().diagram.nodes).toHaveLength(8);
    L().undo();
    expect(L().diagram.nodes).toHaveLength(11);
    L().undo();
    expect(L().diagram.nodes).toHaveLength(8);
  });

  it('remembers which side was open', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    try {
      S().setWorkspace('logic');
      expect(store.get('breadboard-lab:workspace')).toBe('logic');
      expect(initialState().workspace).toBe('logic');
      S().setWorkspace('breadboard');
      expect(initialState().workspace).toBe('breadboard');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('turning the selection (sub-project 26)', () => {
  it('turns the selected gates in one undo step, and explains when nothing can turn', () => {
    L().load(majorityDiagram());
    L().select({ kind: 'nodes', ids: ['g1', 'g2', 'i1'] });
    expect(L().rotateSelection()).toBeNull();
    // 子專案 28 起輸入端也會轉。
    expect(L().diagram.nodes.filter((n) => n.rotation === 90).map((n) => n.id)).toEqual(['i1', 'g1', 'g2']);
    L().undo();
    expect(L().diagram.nodes.some((n) => n.rotation)).toBe(false);
    L().load(bcdDiagram());
    L().select({ kind: 'node', id: 'd1' });
    expect(L().rotateSelection()).toBe('7 段顯示器不能轉向');
    L().select(null);
    expect(L().rotateSelection()).toBeNull();
  });
});

describe('turning before placing and mirroring (sub-project 28)', () => {
  it('turns and mirrors the part being placed, then places it that way', () => {
    L().startPlacing('AND');
    L().turnPlacing('rotate');
    L().turnPlacing('flip');
    expect(L().placingTurn).toEqual({ rotation: 90, flip: true });
    expect(L().place('AND', 4, 4)).toBe(true);
    expect(L().diagram.nodes[0]).toMatchObject({ rotation: 90, flip: true });
    // 開始放下一個時重新從沒轉開始。
    L().startPlacing('OR');
    expect(L().placingTurn).toEqual({});
  });

  it('mirrors the selection in one undo step', () => {
    L().load(majorityDiagram());
    L().select({ kind: 'nodes', ids: ['g1', 'd9'] });
    expect(L().flipSelection()).toBeNull();
    expect(L().diagram.nodes.find((n) => n.id === 'g1')!.flip).toBe(true);
    L().undo();
    expect(L().diagram.nodes.some((n) => n.flip)).toBe(false);
  });
});
