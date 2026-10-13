import { describe, expect, it } from 'vitest';
import { inputPins, nodeSize, outputPin, overlaps } from '../../src/logic/shapes';
import type { LogicNode } from '../../src/logic/types';

const gate = (inputs: number, x = 10, y = 20): LogicNode => ({ id: 'g1', kind: 'AND', x, y, inputs });

describe('logic shapes', () => {
  it('places pins on whole grid points for every input count', () => {
    expect([nodeSize(gate(2)), inputPins(gate(2)), outputPin(gate(2))]).toEqual([{ w: 4, h: 3 }, [{ x: 10, y: 20 }, { x: 10, y: 22 }], { x: 14, y: 21 }]);
    expect(inputPins(gate(3))).toEqual([{ x: 10, y: 20 }, { x: 10, y: 21 }, { x: 10, y: 22 }]);
    expect([nodeSize(gate(4)), inputPins(gate(4)), outputPin(gate(4))]).toEqual([
      { w: 4, h: 5 },
      [{ x: 10, y: 20 }, { x: 10, y: 21 }, { x: 10, y: 23 }, { x: 10, y: 24 }],
      { x: 14, y: 22 },
    ]);
    const not: LogicNode = { id: 'g2', kind: 'NOT', x: 0, y: 0, inputs: 1 };
    expect([nodeSize(not), inputPins(not), outputPin(not)]).toEqual([{ w: 3, h: 1 }, [{ x: 0, y: 0 }], { x: 3, y: 0 }]);
    const input: LogicNode = { id: 'i1', kind: 'INPUT', x: 0, y: 5, name: 'A', value: 0 };
    const output: LogicNode = { id: 'o1', kind: 'OUTPUT', x: 30, y: 5, name: 'X' };
    expect([inputPins(input), outputPin(input)]).toEqual([[], { x: 2, y: 5 }]);
    expect([inputPins(output), outputPin(output)]).toEqual([[{ x: 30, y: 5 }], null]);
  });

  it('lets parts touch but not overlap', () => {
    expect(overlaps(gate(2, 0, 0), gate(2, 4, 0))).toBe(false);
    expect(overlaps(gate(2, 0, 0), gate(2, 3, 2))).toBe(true);
    expect(overlaps(gate(2, 0, 0), gate(2, 0, 3))).toBe(false);
  });
});
