import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findLibraryItem } from '../../src/editor/library';
import { emptyCircuit, serializeCircuitFile } from '../../src/editor/fileFormat';
import { deriveMode, initialState, isComparisonFresh, isDirty, planAnimation, useStore } from '../../src/state/store';
import { acceptanceCircuit } from '../fixtures/circuits';
import { circuit, comp, wire } from '../fixtures/build';

/** Node 沒有 Worker，佈線會退回主執行緒（setTimeout）；等它結束。 */
async function routed() {
  await vi.waitFor(() => expect(useStore.getState().routing).toBeNull(), { timeout: 10_000 });
}

const s = () => useStore.getState();

beforeEach(() => {
  useStore.setState(initialState());
});

describe('editing with undo / redo', () => {
  it('places, moves, rotates and deletes a component, all undoable', () => {
    const ic = findLibraryItem('74LS00')!;
    s().placeComponent(ic, 0, 'b1', { x: 10, y: 11 });
    expect(s().circuit.components.map((c) => c.id)).toEqual(['U1']);
    expect(s().selection).toEqual({ kind: 'component', id: 'U1' });

    s().moveComponent('U1', { x: 20, y: 11 });
    s().rotateSelection();
    expect(s().circuit.components[0]).toMatchObject({ anchor: { x: 26, y: 8 }, rotation: 180 });
    s().deleteSelection();
    expect(s().circuit.components).toEqual([]);
    expect(s().selection).toBeNull();

    s().undo();
    s().undo();
    expect(s().circuit.components[0]).toMatchObject({ anchor: { x: 20, y: 11 }, rotation: 0 });
    s().redo();
    expect(s().circuit.components[0].rotation).toBe(180);
    expect(s().history.past.map((e) => e.label)).toEqual(['放置 74LS00 U1', '移動 74LS00 U1', '旋轉 74LS00 U1']);
  });

  it('colours a new wire from the rail it touches', () => {
    s().addWire([
      { boardId: 'b1', x: 6, y: 2 },
      { boardId: 'b1', x: 6, y: 3 },
      { boardId: 'b1', x: 6, y: 4 },
    ]);
    expect(s().circuit.wires[0]).toMatchObject({ id: 'w1', color: '#d32f2f', source: 'manual' });
    expect(s().selection).toEqual({ kind: 'wire', id: 'w1' });
  });

  it('refuses a span that would leave the board', () => {
    s().loadCircuit(circuit([comp('R1', 'resistor', 'A58')]), null);
    s().setSpan('R1', 8);
    expect(s().circuit.components[0].span).toBeUndefined();
    expect(s().toasts.at(-1)?.kind).toBe('warning');
  });

  it('tracks unsaved changes', () => {
    expect(isDirty(s())).toBe(false);
    s().placeComponent(findLibraryItem('led-red')!, 0, 'b1', { x: 5, y: 4 });
    expect(isDirty(s())).toBe(true);
  });
});

