import { describe, expect, it } from 'vitest';
import { indexCircuit, pinPoint } from '../../src/core/circuit/circuitIndex';
import { validateCircuit } from '../../src/core/circuit/validate';
import { holeLabel } from '../../src/editor/analysis';
import { checkAgainstDiagram } from '../../src/logic/diagramCheck';
import { addNode, connect } from '../../src/logic/edit';
import { majorityDiagram } from '../../src/logic/examples';
import { DEFAULT_LAYOUT, toBreadboard, type ConvertOptions, type LayoutVariant } from '../../src/logic/toBreadboard';
import { emptyDiagram, type LogicDiagram } from '../../src/logic/types';
import type { Circuit } from '../../src/types/circuit';
import { encoder } from '../fixtures/labCircuits';
import { powerProblems } from '../fixtures/powerChecks';

/** 子專案 36（規格 2026-10-20 conversion-placement）：轉換的擺法（間隔、LED 的擺法、LED 分兩邊）。 */
const must = (r: { ok: true; diagram: LogicDiagram } | { ok: false; reason: string }) => {
  if (!r.ok) throw new Error(r.reason);
  return r.diagram;
};
const convert = (d: LogicDiagram, layout: Partial<LayoutVariant>, options: Partial<ConvertOptions> = {}) => {
  const r = toBreadboard(d, { switchTo: 'vcc', board: 'MB102', ...options }, { ...DEFAULT_LAYOUT, ...layout });
  if (!r.ok) throw new Error(r.reason);
  return r.circuit;
};
const at = (c: Circuit, id: string, pin: number) => holeLabel(c, pinPoint(indexCircuit(c), { componentId: id, pinNumber: pin })!);
const col = (label: string) => Number(/(\d+)$/.exec(label)![1]);
function passThrough(n: number): LogicDiagram {
  let d = emptyDiagram();
  for (let i = 0; i < n; i++) d = must(addNode(d, 'INPUT', 0, i * 3));
  for (let i = 0; i < n; i++) d = must(addNode(d, 'OUTPUT', 8, i * 3));
  for (let i = 0; i < n; i++) d = must(connect(d, `i${i + 1}`, { node: `o${i + 1}`, pin: 0 }));
  return d;
}
const sound = (d: LogicDiagram, c: Circuit) => {
  expect(validateCircuit(c).filter((e) => e.severity === 'error' && !e.code.startsWith('WIRE'))).toEqual([]);
  expect(checkAgainstDiagram(d, c)).toMatchObject({ kind: 'done', result: { mismatches: [] } });
  expect(powerProblems(c)).toEqual([]);
};

