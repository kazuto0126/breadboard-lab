import { beforeEach, describe, expect, it, vi } from 'vitest';
import { groupMembers, MAX_BOARDS, snapBoardMove, snapUnits } from '../../src/editor/boards';
import { findLibraryItem } from '../../src/editor/library';
import { planWirePath } from '../../src/editor/manualWire';
import { emptyCircuit, serializeCircuitFile } from '../../src/editor/fileFormat';
import { deriveMode, initialState, isComparisonFresh, isDirty, planAnimation, useStore } from '../../src/state/store';
import { acceptanceCircuit, adderCircuit, counterCircuit } from '../fixtures/circuits';
import { board, circuit, comp, holeOn, latticeWire, wire } from '../fixtures/build';

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

describe('multiple breadboards', () => {
  /** b1 在上、b2 貼在正下方（同一個群組）。 */
  function stacked() {
    s().addBoard();
    const plan = snapBoardMove(s().circuit, ['b2'], 0.6, -4.7, snapUnits(1));
    expect(plan.snap).toMatchObject({ targetId: 'b1', side: 'bottom' });
    s().moveBoards(['b2'], plan.dx, plan.dy);
  }
  const position = (id: string) => {
    const b = s().circuit.boards.find((x) => x.id === id)!;
    return [Math.round(b.x / 2.54), Math.round(b.y / 2.54), b.groupId];
  };

  it('adds a board, snaps it into a group and moves the group together (38.19 #1–#4)', () => {
    s().addBoard();
    expect(s().circuit.boards.map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(s().selection).toEqual({ kind: 'board', id: 'b2' });
    expect(isDirty(s())).toBe(true);
    s().undo();
    expect(s().circuit.boards).toHaveLength(1);

    stacked();
    expect([position('b1'), position('b2')]).toEqual([
      [0, 0, 'g-b1'],
      [0, 20, 'g-b1'],
    ]);
    // 拖曳 b1：整組一起移動。
    s().moveBoards(groupMembers(s().circuit, 'b1'), 5, 3);
    expect([position('b1'), position('b2')]).toEqual([
      [5, 3, 'g-b1'],
      [5, 23, 'g-b1'],
    ]);
    expect(s().history.past.map((e) => e.label).slice(-2)).toEqual(['移動麵包板 b2', '移動麵包板群組（b1、b2）']);
  });

  it('refuses overlapping boards and breaking cross-board wires', () => {
    stacked();
    s().moveBoards(['b2'], 0, -10);
    expect(position('b2')).toEqual([0, 20, 'g-b1']);
    expect(s().toasts.at(-1)?.message).toContain('不能重疊');

    s().addWire(planWirePath(s().circuit, holeOn('b1', 'J12'), holeOn('b2', 'A12'), 'v'));
    expect(new Set(s().circuit.wires[0].path.map((p) => p.boardId))).toEqual(new Set(['b1', 'b2']));
    s().moveBoards(['b2'], 0, 10);
    expect(position('b2')).toEqual([0, 20, 'g-b1']);
    expect(s().toasts.at(-1)?.message).toContain('w1');
    s().detachBoard('b2');
    expect(position('b2')).toEqual([0, 20, 'g-b1']);
    expect(s().toasts.at(-1)?.message).toContain('請先刪除這些導線');

    // 刪掉導線後就可以拆開（38.19 #5）。
    s().deleteWire('w1');
    s().detachBoard('b2');
    expect(position('b2')).toEqual([0, 22, null]);
    expect(position('b1')).toEqual([0, 0, null]);
  });

  it('deletes a board with its parts and wires, but never the last one', () => {
    stacked();
    s().placeComponent(findLibraryItem('led-red')!, 0, 'b2', { x: 10, y: 4 });
    s().select({ kind: 'board', id: 'b2' });
    s().deleteSelection();
    expect(s().circuit.boards.map((b) => b.id)).toEqual(['b1']);
    expect(s().circuit.components).toEqual([]);
    expect(s().toasts.at(-1)?.message).toContain('1 個元件');
    s().removeBoard('b1');
    expect(s().circuit.boards).toHaveLength(1);
    s().undo();
    expect(s().circuit.boards).toHaveLength(2);
    expect(s().circuit.components.map((c) => c.boardId)).toEqual(['b2']);
  });

  it('moves a component to another board', () => {
    stacked();
    s().placeComponent(findLibraryItem('led-red')!, 0, 'b1', { x: 10, y: 4 });
    s().moveComponent('D1', { x: 30, y: 12 }, undefined, 'b2');
    expect(s().circuit.components[0]).toMatchObject({ boardId: 'b2', anchor: { x: 30, y: 12 } });
  });

  it('routes a two-board group and treats a board move as a new layout for compare', async () => {
    const c = circuit(
      [comp('D1', 'led', 'H11'), comp('D2', 'led', 'C12', { board: 'b2' })],
      [latticeWire([board('b1'), board('b2', 0, 20)], 'w1', holeOn('b1', 'J12'), holeOn('b2', 'A12'))],
      [board('b1'), board('b2', 0, 20)],
    );
    s().loadCircuit(c, null);
    s().setMode('compare');
    await routed();
    expect(s().comparison?.result.status).toBe('success');
    expect(isComparisonFresh(s())).toBe(true);
    s().closeCompare();
    s().moveBoards(['b1', 'b2'], 3, 0);
    expect(isComparisonFresh(s())).toBe(false);
  });

  it('caps the number of boards', () => {
    for (let i = 0; i < 10; i++) s().addBoard();
    expect(s().circuit.boards).toHaveLength(MAX_BOARDS);
    expect(s().toasts.at(-1)?.message).toContain(`最多只能放 ${MAX_BOARDS} 塊`);
  });
});

describe('wiring checklist', () => {
  it('ticks wires without touching the undo history, and clears them', () => {
    s().loadCircuit(acceptanceCircuit(), null);
    s().setWireChecked('w1', true);
    s().setWireChecked('w5', true);
    s().setWireChecked('nope', true);
    expect(Object.keys(s().checklist).sort()).toEqual(['w1', 'w5']);
    expect(s().history.past).toEqual([]);
    expect(isDirty(s())).toBe(false);
    s().setWireChecked('w1', false);
    expect(Object.keys(s().checklist)).toEqual(['w5']);
    s().clearChecklist();
    expect(s().checklist).toEqual({});
  });

  it('starts fresh when another circuit is loaded, unless the file brings its progress', () => {
    s().loadCircuit(acceptanceCircuit(), null);
    s().setWireChecked('w2', true);
    s().loadCircuit(counterCircuit(), null);
    expect(s().checklist).toEqual({});
    s().loadCircuit(acceptanceCircuit(), null, undefined, { w3: 'kept' });
    expect(s().checklist).toEqual({ w3: 'kept' });
  });

  it('selects a wire from the list without leaving the checklist tab', () => {
    s().setRightTab('checklist');
    s().select({ kind: 'wire', id: 'w1' }, { keepTab: true });
    expect(s().rightTab).toBe('checklist');
    s().select({ kind: 'wire', id: 'w1' });
    expect(s().rightTab).toBe('inspect');
  });
});

describe('viewport', () => {
  it('refits when the canvas resizes until the user zooms or pans', () => {
    s().setCanvasSize(1200, 700);
    s().fitToScreen();
    const wide = s().viewport;
    s().setCanvasSize(600, 900);
    expect(s().viewportAuto).toBe(true);
    expect(s().viewport.scale).toBeLessThan(wide.scale);

    s().zoomBy(1.5);
    expect(s().viewportAuto).toBe(false);
    const zoomed = s().viewport;
    s().setCanvasSize(1200, 700);
    expect(s().viewport).toBe(zoomed);

    s().fitToScreen();
    s().setViewport({ ...s().viewport, x: s().viewport.x + 40 });
    const panned = s().viewport;
    s().setCanvasSize(800, 600);
    expect(s().viewport).toBe(panned);

    s().fitToScreen();
    s().setCanvasSize(1000, 800);
    expect(s().viewport).not.toBe(panned);
    expect(s().viewportAuto).toBe(true);
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

describe('simulation mode', () => {
  const leds = (ids: string[]) => ids.map((id) => (s().simulation!.result.litLeds.includes(id) ? 1 : 0)).join('');

  it('lights the LED of the acceptance circuit and stops cleanly', () => {
    s().loadCircuit(acceptanceCircuit(), null);
    s().startSimulation();
    expect(s().simulation?.result.litLeds).toEqual(['D1']);
    s().stopSimulation();
    expect(s().simulation).toBeNull();
  });

  it('locks structural edits but keeps undo and property edits live', () => {
    s().loadCircuit(adderCircuit(), null);
    s().startSimulation();
    const before = s().circuit;
    s().placeComponent(findLibraryItem('led-red')!, 0, 'b1', { x: 5, y: 4 });
    s().deleteComponent('U1');
    s().runAutoRoute('apply');
    expect(s().circuit).toBe(before);
    expect(s().routing).toBeNull();
    expect(s().toasts.at(-1)?.message).toContain('模擬中');

    // A = 3、B = 5：撥開關 3、4、6、8 → 3 + 5 = 8，只有 D4（S4）亮。
    for (const k of [2, 3, 5, 7]) s().toggleSwitch('SW1', k);
    expect(leds(['D1', 'D2', 'D3', 'D4', 'D5'])).toBe('00010');
    s().undo(); // 開關 8 OFF → B = 13 → 3 + 13 = 16 → 只有 D5（C4）亮
    expect(leds(['D1', 'D2', 'D3', 'D4', 'D5'])).toBe('00001');
    s().stopSimulation();
  });

  it('counts button presses and resets to the power-up state', () => {
    s().loadCircuit(counterCircuit(), null);
    s().startSimulation();
    for (let i = 0; i < 3; i++) {
      s().pressButton('SW1', true);
      s().pressButton('SW1', false);
    }
    expect(leds(['D1', 'D2', 'D3', 'D4'])).toBe('1100');
    s().resetSimulation();
    expect(leds(['D1', 'D2', 'D3', 'D4'])).toBe('0000');
    s().stopSimulation();
  });

  it('runs clocks on a timer, pauses, and single-steps to the next edge', () => {
    vi.useFakeTimers();
    try {
      // 1 Hz 時脈接到 74LS04 的 1A；1Y 經電阻點亮 LED（時脈 LOW 時亮）。
      const c = circuit(
        [
          comp('V1', 'vcc', 'T+3'),
          comp('G1', 'gnd', 'B-3'),
          comp('U1', '74LS04', 'F10'),
          comp('CLK1', 'clock', 'J5'),
          comp('R1', 'resistor', 'H20'),
          comp('D1', 'led', 'H30'),
        ],
        [
          wire('pv', 'T+10', 'A10'),
          wire('pg', 'B-16', 'J16'),
          wire('in', 'I5', 'I10'),
          wire('out', 'J11', 'J20'),
          wire('r', 'J24', 'J30'),
          wire('k', 'J31', 'B-31'),
        ],
      );
      s().loadCircuit(c, null);
      s().startSimulation();
      expect(s().simulation?.result.litLeds).toEqual(['D1']); // t = 0：時脈 LOW → 1Y HIGH
      vi.advanceTimersByTime(500);
      expect(s().simulation?.time).toBe(500);
      expect(s().simulation?.result.litLeds).toEqual([]);
      s().toggleClockPause();
      vi.advanceTimersByTime(2000);
      expect(s().simulation?.time).toBe(500);
      s().stepClock();
      expect(s().simulation?.time).toBe(1000);
      expect(s().simulation?.paused).toBe(true);
      expect(s().simulation?.result.litLeds).toEqual(['D1']);
      s().stopSimulation();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops when another circuit is loaded', () => {
    s().loadCircuit(acceptanceCircuit(), null);
    s().startSimulation();
    s().loadCircuit(counterCircuit(), null);
    expect(s().simulation).toBeNull();
  });
});
