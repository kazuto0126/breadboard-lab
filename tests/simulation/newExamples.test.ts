import { describe, expect, it } from 'vitest';
import { BCD_GLYPHS } from '../../src/core/simulation/models';
import { clockLevel, compileSimulation, initialSimState, settle, type SimState } from '../../src/core/simulation/simulate';
import { toggleSwitch } from '../../src/editor/commands';
import { EXAMPLES, sevenSegmentCircuit, timerCounterCircuit } from '../../src/editor/examples';

describe('example: 74LS47 + 7-segment display', () => {
  it('shows 0 with every switch ON and 5 after turning off A and C', () => {
    let c = sevenSegmentCircuit();
    const show = () => {
      const sim = compileSimulation(c);
      return settle(sim, initialSimState(sim), { pressed: {}, clocks: {} }).result.litSegments.DS1.join('');
    };
    expect(show()).toBe(BCD_GLYPHS[0]);
    c = toggleSwitch(toggleSwitch(c, 'SW1', 0), 'SW1', 2);
    expect(show()).toBe(BCD_GLYPHS[5]);
  });
});

describe('example: NE555 clock + 74LS93 counter', () => {
  it('counts on its own as simulated time passes', () => {
    const c = timerCounterCircuit();
    const sim = compileSimulation(c);
    let state: SimState = initialSimState(sim);
    const seen = new Set<string>();
    for (let t = 0; t <= 4000; t += 250) {
      const r = settle(sim, state, { pressed: {}, clocks: { U2: clockLevel(1, t) } });
      state = r.state;
      seen.add(r.result.litLeds.join(','));
    }
    expect(seen.size).toBeGreaterThan(2);
  });

  it('is listed in the examples menu with the 7-segment example', () => {
    expect(EXAMPLES.map((e) => e.id)).toEqual(expect.arrayContaining(['seven-segment', 'timer-counter']));
  });
});
