import { describe, expect, it } from 'vitest';
import { bodyRect, boxOf, inputDir, inputPins, nodeSize, outputDir, outputPin, outputPins, overlaps } from '../../src/logic/shapes';
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

describe('turned parts (sub-project 26)', () => {
  const and = (rotation?: 90 | 180 | 270): LogicNode => ({ id: 'g1', kind: 'AND', x: 10, y: 20, inputs: 2, ...(rotation ? { rotation } : {}) });

  it('moves the pins around the part', () => {
    // 沒轉：輸入 (10, 20)、(10, 22)，輸出 (14, 21)。
    expect([inputPins(and(90)), outputPin(and(90)), boxOf(and(90))]).toEqual([[{ x: 12, y: 20 }, { x: 10, y: 20 }], { x: 11, y: 24 }, { w: 3, h: 4 }]);
    expect([inputPins(and(180)), outputPin(and(180)), boxOf(and(180))]).toEqual([[{ x: 14, y: 22 }, { x: 14, y: 20 }], { x: 10, y: 21 }, { w: 4, h: 3 }]);
    expect([inputPins(and(270)), outputPin(and(270)), boxOf(and(270))]).toEqual([[{ x: 10, y: 24 }, { x: 12, y: 24 }], { x: 11, y: 20 }, { w: 3, h: 4 }]);
    expect([and(), and(90), and(180), and(270)].map(outputDir)).toEqual(['E', 'S', 'W', 'N']);
    expect([and(), and(90), and(180), and(270)].map(inputDir)).toEqual(['W', 'N', 'E', 'S']);
    expect(nodeSize(and(90))).toEqual({ w: 4, h: 3 });
  });

  it('knows where the body is', () => {
    expect(bodyRect(and())).toEqual({ x0: 10, x1: 14, y0: 19.5, y1: 22.5 });
    expect(bodyRect(and(90))).toEqual({ x0: 9.5, x1: 12.5, y0: 20, y1: 24 });
    expect(bodyRect(and(180))).toEqual({ x0: 10, x1: 14, y0: 19.5, y1: 22.5 });
    expect(bodyRect(and(270))).toEqual({ x0: 9.5, x1: 12.5, y0: 20, y1: 24 });
  });

  it('uses the turned box for overlaps', () => {
    expect(overlaps(and(90), gate(2, 13, 20))).toBe(false);
    expect(overlaps(and(90), gate(2, 12, 23))).toBe(true);
  });

  it('turns IC blocks the same way', () => {
    const block: LogicNode = { id: 'b1', kind: 'BLOCK', chip: '74LS83', x: 0, y: 0, rotation: 90 };
    // 74LS83：9 個輸入、5 個輸出，沒轉時 6 × 10。
    expect(boxOf(block)).toEqual({ w: 10, h: 6 });
    expect(inputPins(block)[0]).toEqual({ x: 9, y: 0 });
    expect(outputPins(block)[0]).toEqual({ x: 9, y: 6 });
  });
});
