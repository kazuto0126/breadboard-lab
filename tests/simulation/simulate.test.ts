import { describe, expect, it } from 'vitest';
import {
  adoptSimState,
  clockLevel,
  compileSimulation,
  initialSimState,
  nextClockEdge,
  settle,
  type SimInputs,
  type SimState,
} from '../../src/core/simulation/simulate';
import { toggleSwitch } from '../../src/editor/commands';
import type { Circuit } from '../../src/types/circuit';
import { circuit, comp, wire } from '../fixtures/build';
import { acceptanceCircuit, adderCircuit, counterCircuit } from '../fixtures/circuits';

const NO_INPUTS: SimInputs = { pressed: {}, clocks: {} };

/** 方便測試的模擬器：電路改變時沿用 IC 狀態（與畫面的行為相同）。 */
function simulator(start: Circuit) {
  let c = start;
  let sim = compileSimulation(c);
  let state: SimState = initialSimState(sim);
  let inputs: SimInputs = { pressed: {}, clocks: {} };
  const run = () => {
    const r = settle(sim, state, inputs);
    state = r.state;
    return r.result;
  };
  return {
    run,
    setCircuit(next: Circuit) {
      c = next;
      sim = compileSimulation(c);
      state = adoptSimState(sim, state);
      return run();
    },
    get circuit() {
      return c;
    },
    press(id: string, down: boolean) {
      inputs = { ...inputs, pressed: { ...inputs.pressed, [id]: down } };
      return run();
    },
    clock(id: string, level: 0 | 1) {
      inputs = { ...inputs, clocks: { ...inputs.clocks, [id]: level } };
      return run();
    },
  };
}

/** 有 VCC（T+ 軌）與 GND（B- 軌）、74LS00 在 F10 並接好電源的電路。 */
function poweredNand(components = [] as ReturnType<typeof comp>[], wires = [] as ReturnType<typeof wire>[]) {
  return circuit(
    [comp('V1', 'vcc', 'T+3'), comp('G1', 'gnd', 'B-3'), comp('U1', '74LS00', 'F10'), ...components],
    [wire('pv', 'T+10', 'A10'), wire('pg', 'B-16', 'J16'), ...wires],
  );
}

describe('compileSimulation', () => {
  it('finds sources, ICs, resistors and LEDs of the acceptance circuit', () => {
    const sim = compileSimulation(acceptanceCircuit());
    expect(sim.sources.map((s) => [s.componentId, s.level])).toEqual([
      ['V1', 1],
      ['G1', 0],
    ]);
    expect(sim.ics.map((i) => i.componentId)).toEqual(['U1']);
    expect(sim.resistors).toHaveLength(1);
    expect(sim.leds.map((l) => l.componentId)).toEqual(['D1']);
    expect(compileSimulation(sim.circuit)).toBe(sim);
  });
});

