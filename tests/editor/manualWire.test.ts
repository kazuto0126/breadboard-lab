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

  it('accepts a clear horizontal or vertical wire, also into a hole that already has a wire', () => {
    expect(straightWireProblem(base(), hole('A1'), hole('A5'))).toBeNull();
    expect(straightWireProblem(base(), hole('A1'), hole('E1'))).toBeNull();
    expect(straightWireProblem(base(), hole('A40'), hole('C40'))).toBeNull();
  });

  // 子專案 39（規格 2026-10-20 wiring-rules）：只能水平或垂直；轉彎要分成兩條。
  it('refuses a diagonal wire, also across two boards in a group', () => {
    expect(straightWireProblem(base(), hole('A1'), hole('E5'))).toEqual({ kind: 'diagonal' });
    const group = circuit([], [], [board('b1'), board('b2', 0, 20)]);
    expect(straightWireProblem(group, holeOn('b1', 'J5'), holeOn('b2', 'A8'))).toEqual({ kind: 'diagonal' });
    expect(straightWireProblem(group, holeOn('b1', 'J5'), holeOn('b2', 'A5'))).toBeNull();
  });

  // 子專案 39：兩條線不能十字交叉。
  it('refuses crossing another wire', () => {
    expect(straightWireProblem(base(), hole('A42'), hole('E42'))).toEqual({ kind: 'crossing', wireId: 'w1', point: hole('C42') });
    // 接在別條線的端點那一排（不是中段）不算交叉。
    expect(straightWireProblem(base(), hole('A46'), hole('E46'))).toBeNull();
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
    // 子專案 39：直的、橫的都不能跨過 IC。
    expect(straightWireProblem(base(), hole('D12'), hole('H12'))).toEqual({ kind: 'obstacle', point: hole('E12') });
    expect(straightWireProblem(base(), hole('E5'), hole('E20'))).toEqual({ kind: 'obstacle', point: hole('E10') });
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
    expect(straightProblemText(c, { kind: 'obstacle', point: hole('E12') })).toBe('導線不能跨過元件（例如 IC）或經過其他導線的端點（經過 E12）');
    expect(straightProblemText(c, { kind: 'diagonal' })).toBe('導線只能水平或垂直，不能斜著拉；要轉彎請分成兩條線（轉角接在同一排相通的孔）');
    expect(straightProblemText(c, { kind: 'crossing', wireId: 'w1', point: hole('C42') })).toBe('導線不能和導線 w1 交叉（在 C42）');
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
