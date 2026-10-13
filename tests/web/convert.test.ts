import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bcdDiagram, majorityDiagram } from '../../src/logic/examples';
import { initialLogicState, useLogic } from '../../src/state/logic';
import { initialState, useStore } from '../../src/state/store';
import { circuit, comp } from '../fixtures/build';

const S = () => useStore.getState();

beforeEach(() => {
  useStore.setState(initialState());
  useLogic.setState(initialLogicState());
});

describe('convertLogic', () => {
  it('replaces the breadboard in one undo step, switches to it and starts routing', async () => {
    const before = circuit([comp('R9', 'resistor', 'A10')]);
    useStore.setState({ circuit: before, workspace: 'logic' });
    useLogic.getState().load(majorityDiagram());
    S().openDialog('to-breadboard');

    S().convertLogic({ switchTo: 'vcc', board: 'auto' });
    expect(S().circuit.components.map((c) => c.id)).toEqual(expect.arrayContaining(['SW1', 'U1', 'U2', 'D1']));
    expect(S().workspace).toBe('breadboard');
    expect(S().dialog).toBeNull();
    expect(S().conversion).toMatchObject({ switchTo: 'vcc', switchId: 'SW1', inputs: ['i1', 'i2', 'i3'], leds: { o1: 'D1' } });
    expect(S().routing).toMatchObject({ purpose: 'apply', moveIcs: true });

    S().cancelRouting();
    await vi.waitFor(() => expect(S().routing).toBeNull(), { timeout: 30_000 });
    S().undo();
    expect(S().circuit).toBe(before);
  });

  it('remembers which display shows which node', async () => {
    useLogic.getState().load(bcdDiagram());
    S().convertLogic({ switchTo: 'gnd', board: 'auto' });
    expect(S().conversion).toMatchObject({ switchTo: 'gnd', leds: {}, displays: { d1: 'DS1' } });
    S().cancelRouting();
    await vi.waitFor(() => expect(S().routing).toBeNull(), { timeout: 30_000 });
  });

  it('explains why a diagram cannot be converted and keeps the breadboard', () => {
    const before = S().circuit;
    S().convertLogic({ switchTo: 'vcc', board: 'auto' });
    expect(S().circuit).toBe(before);
    expect(S().toasts.at(-1)?.message).toBe('邏輯圖要有輸入端和輸出端才能轉');
    expect(S().conversion).toBeNull();
  });

  it('forgets the conversion when another circuit is loaded', async () => {
    useLogic.getState().load(majorityDiagram());
    S().convertLogic({ switchTo: 'gnd', board: 'auto' });
    S().cancelRouting();
    await vi.waitFor(() => expect(S().routing).toBeNull(), { timeout: 30_000 });
    expect(S().conversion).not.toBeNull();
    S().newCircuit();
    expect(S().conversion).toBeNull();
  });
});
