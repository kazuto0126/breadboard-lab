import { describe, expect, it } from 'vitest';
import { explainWire } from '../../src/editor/explain/wire';
import type { Wire } from '../../src/types/circuit';
import { circuit, comp, straightWire } from '../fixtures/build';

const auto = (w: Wire): Wire => ({ ...w, source: 'auto' });
const r = (id: string, at: string, rotation: 0 | 90 = 0) => comp(id, 'resistor', at, { rotation });

describe('explainWire', () => {
  it('follows a two-wire hop through an empty row and says why one wire cannot do it', () => {
    // R1 第 2 腳在 A14（上半），R2 第 1 腳在 H20（下半）；經過第 20 欄上半當轉接排。
    const c = circuit([r('R1', 'A10'), r('R2', 'H20')], [auto(straightWire('w1', 'B14', 'B20')), auto(straightWire('w2', 'E20', 'G20'))]);
    const e = explainWire(c, 'w2')!;
    expect(e.summary).toMatch(/負責把 R1 第 2 腳.*接到 R2 第 1 腳/);
    expect(e.chain.map((x) => x.wireId)).toEqual(['w1', 'w2']);
    expect(e.chain[0].text).toBe('B14 → B20：B14 和 R1 第 2 腳同一排；B20 那一排是空的，當成轉接排。');
    expect(e.why).toBe('兩端不在同一列、也不在同一欄，一條直線接不到，所以經過轉接排轉彎。');
    expect(explainWire(c, 'w1')!.chain).toEqual(e.chain);
  });

  it('says a straight wire would have worked when it would', () => {
    const c = circuit([r('R1', 'A10'), r('R2', 'A20')], [auto(straightWire('w1', 'B14', 'B18')), auto(straightWire('w2', 'C18', 'C20'))]);
    expect(explainWire(c, 'w1')!.why).toMatch(/^其實也可以一條線直接接（例如 B14 → B20）/);
  });

  it('names what blocks the straight line', () => {
    // R3 直立在第 17 欄，A–E 每一列的直線都會經過它。
    const c = circuit(
      [r('R1', 'A10'), r('R2', 'A20'), r('R3', 'A17', 90)],
      [auto(straightWire('w1', 'E14', 'G14')), auto(straightWire('w2', 'H14', 'H20')), auto(straightWire('w3', 'G20', 'D20'))],
    );
    const e = explainWire(c, 'w2')!;
    expect(e.chain.map((x) => x.wireId)).toEqual(['w1', 'w2', 'w3']);
    expect(e.why).toMatch(/^兩端雖然可以排成一直線（例如 B14 → B20），但中間會經過 R3/);
  });

  it('describes power wires with the rail name and has no why for one wire', () => {
    const c = circuit([comp('U1', '74LS00', 'F10'), comp('V1', 'vcc', 'T+3')], [auto(straightWire('p1', 'A10', 'T+10'))]);
    const e = explainWire(c, 'p1')!;
    expect(e.summary).toMatch(/^這條線把 U1 第 14 腳（VCC）接到上方的 \+ 電源軌，屬於 .+（電源）。$/);
    expect(e.chain[0].text).toContain('T+10 插在上方的 + 電源軌');
    expect(e.why).toBeNull();
  });

  it('stops at a branching row and skips why for manual wires', () => {
    const c = circuit(
      [r('R1', 'A10'), r('R2', 'A20'), r('R3', 'A30')],
      [straightWire('w1', 'B14', 'B18'), straightWire('w2', 'C18', 'C20'), straightWire('w3', 'D18', 'D30')],
    );
    const e = explainWire(c, 'w1')!;
    expect(e.chain.map((x) => x.wireId)).toEqual(['w1']);
    expect(e.chain[0].text).toContain('B18 那一排是分岔點（接 3 條線）');
    expect(e.why).toBeNull();
  });

  it('handles loops and dangling wires', () => {
    const loop = circuit([], [straightWire('a', 'A10', 'A20'), straightWire('b', 'B20', 'B30'), straightWire('c', 'C30', 'C40'), straightWire('d', 'D40', 'D10')]);
    expect(explainWire(loop, 'a')!.chain).toHaveLength(4);
    const lone = explainWire(circuit([], [straightWire('x', 'A10', 'A20')]), 'x')!;
    expect(lone.summary).toBe('這條線兩端都沒有接到元件或電源。');
    expect(lone.chain[0].text).toContain('A10 那一排沒有接到別的東西');
    expect(explainWire(circuit([]), 'nope')).toBeNull();
  });
});