describe('AI standard routing and modes', () => {
  it('applies a successful routing as one undoable step and animates it', async () => {
    s().loadCircuit(acceptanceCircuit(), '驗收電路');
    expect(deriveMode(s())).toBe('manual');
    s().runAutoRoute('apply');
    expect(s().routing).not.toBeNull();
    await routed();
    expect(deriveMode(s())).toBe('auto');
    expect(s().circuit.wires.every((w) => w.source === 'auto')).toBe(true);
    expect(s().comparison?.result.status).toBe('success');
    expect(isComparisonFresh(s())).toBe(true);
    expect(s().animation).not.toBeNull();
    s().finishAnimation();
    expect(s().resultVisible).toBe(true);

    s().undo();
    expect(deriveMode(s())).toBe('manual');
    expect(s().circuit.wires.map((w) => w.id)).toEqual(['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7']);
  });

  it('switches between manual and AI wiring with the mode buttons', async () => {
    s().loadCircuit(acceptanceCircuit(), null);
    s().setMode('auto');
    await routed();
    expect(deriveMode(s())).toBe('auto');

    s().setMode('manual');
    expect(deriveMode(s())).toBe('manual');
    expect(s().history.past.at(-1)?.label).toBe('切回手動接線');

    // 有新鮮的對照時，COMPARE 不會重新計算。
    s().setMode('compare');
    expect(s().routing).toBeNull();
    expect(deriveMode(s())).toBe('compare');
  });

  it('leaves compare without touching the wires (regression: it used to re-route)', async () => {
    s().loadCircuit(acceptanceCircuit(), null);
    s().runAutoRoute('apply');
    await routed();
    const steps = s().history.past.length;
    s().setMode('compare');
    s().closeCompare();
    expect(s().view).toBe('edit');
    expect(s().routing).toBeNull();
    expect(s().history.past.length).toBe(steps);
    s().setMode('auto');
    expect(s().routing).toBeNull();
  });

  it('computes a comparison without applying it', async () => {
    s().loadCircuit(acceptanceCircuit(), null);
    const before = s().circuit;
    s().setMode('compare');
    await routed();
    expect(s().view).toBe('compare');
    expect(s().circuit).toBe(before);
    s().applyComparison();
    expect(deriveMode(s())).toBe('auto');
  });

  it('reports a failure and leaves the circuit untouched', async () => {
    const c = circuit(
      [
        comp('R1', 'resistor', 'A20', { rotation: 90, span: 1 }),
        comp('R2', 'resistor', 'C20', { rotation: 90, span: 1 }),
        comp('D1', 'led', 'E20'),
        comp('D2', 'led', 'C40'),
      ],
      [wire('u1', 'A20', 'A40')],
    );
    s().loadCircuit(c, null);
    s().runAutoRoute('apply');
    await routed();
    expect(s().circuit).toBe(c);
    expect(s().resultVisible).toBe(true);
    expect(s().comparison?.result.message).toBe('No valid routing solution.');
    expect(s().comparison?.result.failedNets[0].reason).toBe('NO_FREE_HOLE');
  });

  it('explains that there is nothing to route when nothing is wired', async () => {
    s().loadCircuit(circuit([comp('U1', '74LS00', 'F10')]), null);
    s().runAutoRoute('apply');
    await routed();
    expect(s().comparison).toBeNull();
    expect(s().toasts.at(-1)?.message).toContain('請先手動接線');
  });

  it('can cancel a running routing', async () => {
    s().loadCircuit(acceptanceCircuit(), null);
    s().runAutoRoute('apply');
    s().cancelRouting();
    await routed();
    expect(deriveMode(s())).toBe('manual');
    expect(s().toasts.at(-1)?.message).toContain('已取消');
  });

  it('plans a short animation, one wire after another', () => {
    const wires = acceptanceCircuit().wires;
    const a = planAnimation(wires);
    expect(Object.keys(a.delays)).toEqual(wires.map((w) => w.id));
    expect(a.delays.w1).toBe(0);
    expect(a.delays.w2).toBeGreaterThan(0);
    expect(a.totalMs).toBeLessThan(3000);
  });
});

describe('files', () => {
  it('imports a circuit file and resets the history', () => {
    s().placeComponent(findLibraryItem('led-red')!, 0, 'b1', { x: 5, y: 4 });
    s().importJson(serializeCircuitFile(acceptanceCircuit(), '匯入測試'));
    expect(s().projectName).toBe('匯入測試');
    expect(s().circuit.components).toHaveLength(5);
    expect(s().history.past).toEqual([]);
  });

  it('keeps the current circuit when an import is invalid', () => {
    s().importJson('{"format":"nope"}');
    expect(s().circuit).toEqual(emptyCircuit());
    expect(s().toasts.at(-1)).toMatchObject({ kind: 'error' });
  });
});
