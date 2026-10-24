import { describe, expect, it } from 'vitest';
import { indexCircuit, pinPoint } from '../../src/core/circuit/circuitIndex';
import { validateCircuit } from '../../src/core/circuit/validate';
import { holeLabel } from '../../src/editor/analysis';
import { checkAgainstDiagram } from '../../src/logic/diagramCheck';
import { addNode, connect } from '../../src/logic/edit';
import { majorityDiagram } from '../../src/logic/examples';
import { DEFAULT_LAYOUT, switchText, toBreadboard, type ConvertOptions, type LayoutVariant } from '../../src/logic/toBreadboard';
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

describe('two 4-bit switches when pull resistors are on (sub-project 38)', () => {
  const build = (d: LogicDiagram, board: 'MB102' | 'EIC1106', layout: Partial<LayoutVariant>, options: Partial<ConvertOptions> = {}) => {
    const r = toBreadboard(d, { switchTo: 'vcc', board, ...options }, { ...DEFAULT_LAYOUT, ...(board === 'EIC1106' ? { oneRow: true as const } : {}), ...layout });
    if (!r.ok) throw new Error(r.reason);
    return r;
  };
  const labels = (c: Circuit, id: string) => c.components.find((x) => x.id === id)!.props.labels;

  it('splits eight inputs over two 4-bit switches so every pull resistor plugs straight into the rail', () => {
    const d = encoder();
    for (const switchTo of ['vcc', 'gnd'] as const) {
      const r = build(d, 'EIC1106', { gap: 2, splitSwitches: true }, { pulls: true, switchTo });
      const c = r.circuit;
      expect(c.components.filter((x) => x.defId.startsWith('dipsw')).map((x) => `${x.id}:${x.defId}`)).toEqual(['SW1:dipsw-4', 'SW2:dipsw-4']);
      // 子專案 45：依「哪顆 IC 先用到」分組：U1 用到的 C、D、E、F 在 SW1（以前照名稱 A–D、E–H）。
      expect(labels(c, 'SW1')).toEqual(['C', 'D', 'E', 'F']);
      expect(labels(c, 'SW2')).toEqual(['A', 'B', 'G', 'H']);
      // 8 顆都直立插進電源軌（沒有平放的電阻）。
      const rail = switchTo === 'vcc' ? /^P4-/ : /^P3\+/;
      const pulls = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'];
      for (const id of pulls) expect(at(c, id, 2), `${switchTo} ${id}`).toMatch(rail);
      // 第二個開關放在第一顆 IC 後面（和輸入靠近用到它的 IC）。
      expect(col(at(c, 'SW2', 1))).toBeGreaterThan(col(at(c, 'U1', 1)));
      expect(r.bom).toMatchObject({ switch: 'dipsw-4', switches: 2, resistors: 11 });
      sound(d, c);
    }
  });

  it('works on the MB-102 too', () => {
    const d = encoder();
    const r = build(d, 'MB102', { gap: 2, splitSwitches: true }, { pulls: true });
    expect(r.bom).toMatchObject({ switch: 'dipsw-4', switches: 2 });
    sound(d, r.circuit);
  });

  it('keeps one switch with four inputs or fewer, or with buttons (sub-project 47: without pull resistors the split is tried too)', () => {
    const d = encoder();
    expect(build(d, 'EIC1106', { splitSwitches: true }).bom).toMatchObject({ switch: 'dipsw-4', switches: 2 });
    expect(build(majorityDiagram(), 'MB102', { splitSwitches: true }, { pulls: true }).circuit).toEqual(build(majorityDiagram(), 'MB102', {}, { pulls: true }).circuit);
    // 按鈕（8 顆按鈕和 8 顆電阻排不進一排，用分區的擺法）。
    const buttons = (layout: Partial<LayoutVariant>) => toBreadboard(d, { switchTo: 'vcc', board: 'EIC1106', pulls: true, inputs: 'button' }, { ...DEFAULT_LAYOUT, ...layout });
    expect(buttons({ splitSwitches: true })).toEqual(buttons({}));
    expect(build(d, 'EIC1106', {}).bom).toMatchObject({ switch: 'dipsw-8', switches: 1 });
  });

  it('every combination with two switches is wired as planned', () => {
    for (const board of ['MB102', 'EIC1106'] as const)
      for (const gap of [1, 2, 3])
        for (const leds of ['pair', 'straddle'] as const)
          for (const switchTo of ['vcc', 'gnd'] as const) sound(encoder(), build(encoder(), board, { gap, leds, splitSwitches: true }, { pulls: true, switchTo }).circuit);
  });

  it('describes the switches in the parts list', () => {
    expect(switchText({ switch: 'dipsw-8', switches: 1, buttons: 0 })).toBe('8 位元指撥開關 × 1');
    expect(switchText({ switch: 'dipsw-4', switches: 2, buttons: 0 })).toBe('4 位元指撥開關 × 2');
    expect(switchText({ switch: null, switches: 0, buttons: 3 })).toBe('按鈕 × 3');
  });
});