describe('layout variants for logic-to-breadboard (sub-project 36)', () => {
  it('keeps today’s layout by default', () => {
    expect(DEFAULT_LAYOUT).toEqual({ gap: 6, leds: 'pair', split: false });
    const r = toBreadboard(majorityDiagram(), { switchTo: 'vcc', board: 'MB102' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.circuit).toEqual(convert(majorityDiagram(), {}));
  });

  it('leaves the given number of columns between blocks', () => {
    const c = convert(majorityDiagram(), { gap: 2 });
    expect(col(at(c, 'U1', 1)) - (col(at(c, 'SW1', 1)) + 4)).toBe(2);
    expect(col(at(c, 'U2', 1)) - (col(at(c, 'U1', 1)) + 7)).toBe(2);
  });

  it('puts each LED below a resistor that straddles the gap, LEDs side by side', () => {
    const d = passThrough(3);
    const c = convert(d, { leds: 'straddle' });
    const leds = c.components.filter((x) => x.defId === 'led').map((x) => x.id);
    expect(leds).toHaveLength(3);
    const columns = leds.map((id) => {
      const anode = at(c, id, 1);
      expect(anode).toMatch(/^I\d+$/);
      expect(at(c, id, 2)).toBe(`I${col(anode) + 1}`);
      return col(anode);
    });
    expect(columns[1] - columns[0]).toBe(2);
    for (const r of c.components.filter((x) => x.defId === 'resistor')) {
      expect(at(c, r.id, 1)).toMatch(/^E\d+$/);
      expect(at(c, r.id, 2)).toBe(`F${col(at(c, r.id, 1))}`);
      expect(columns).toContain(col(at(c, r.id, 1)));
    }
    sound(d, c);
  });

  it('splits four or more LEDs around the switch and the ICs on an MB-102', () => {
    const d = passThrough(4);
    for (const leds of ['pair', 'straddle'] as const) {
      const c = convert(d, { leds, split: true });
      const sw = col(at(c, 'SW1', 1));
      const ledColumns = ['D1', 'D2', 'D3', 'D4'].map((id) => col(at(c, id, 1)));
      expect(ledColumns.filter((x) => x < sw).length, leds).toBeGreaterThanOrEqual(1);
      expect(ledColumns.filter((x) => x > sw).length, leds).toBeGreaterThanOrEqual(1);
      sound(d, c);
    }
  });

  it('every combination is wired as planned, with or without pull resistors', () => {
    for (const gap of [1, 2, 3, 4, 6])
      for (const leds of ['pair', 'straddle'] as const)
        for (const split of [false, true])
          for (const pulls of [false, true])
            for (const d of [majorityDiagram(), passThrough(4)]) sound(d, convert(d, { gap, leds, split }, { pulls }));
  });

  it('does not put the first 5V / GND symbol on a hole a pull resistor already uses', () => {
    // 間隔 1：開關在第 3 欄，第一個下拉電阻插在 B-3（以前的 GND 符號固定在那裡）。
    const c = convert(majorityDiagram(), { gap: 1 }, { pulls: true });
    expect(at(c, 'R1', 2)).toBe('B-3');
    sound(majorityDiagram(), c);
  });
});

describe('one row on the EIC-1106 (sub-project 38)', () => {
  const eicRow = (d: LogicDiagram, layout: Partial<LayoutVariant>, options: Partial<ConvertOptions> = {}) => {
    const r = toBreadboard(d, { switchTo: 'vcc', board: 'EIC1106', ...options }, { ...DEFAULT_LAYOUT, oneRow: true, ...layout });
    if (!r.ok) throw new Error(r.reason);
    return r.circuit;
  };
  const parts = (c: Circuit) => c.components.filter((x) => x.defId !== 'vcc' && x.defId !== 'gnd');

  it('puts the switch, the ICs and the LEDs in area 2, pull-downs plugged into P4−', () => {
    const d = encoder();
    const c = eicRow(d, { gap: 3, leds: 'straddle' }, { pulls: true });
    for (const x of parts(c)) expect(at(c, x.id, 1), x.id).toMatch(/^2-/);
    const pulls = c.components.filter((x) => x.defId === 'resistor' && /^2-J/.test(at(c, x.id, 1)));
    expect(pulls.length).toBeGreaterThanOrEqual(7);
    for (const r of pulls) expect(at(c, r.id, 2)).toMatch(/^P4-/);
    // 和 MB-102 一樣排成一排：開關 → IC → LED。
    expect(col(at(c, 'SW1', 1))).toBeLessThan(col(at(c, 'U1', 1)));
    expect(col(at(c, 'U2', 1))).toBeLessThan(col(at(c, 'D1', 1)));
    sound(d, c);
  });

  it('plugs pull-ups into P3+ when the switches go to GND', () => {
    const d = majorityDiagram();
    const c = eicRow(d, { gap: 2 }, { pulls: true, switchTo: 'gnd' });
    for (const x of parts(c)) expect(at(c, x.id, 1), x.id).toMatch(/^2-/);
    const pulls = c.components.filter((x) => x.defId === 'resistor' && /^2-A/.test(at(c, x.id, 1)) && x.rotation === 270);
    expect(pulls).toHaveLength(3);
    for (const r of pulls) expect(at(c, r.id, 2)).toMatch(/^P3\+/);
    sound(d, c);
  });

  it('every combination is wired as planned', () => {
    for (const gap of [2, 3, 6])
      for (const leds of ['pair', 'straddle'] as const)
        for (const split of [false, true])
          for (const pulls of [false, true])
            for (const d of [majorityDiagram(), passThrough(4), encoder()]) sound(d, eicRow(d, { gap, leds, split }, { pulls }));
  });

  it('has no effect on the MB-102', () => {
    expect(convert(majorityDiagram(), { oneRow: true })).toEqual(convert(majorityDiagram(), {}));
  });
});
