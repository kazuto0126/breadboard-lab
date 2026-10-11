import { describe, expect, it } from 'vitest';
import { getComponentDefinition } from '../../src/core/circuit/library';
import { compileSimulation, initialSimState, settle } from '../../src/core/simulation/simulate';
import { librarySections } from '../../src/editor/library';
import type { Circuit } from '../../src/types/circuit';
import { circuit, comp, wire } from '../fixtures/build';

const NEW_ICS: Array<[string, number, number, number]> = [
  // id、腳數、VCC 腳、GND 腳（資料表）
  ['74LS11', 14, 14, 7],
  ['74LS21', 14, 14, 7],
  ['74LS83', 16, 5, 12],
  ['74LS73', 14, 4, 11],
  ['74LS76', 16, 5, 13],
  ['74LS85', 16, 16, 8],
  ['74LS151', 16, 16, 8],
  ['74LS153', 16, 16, 8],
  ['74LS47', 16, 16, 8],
  ['NE555', 8, 8, 1],
];

describe('new IC definitions', () => {
  it.each(NEW_ICS)('%s has %i pins with VCC on %i and GND on %i', (id, pins, vcc, gnd) => {
    const def = getComponentDefinition(id)!;
    expect(def.category).toBe('ic');
    expect(def.pins).toHaveLength(pins);
    expect(def.pins.find((p) => p.role === 'power')?.number).toBe(vcc);
    expect(def.pins.find((p) => p.role === 'ground')?.number).toBe(gnd);
    expect(def.logic).not.toBeNull();
  });

  it('lists NE555 first in the IC section', () => {
    const ic = librarySections().find((s) => s.id === 'ic')!;
    expect(ic.title).toBe('IC（74LS、NE555）');
    expect(ic.items[0].defId).toBe('NE555');
    expect(ic.items.map((i) => i.defId)).toEqual(expect.arrayContaining(NEW_ICS.map(([id]) => id)));
  });
});

/** NE555 在 F10：第 1–4 腳在 F10–F13（GND TRIG OUT /RESET），第 5–8 腳在 E13–E10（CONT THRES DISCH VCC）。OUT 經 R1 點亮 D1。 */
function blinker(resetToGround = false, powered = true): Circuit {
  return circuit(
    [comp('V1', 'vcc', 'T+3'), comp('G1', 'gnd', 'B-3'), comp('U1', 'NE555', 'F10'), comp('R1', 'resistor', 'G20'), comp('D1', 'led', 'G26')],
    [
      ...(powered ? [wire('vcc', 'T+10', 'A10'), wire('gnd', 'J10', 'B-10')] : []),
      resetToGround ? wire('rst', 'J13', 'B-13') : wire('rst', 'J13', 'T+13'),
      wire('out', 'J12', 'J20'),
      wire('led', 'J24', 'J26'),
      wire('k', 'J27', 'B-27'),
    ],
  );
}
const lit = (c: Circuit, level: 0 | 1) => {
  const sim = compileSimulation(c);
  return settle(sim, initialSimState(sim), { pressed: {}, clocks: { U1: level } }).result.litLeds;
};

describe('NE555 as a clock source', () => {
  it('registers its oscillator as a clock with the frequency property', () => {
    const c = blinker();
    expect(compileSimulation(c).clocks).toEqual([expect.objectContaining({ componentId: 'U1', frequency: 1 })]);
    const fast = { ...c, components: c.components.map((k) => (k.id === 'U1' ? { ...k, props: { frequency: 5 } } : k)) };
    expect(compileSimulation(fast).clocks[0].frequency).toBe(5);
  });

  it('drives OUT with the oscillator', () => {
    expect(lit(blinker(), 0)).toEqual([]);
    expect(lit(blinker(), 1)).toEqual(['D1']);
  });

  it('keeps OUT low while /RESET is grounded', () => {
    expect(lit(blinker(true), 1)).toEqual([]);
  });

  it('stays dark without power', () => {
    expect(lit(blinker(false, false), 1)).toEqual([]);
  });
});
