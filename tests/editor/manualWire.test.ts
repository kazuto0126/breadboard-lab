import { describe, expect, it } from 'vitest';
import { defaultWireColor, isFreeHole, straightProblemText, straightWireProblem, WIRE_COLORS } from '../../src/editor/manualWire';
import { board, circuit, comp, hole, holeOn, pt, straightWire, wire } from '../fixtures/build';


describe('isFreeHole', () => {
  const c = circuit([comp('U1', '74LS00', 'F10'), comp('R1', 'resistor', 'A30')], [wire('w1', 'C40', 'C45')]);

  it('accepts empty holes only', () => {
    expect(isFreeHole(c, hole('A1'))).toBe(true);
    expect(isFreeHole(c, hole('F10'))).toBe(false); // 元件腳
    expect(isFreeHole(c, pt(12, 9))).toBe(false); // 凹槽（surface）
    expect(isFreeHole(c, hole('A31'))).toBe(false); // 電阻本體
    expect(isFreeHole(c, hole('C40'))).toBe(false); // 導線端點
    expect(isFreeHole(c, hole('C42'))).toBe(false); // 導線經過
    expect(isFreeHole(c, { boardId: 'b9', x: 1, y: 4 })).toBe(false);
  });
});

describe('straightWireProblem', () => {
  const base = () => circuit([comp('U1', '74LS00', 'F10'), comp('R1', 'resistor', 'A30')], [straightWire('w1', 'C40', 'C45')]);

  it('accepts a clear straight or diagonal wire, also into a hole that already has a wire', () => {
    expect(straightWireProblem(base(), hole('A1'), hole('E5'))).toBeNull();
    expect(straightWireProblem(base(), hole('A40'), hole('C40'))).toBeNull();
  });

  it('refuses ends on pins, bodies, non-holes, the same hole and another group', () => {
    expect(straightWireProblem(base(), hole('A1'), hole('F10'))).toEqual({ kind: 'pin', point: hole('F10') });
    expect(straightWireProblem(base(), hole('A1'), hole('A31'))).toEqual({ kind: 'pin', point: hole('A31') });
    expect(straightWireProblem(base(), hole('A1'), pt(12, 9))).toEqual({ kind: 'not-hole' });
    expect(straightWireProblem(base(), hole('A1'), hole('A1'))).toEqual({ kind: 'same-hole' });
    const apart = circuit([], [], [board('b1'), board('b2', 0, 40)]);
    expect(straightWireProblem(apart, holeOn('b1', 'A1'), holeOn('b2', 'A1'))).toEqual({ kind: 'other-group' });
  });

  it('refuses passing over an IC, a wire end, or overlapping a wire', () => {
    expect(straightWireProblem(base(), hole('D8'), hole('H14'))?.kind).toBe('obstacle');
    expect(straightWireProblem(base(), hole('A40'), hole('E40'))).toEqual({ kind: 'obstacle', point: hole('C40') });
    expect(straightWireProblem(base(), hole('C42'), hole('C48'))).toEqual({ kind: 'overlap', wireId: 'w1' });
  });

  it('refuses an end under another wire', () => {
    expect(straightWireProblem(base(), hole('A42'), hole('C42'))).toEqual({ kind: 'covered', wireId: 'w1', point: hole('C42') });
  });

  it('ignores the wire whose end is being moved', () => {
    expect(straightWireProblem(base(), hole('C40'), hole('C47'), 'w1')).toBeNull();
  });

  it('explains every problem in Chinese', () => {
    const c = base();
    expect(straightProblemText(c, { kind: 'obstacle', point: hole('E12') })).toBe('直線不能經過元件或其他導線的端點（經過 E12）');
    expect(straightProblemText(c, { kind: 'overlap', wireId: 'w1' })).toBe('直線不能和導線 w1 重疊');
    expect(straightProblemText(c, { kind: 'covered', wireId: 'w1', point: hole('C42') })).toBe('C42 上面有導線 w1 經過，不能接在這裡');
    expect(straightProblemText(c, { kind: 'pin', point: hole('F10') })).toBe('導線不能接在元件腳或被元件蓋住的孔（F10）');
    expect(straightProblemText(c, { kind: 'other-group' })).toBe('兩端要在同一塊板，或貼在一起的板子上');
    expect(straightProblemText(c, { kind: 'not-hole' })).toBe('導線的兩端要插在孔上');
  });
});

describe('defaultWireColor', () => {
  const c = circuit([]);
  it('uses red for + rails, black for − rails, otherwise the fallback', () => {
    expect(defaultWireColor(c, hole('T+5'), hole('A5'))).toBe(WIRE_COLORS[0].value);
    expect(defaultWireColor(c, hole('A5'), hole('B-9'))).toBe(WIRE_COLORS[1].value);
    expect(defaultWireColor(c, hole('A5'), hole('J9'), '#123456')).toBe('#123456');
  });
});
