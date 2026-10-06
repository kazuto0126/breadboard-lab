import { describe, expect, it } from 'vitest';
import { circuit, comp, wire } from '../fixtures/build';
import { nextComponentId, nextWireId } from '../../src/editor/ids';

describe('ids', () => {
  it('numbers components per category after the current maximum', () => {
    const c = circuit([comp('U1', '74LS00', 'F10'), comp('U7', '74LS04', 'F30'), comp('R2', 'resistor', 'A40')]);
    expect(nextComponentId(c, 'ic')).toBe('U8');
    expect(nextComponentId(c, 'resistor')).toBe('R3');
    expect(nextComponentId(c, 'led')).toBe('D1');
    expect(nextComponentId(c, 'dip-switch')).toBe('SW1');
    expect(nextComponentId(c, 'pushbutton')).toBe('BTN1');
  });

  it('numbers manual wires and ignores auto-routed ids', () => {
    const c = circuit([], [wire('w3', 'A1', 'A3'), wire('w_NET_1_1', 'B1', 'B3')]);
    expect(nextWireId(c)).toBe('w4');
    expect(nextWireId(circuit([]))).toBe('w1');
  });
});
