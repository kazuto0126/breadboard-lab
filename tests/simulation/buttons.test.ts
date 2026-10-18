import { describe, expect, it } from 'vitest';
import { validateCircuit } from '../../src/core/circuit/validate';
import { compileSimulation, initialSimState, settle } from '../../src/core/simulation/simulate';
import { circuit, comp, wire } from '../fixtures/build';

/**
 * 子專案 30：按鈕當輸入。74LS04 在 F10（第 1 腳 1A 在 F10、第 14 腳 VCC 在 E10、第 7 腳 GND 在 F16）；
 * 按鈕 BTN1 在 F30：第 30 欄一側接 +5 V，第 32 欄一側接 1A。沒有上 / 下拉電阻。
 */
function buttonToInverter(rail: 'T+' | 'T-') {
  return circuit(
    [comp('V1', 'vcc', 'T+3'), comp('G1', 'gnd', 'B-3'), comp('G2', 'gnd', 'T-5'), comp('U1', '74LS04', 'F10'), comp('BTN1', 'pushbutton', 'F30')],
    [wire('v', 'T+10', 'A10'), wire('g', 'B-16', 'J16'), wire('b1', `${rail}30`, 'A30'), wire('b2', 'J32', 'J10')],
  );
}

const level = (c: ReturnType<typeof buttonToInverter>, pressed: boolean) => {
  const sim = compileSimulation(c);
  return settle(sim, initialSimState(sim), { pressed: { BTN1: pressed }, clocks: {} }).result.pinLevels['U1#1'];
};

describe('a button without a pull resistor (sub-project 30)', () => {
  it('works like an ideal switch: released reads the opposite of the rail', () => {
    expect([level(buttonToInverter('T+'), false), level(buttonToInverter('T+'), true)]).toEqual([0, 1]);
    expect([level(buttonToInverter('T-'), false), level(buttonToInverter('T-'), true)]).toEqual([1, 0]);
  });

  it('gets the same warning as a DIP switch without a pull resistor', () => {
    const warnings = validateCircuit(buttonToInverter('T+')).filter((e) => e.code === 'SWITCH_NO_PULL');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('BTN1');
    expect(warnings[0].message).toContain('沒有下拉電阻');
  });
});
