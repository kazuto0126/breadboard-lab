import { describe, expect, it } from 'vitest';
import { extractNets } from '../../src/core/circuit/nets';
import { validateCircuit } from '../../src/core/circuit/validate';
import { compileSimulation, initialSimState, settle } from '../../src/core/simulation/simulate';
import { eicCircuit } from '../../src/editor/examples';
import type { Circuit } from '../../src/types/circuit';
import { holeOn, wire } from '../fixtures/build';

const at = (name: string) => holeOn('b1', name, 'EIC1106');
const lit = (c: Circuit) => {
  const sim = compileSimulation(c);
  return settle(sim, initialSimState(sim), { pressed: {}, clocks: {} }).result.litLeds;
};
const codes = (c: Circuit) => validateCircuit(c).map((e) => e.code);
/** 把 id 這條線換成 replacement。 */
const swap = (c: Circuit, id: string, replacement: ReturnType<typeof wire>) => ({ ...c, wires: c.wires.map((w) => (w.id === id ? replacement : w)) });

describe('binding posts as power', () => {
  it('powers the acceptance circuit from the red and black posts', () => {
    const c = eicCircuit();
    const nets = extractNets(c);
    expect(nets.find((n) => n.pins.some((p) => p.componentId === 'U1' && p.pinNumber === 14))?.kind).toBe('power');
    expect(nets.find((n) => n.pins.some((p) => p.componentId === 'U1' && p.pinNumber === 7))?.kind).toBe('ground');
    // 手動導線的路徑故意很亂（WIRE_*），這裡只看電氣上的錯誤。
    expect(validateCircuit(c).filter((e) => e.severity === 'error' && !e.code.startsWith('WIRE_'))).toEqual([]);
    expect(lit(c)).toEqual(['D1']);
  });

  it('a yellow post is not a power source', () => {
    const c = swap(eicCircuit(), 'vp', wire('vp', at('黃'), at('P3+5')));
    expect(codes(c)).toContain('IC_POWER_MISSING');
    expect(lit(c)).toEqual([]);
  });

  it('red and black posts tied together are a short', () => {
    const c = swap(eicCircuit(), 'vg', wire('vg', at('黑'), at('P3+7')));
    expect(codes(c)).toContain('SHORT_CIRCUIT');
  });

  it('reports a missing power source when no post or symbol is wired', () => {
    const c = { ...eicCircuit(), wires: eicCircuit().wires.filter((w) => w.id !== 'vp' && w.id !== 'vg') };
    expect(codes(c)).toContain('NO_POWER_SOURCE');
  });
});