describe('settle', () => {
  it('lights the LED of the acceptance circuit (NAND inputs grounded → output HIGH)', () => {
    const sim = compileSimulation(acceptanceCircuit());
    const { result } = settle(sim, initialSimState(sim), NO_INPUTS);
    expect(result.stable).toBe(true);
    expect(result.unpowered).toEqual([]);
    expect(result.pinLevels['U1#1']).toBe(0);
    expect(result.pinLevels['U1#3']).toBe(1);
    expect(result.litLeds).toEqual(['D1']);
    expect(result.conflicts).toEqual([]);
  });

  it('reads a floating TTL input as HIGH but reports the node as Z', () => {
    const sim = compileSimulation(poweredNand());
    const { result } = settle(sim, initialSimState(sim), NO_INPUTS);
    expect(result.groupLevels['b1:c10-bot']).toBe('Z');
    expect(result.pinLevels['U1#3']).toBe(0); // NAND(1, 1)
  });

  it('leaves an IC without power undriven', () => {
    const c = circuit([comp('V1', 'vcc', 'T+3'), comp('U1', '74LS00', 'F10')], [wire('pv', 'T+10', 'A10')]);
    const sim = compileSimulation(c);
    const { result } = settle(sim, initialSimState(sim), NO_INPUTS);
    expect(result.unpowered).toEqual(['U1']);
    expect(result.pinLevels['U1#3']).toBe('Z');
  });

  it('uses resistors as weak pull-ups and pull-downs', () => {
    // 1A 經電阻接 GND（下拉），2A 經電阻接 VCC（上拉）。
    const c = poweredNand(
      [comp('R1', 'resistor', 'H20'), comp('R2', 'resistor', 'H30')],
      [wire('a', 'J10', 'J20'), wire('b', 'I24', 'B-24'), wire('c', 'J13', 'J30'), wire('d', 'I34', 'T+34')],
    );
    const sim = compileSimulation(c);
    const { result } = settle(sim, initialSimState(sim), NO_INPUTS);
    expect(result.groupLevels['b1:c10-bot']).toBe(0);
    expect(result.groupLevels['b1:c13-bot']).toBe(1);
    expect(result.pinLevels['U1#3']).toBe(1); // NAND(0, 1B 浮接) = 1
  });

  it('marks two outputs fighting over one node as X', () => {
    // 1A 接 GND → 1Y = 1；4A、4B 浮接 → 4Y = 0；把 1Y 與 4Y 接在一起 → X。
    const c = poweredNand([], [wire('g', 'J10', 'B-10'), wire('short', 'J12', 'A13')]);
    const sim = compileSimulation(c);
    const { result } = settle(sim, initialSimState(sim), NO_INPUTS);
    expect(result.conflicts).toContain('b1:c12-bot');
    expect(result.pinLevels['U1#3']).toBe('X');
  });

  it('switches a DIP switch: ON ties the input to GND', () => {
    // 指撥開關 SW1 在 F30：第 1 個開關接通 F30（腳 1）與 E30（腳 8）。E30 那一側接 GND，F30 那一側接 1A。
    const base = poweredNand(
      [comp('G2', 'gnd', 'T-3'), comp('SW1', 'dipsw-4', 'F30')],
      [wire('top', 'T-30', 'A30'), wire('in', 'H30', 'H10')],
    );
    const s = simulator(base);
    expect(s.run().pinLevels['U1#3']).toBe(0); // 開關 OFF：1A 浮接 = 1
    expect(s.setCircuit(toggleSwitch(base, 'SW1', 0)).pinLevels['U1#3']).toBe(1);
  });

  it('holds the state of a NAND SR latch, unknown until first set', () => {
    // 1A = /S、1B = Q̄、1Y = Q；2A = /R、2B = Q、2Y = Q̄。/S、/R 用兩個按鈕接到 GND。
    const c = poweredNand(
      [comp('G2', 'gnd', 'T-3'), comp('S', 'pushbutton', 'J40'), comp('R', 'pushbutton', 'J50')],
      [
        wire('fb1', 'J11', 'J15'), // 1B ← 2Y
        wire('fb2', 'I12', 'I14'), // 2B ← 1Y
        wire('s', 'H10', 'H40'), // /S ← 按鈕 S 的腳 1
        wire('sg', 'I42', 'B-42'), // 按鈕 S 的另一側 → GND
        wire('r', 'G13', 'H50'), // /R ← 按鈕 R 的腳 1
        wire('rg', 'F52', 'B-52'),
      ],
    );
    const s = simulator(c);
    const first = s.run();
    expect(first.stable).toBe(true);
    expect(first.pinLevels['U1#3']).toBe('X'); // 上電狀態未知
    expect(s.press('S', true).pinLevels['U1#3']).toBe(1);
    expect(s.press('S', false).pinLevels['U1#3']).toBe(1); // 放開後保持
    expect(s.press('R', true).pinLevels['U1#3']).toBe(0);
    const held = s.press('R', false);
    expect(held.pinLevels['U1#3']).toBe(0);
    expect(held.pinLevels['U1#6']).toBe(1);
    expect(held.stable).toBe(true);
  });

  it('flags an oscillating loop as unstable', () => {
    // 1Y 接回 1B；1A 由按鈕控制：按下（1A = 0）時 1Y 穩定為 1，放開（1A = 1）後 1Y = NOT 1Y 震盪。
    const c = poweredNand(
      [comp('B1', 'pushbutton', 'J40')],
      [wire('fb', 'I11', 'I12'), wire('en', 'H10', 'H40'), wire('g', 'I42', 'B-42')],
    );
    const s = simulator(c);
    expect(s.press('B1', true).stable).toBe(true);
    const released = s.press('B1', false);
    expect(released.stable).toBe(false);
    expect(released.iterations).toBe(100);
  });

  it('counts button presses with the 74LS93 counter example', () => {
    const s = simulator(counterCircuit());
    s.run();
    const leds = () => ['D1', 'D2', 'D3', 'D4'].map((id) => (s.run().litLeds.includes(id) ? 1 : 0)).join('');
    expect(leds()).toBe('0000');
    const seen: string[] = [];
    for (let i = 1; i <= 6; i++) {
      s.press('SW1', true);
      s.press('SW1', false);
      seen.push(leds());
    }
    // D1 = QA（LSB）… D4 = QD。
    expect(seen).toEqual(['1000', '0100', '1100', '0010', '1010', '0110']);
  });

  it('adds A + B with the 74LS283 example (switch ON = LOW)', () => {
    const s = simulator(adderCircuit());
    const sum = () => {
      const lit = s.run().litLeds;
      return ['D1', 'D2', 'D3', 'D4', 'D5'].reduce((acc, id, bit) => acc + (lit.includes(id) ? 2 ** bit : 0), 0);
    };
    expect(sum()).toBe(15 + 15); // 全部 OFF：A = B = 1111，C0 = 0
    // A = 3（開關 3、4 ON → A3、A4 = 0）；B = 5（開關 6、8 ON → B2、B4 = 0）。
    let c = s.circuit;
    for (const k of [2, 3, 5, 7]) c = toggleSwitch(c, 'SW1', k);
    s.setCircuit(c);
    expect(sum()).toBe(3 + 5);
  });

  it('keeps flip-flop state when the circuit is edited, and resets new ICs', () => {
    const s = simulator(counterCircuit());
    s.run();
    s.press('SW1', true);
    s.press('SW1', false);
    const moved = { ...s.circuit, wires: [...s.circuit.wires] };
    expect(s.setCircuit(moved).litLeds).toContain('D1');
    const sim = compileSimulation(moved);
    const fresh = adoptSimState(sim, { models: { U1: { defId: '74LS00', state: { prev: {}, bits: [] } } }, outputs: {} });
    expect(fresh.models.U1.defId).toBe('74LS93');
  });

  it('drives a node from a clock source', () => {
    const c = poweredNand([comp('CLK1', 'clock', 'J5')], [wire('c', 'I5', 'I10')]);
    const s = simulator(c);
    expect(s.clock('CLK1', 0).pinLevels['U1#3']).toBe(1);
    expect(s.clock('CLK1', 1).pinLevels['U1#3']).toBe(0);
  });
});

describe('clock timing', () => {
  it('starts LOW and toggles every half period', () => {
    expect([0, 499, 500, 999, 1000].map((t) => clockLevel(1, t))).toEqual([0, 0, 1, 1, 0]);
    expect(clockLevel(10, 50)).toBe(1);
    expect(clockLevel(0.5, 999)).toBe(0);
  });

  it('finds the next edge of any clock', () => {
    expect(nextClockEdge([1, 2], 0)).toBe(250);
    expect(nextClockEdge([1], 500)).toBe(1000);
    expect(nextClockEdge([], 0)).toBeNull();
  });
});
