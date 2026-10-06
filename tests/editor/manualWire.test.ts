import { describe, expect, it } from 'vitest';
import { nodeIdOf } from '../../src/core/breadboard/naming';
import { stepDirection } from '../../src/core/circuit/wireGeometry';
import { validateCircuit } from '../../src/core/circuit/validate';
import { addWire } from '../../src/editor/commands';
import { defaultWireColor, isFreeHole, lShapePath, planWirePath, WIRE_COLORS } from '../../src/editor/manualWire';
import { buildOccupancy } from '../../src/editor/placement';
import { circuit, comp, hole, pt, wire } from '../fixtures/build';

function isOrthogonal(path: ReturnType<typeof planWirePath>): boolean {
  return path.every((p, i) => i === 0 || stepDirection(path[i - 1], p) !== null);
}

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

describe('planWirePath', () => {
  it('draws a straight wire when the way is clear', () => {
    const path = planWirePath(circuit([]), hole('A1'), hole('A5'));
    expect(path.map(nodeIdOf)).toEqual(['A1', 'A2', 'A3', 'A4', 'A5'].map((n) => nodeIdOf(hole(n))));
  });

  it('makes a single bend, choosing the preferred axis first', () => {
    const h = planWirePath(circuit([]), hole('A1'), hole('C4'), 'h');
    expect(stepDirection(h[0], h[1])).toBe('E');
    const v = planWirePath(circuit([]), hole('A1'), hole('C4'), 'v');
    expect(stepDirection(v[0], v[1])).toBe('S');
    for (const path of [h, v]) {
      expect(path).toHaveLength(6);
      expect(isOrthogonal(path)).toBe(true);
    }
  });

  it('goes around components instead of through them', () => {
    const c = circuit([comp('U1', '74LS00', 'F10')]);
    const path = planWirePath(c, hole('D8'), hole('D18'));
    const occ = buildOccupancy(c, 'b1');
    expect(isOrthogonal(path)).toBe(true);
    for (const p of path.slice(1, -1)) {
      expect(occ.pins.has(nodeIdOf(p)) || occ.bodies.has(nodeIdOf(p))).toBe(false);
    }
    const withWire = addWire(c, path, '#000').circuit;
    expect(validateCircuit(withWire).map((e) => e.code)).not.toContain('WIRE_THROUGH_OBSTACLE');
  });

  it('avoids running along other wires when there is room', () => {
    const c = circuit([], [wire('w1', 'C3', 'C9')]);
    const path = planWirePath(c, hole('C2'), hole('C10'));
    const used = new Set(c.wires[0].path.map(nodeIdOf));
    expect(path.some((p) => used.has(nodeIdOf(p)))).toBe(false);
  });

  it('falls back to an L shape when the target is walled in', () => {
    const c = circuit([], [wire('a', [2, 4], [5, 4]), wire('b', [1, 5], [1, 7]), wire('c', [1, 3], [3, 3])]);
    const path = planWirePath(c, hole('E1'), hole('A1'), 'h');
    expect(path).toEqual(lShapePath(hole('E1'), hole('A1'), 'h'));
  });

  it('returns a single point when start equals end', () => {
    expect(planWirePath(circuit([]), hole('A1'), hole('A1'))).toEqual([hole('A1')]);
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