describe('grouping two switches by IC (sub-project 45)', () => {
  it('puts the inputs the same IC uses first on the same switch, in name order, unused inputs last', async () => {
    const { splitByIc } = await import('../../src/logic/toBreadboard');
    const node = (id: string, name: string) => ({ id, kind: 'INPUT' as const, x: 0, y: 0, name });
    const inputs = 'ABCDEFGH'.split('').map((n, k) => node(`i${k + 1}`, n));
    // U1（0）用到 F、C、H、D；U2（1）用到 B、E；G、A 沒有 IC 用到。
    const order = new Map([['i6', 0], ['i3', 0], ['i8', 0], ['i4', 0], ['i2', 1], ['i5', 1]]);
    const [one, two] = splitByIc(inputs, order);
    expect(one.map((n) => n.name)).toEqual(['C', 'D', 'F', 'H']);
    expect(two.map((n) => n.name)).toEqual(['A', 'B', 'E', 'G']);
  });
});

describe('conversion improvements (sub-project 47)', () => {
  /** n 個輸入接 n 個輸出端，中間各經過一個 NOT（讓 IC 用到輸入）。 */
  function inverters(n: number): LogicDiagram {
    let d = emptyDiagram();
    for (let i = 0; i < n; i++) d = must(addNode(d, 'INPUT', 0, i * 3));
    for (let i = 0; i < n; i++) d = must(addNode(d, 'NOT', 6, i * 3));
    for (let i = 0; i < n; i++) d = must(addNode(d, 'OUTPUT', 12, i * 3));
    for (let i = 0; i < n; i++) {
      d = must(connect(d, `i${i + 1}`, { node: `g${i + 1}`, pin: 0 }));
      d = must(connect(d, `g${i + 1}`, { node: `o${i + 1}`, pin: 0 }));
    }
    return d;
  }
  const pullResistors = (c: Circuit) => c.components.filter((x) => x.defId === 'resistor' && x.props.resistance !== 220);

  it('puts every pull resistor in its switch column: six or more inputs use two 4-bit switches', () => {
    for (const n of [6, 7, 8]) {
      for (const board of ['MB102', 'EIC1106'] as const) {
        const r = toBreadboard(inverters(n), { switchTo: 'vcc', board, pulls: true }, DEFAULT_LAYOUT);
        if (!r.ok) throw new Error(r.reason);
        const switches = r.circuit.components.filter((x) => x.defId.startsWith('dipsw'));
        expect(switches.map((x) => x.defId), `${n} ${board}`).toEqual(['dipsw-4', 'dipsw-4']);
        // 每顆下拉電阻都直立（一端在開關那一排，另一端插進電源軌）。
        for (const res of pullResistors(r.circuit)) expect(res.rotation, `${n} ${board} ${res.id}`).toBe(90);
      }
    }
  });

  it('also tries two 4-bit switches without pull resistors', () => {
    const r = toBreadboard(inverters(6), { switchTo: 'vcc', board: 'EIC1106' }, { ...DEFAULT_LAYOUT, splitSwitches: true });
    if (!r.ok) throw new Error(r.reason);
    expect(r.circuit.components.filter((x) => x.defId.startsWith('dipsw')).map((x) => x.defId)).toEqual(['dipsw-4', 'dipsw-4']);
    sound(inverters(6), r.circuit);
  });

  it('keeps at least two free columns between neighbouring ICs in every layout', async () => {
    const { LAYOUT_VARIANTS } = await import('../../src/logic/convertRoute');
    const { getComponentDefinition } = await import('../../src/core/circuit/library');
    for (const d of [encoder(), inverters(8), majorityDiagram()])
      for (const [board, variants] of Object.entries(LAYOUT_VARIANTS))
        for (const variant of variants) {
          const r = toBreadboard(d, { switchTo: 'vcc', board: board as 'MB102' | 'EIC1106', pulls: true }, variant);
          if (!r.ok) continue;
          const ics = r.circuit.components
            .filter((x) => getComponentDefinition(x.defId)?.category === 'ic')
            .map((x) => ({ id: x.id, y: x.anchor.y, x0: x.anchor.x, x1: x.anchor.x + getComponentDefinition(x.defId)!.pins.length / 2 - 1 }))
            .sort((a, b) => a.y - b.y || a.x0 - b.x0);
          for (let k = 1; k < ics.length; k++) {
            if (ics[k].y !== ics[k - 1].y) continue;
            expect(ics[k].x0 - ics[k - 1].x1 - 1, `${board} ${JSON.stringify(variant)} ${ics[k - 1].id} → ${ics[k].id}`).toBeGreaterThanOrEqual(2);
          }
        }
  });
});
