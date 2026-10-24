import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bcdDiagram, majorityDiagram } from '../../src/logic/examples';
import { initialLogicState, useLogic } from '../../src/state/logic';
import { initialState, useStore } from '../../src/state/store';
import { conversionLanes } from '../../src/workers/routingClient';
import { circuit, comp } from '../fixtures/build';
import { handWired } from '../fixtures/handWired';

const S = () => useStore.getState();

beforeEach(() => {
  useStore.setState(initialState());
  useLogic.setState(initialLogicState());
});

describe('conversion workers (sub-project 41)', () => {
  it('keeps one core for the page and uses at most 4 workers', () => {
    expect(conversionLanes(undefined)).toBe(1);
    expect(conversionLanes(1)).toBe(1);
    expect(conversionLanes(2)).toBe(1);
    expect(conversionLanes(4)).toBe(3);
    expect(conversionLanes(16)).toBe(4);
  });
});

describe('convertLogic', () => {
  it('converts in the background, then puts the board and its routing in two undo steps', async () => {
    const before = circuit([comp('R9', 'resistor', 'A10')]);
    useStore.setState({ circuit: before, workspace: 'logic' });
    useLogic.getState().load(majorityDiagram());
    S().openDialog('to-breadboard');

    // 子專案 36：在背景試好幾種擺法；算完之前板子不變、不能編輯。
    S().convertLogic({ switchTo: 'vcc', board: 'auto' });
    expect(S().workspace).toBe('breadboard');
    expect(S().dialog).toBeNull();
    expect(S().routing).toMatchObject({ purpose: 'apply', moveIcs: true, converting: true });
    expect(S().circuit).toBe(before);
    await vi.waitFor(() => expect(S().routing).toBeNull(), { timeout: 120_000 });

    expect(S().circuit.components.map((c) => c.id)).toEqual(expect.arrayContaining(['SW1', 'U1', 'U2', 'D1']));
    // 子專案 22：比對改成依名稱，轉換只要把名稱填好（不再記住對應）。
    const part = (id: string) => S().circuit.components.find((c) => c.id === id)!;
    expect(part('SW1').props.labels).toEqual(['A', 'B', 'C', '']);
    expect(part('D1').props.labels).toEqual(['X']);
    expect(S().circuit.wires.length).toBeGreaterThan(0);
    expect(S().history.past.slice(-2).map((h) => h.label)[0]).toBe('邏輯圖轉成麵包板');
    S().undo();
    S().undo();
    expect(S().circuit).toBe(before);
  }, 120_000);

  it('keeps the breadboard when the conversion is cancelled', async () => {
    const before = S().circuit;
    useLogic.getState().load(majorityDiagram());
    S().convertLogic({ switchTo: 'vcc', board: 'auto' });
    S().cancelRouting();
    await vi.waitFor(() => expect(S().routing).toBeNull(), { timeout: 30_000 });
    expect(S().circuit).toBe(before);
    expect(S().toasts.at(-1)?.message).toBe('已取消轉成麵包板');
  });

  it('names the display after the diagram', async () => {
    useLogic.getState().load(bcdDiagram());
    S().convertLogic({ switchTo: 'gnd', board: 'auto' });
    await vi.waitFor(() => expect(S().routing).toBeNull(), { timeout: 120_000 });
    expect(S().circuit.components.find((c) => c.id === 'DS1')!.props.labels).toEqual(['S1']);
  }, 120_000);

  it('explains why a diagram cannot be converted and keeps the breadboard', () => {
    const before = S().circuit;
    S().convertLogic({ switchTo: 'vcc', board: 'auto' });
    expect(S().circuit).toBe(before);
    expect(S().toasts.at(-1)?.message).toBe('邏輯圖要有輸入端和輸出端才能轉');
  });

});

describe('checking against the diagram (sub-project 22)', () => {
  it('sets the switches to a row in one undo step and starts the simulation', () => {
    S().loadCircuit(handWired({ chip: '74LS86', labels: { sw1: ['A'], sw2: ['', '', 'B'], led: ['X'] } }), 'x');
    const before = S().circuit;
    const inputs = [
      { node: 'i1', switchId: 'SW1', index: 0, onIs: 1 as const },
      { node: 'i2', switchId: 'SW2', index: 2, onIs: 0 as const },
    ];
    S().applyDiagramRow(inputs, [1, 1]);
    const states = (id: string) => S().circuit.components.find((c) => c.id === id)!.props.switchStates;
    expect(states('SW1')).toEqual([true, true, false, false]); // A = 1、ON = 1 → ON；第 2 個（致能）不動
    expect(states('SW2')).toEqual([false, false, false, false]); // B = 1、ON = 0 → OFF
    expect(S().simulation).not.toBeNull();
    S().stopSimulation();
    S().undo();
    expect(S().circuit).toBe(before);
  });

  it('names the undo step with the task input names, even when they look like diagram node ids', () => {
    // 子專案 24：題目的輸入叫 i1（和邏輯圖的節點 id 一樣），復原步驟要寫 i1，不能寫成邏輯圖上那個節點的名稱。
    S().loadCircuit(handWired({ labels: { sw1: ['i1'], sw2: ['', '', 'B'], led: ['X'] } }), 'x');
    // 讀電路會換掉邏輯圖，所以之後才放多數決（它的節點 i1 名稱是 A）。
    useLogic.getState().load(majorityDiagram());
    S().applyDiagramRow([{ node: 'i1', switchId: 'SW1', index: 0, onIs: 1 }], [1], ['i1']);
    expect(S().history.past.at(-1)?.label).toBe('把開關撥成 i1 = 1');
    S().stopSimulation();
  });
});
