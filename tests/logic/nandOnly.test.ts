import { describe, expect, it } from 'vitest';
import { majorityDiagram } from '../../src/logic/examples';
import { toNandUnits, toNorUnits } from '../../src/logic/nandOnly';
import { decompose, evaluateUnits, type Unit, type UnitKind } from '../../src/logic/synth';

/** 對所有輸入組合比較兩組單元算出的 out。 */
function same(a: Unit[], b: Unit[], inputs: string[], out: string) {
  for (let r = 0; r < 1 << inputs.length; r++) {
    const values = Object.fromEntries(inputs.map((n, i) => [n, ((r >> i) & 1) as 0 | 1]));
    if (evaluateUnits(a, values)[out] !== evaluateUnits(b, values)[out]) return false;
  }
  return true;
}

describe('toNandUnits', () => {
  it.each([
    ['NOT', ['a'], 1],
    ['NAND2', ['a', 'b'], 1],
    ['AND2', ['a', 'b'], 2],
    ['OR2', ['a', 'b'], 3],
    ['NOR2', ['a', 'b'], 4],
    ['XOR2', ['a', 'b'], 4],
    ['AND3', ['a', 'b', 'c'], 4],
    ['AND4', ['a', 'b', 'c', 'd'], 6],
  ] as Array<[UnitKind, string[], number]>)('rewrites %s with NAND gates only', (kind, inputs, count) => {
    const original: Unit[] = [{ kind, inputs, output: 'y' }];
    const nand = toNandUnits(original, ['y']);
    expect(nand.every((u) => u.kind === 'NAND2')).toBe(true);
    expect(nand).toHaveLength(count);
    expect(same(original, nand, inputs, 'y')).toBe(true);
  });

  it('cancels double inversions and keeps the signal the output needs', () => {
    // AND 後面接 NOT 就是 NAND：只剩一個閘，而且輸出還是 y。
    const original: Unit[] = [
      { kind: 'AND2', inputs: ['a', 'b'], output: 't' },
      { kind: 'NOT', inputs: ['t'], output: 'y' },
    ];
    const nand = toNandUnits(original, ['y']);
    expect(nand).toEqual([{ kind: 'NAND2', inputs: ['a', 'b'], output: 'y' }]);
  });

  it('inverts a shared signal only once', () => {
    // 兩個 OR 都用到 NOT a。
    const original: Unit[] = [
      { kind: 'OR2', inputs: ['a', 'b'], output: 'y1' },
      { kind: 'OR2', inputs: ['a', 'c'], output: 'y2' },
    ];
    const nand = toNandUnits(original, ['y1', 'y2']);
    expect(nand).toHaveLength(5); // NOT a、NOT b、NOT c、兩個 NAND
    expect(same(original, nand, ['a', 'b', 'c'], 'y1') && same(original, nand, ['a', 'b', 'c'], 'y2')).toBe(true);
  });

  it('turns figure 2-5 into NAND gates with the same result', () => {
    const d = majorityDiagram();
    const units = decompose(d);
    const nand = toNandUnits(units, ['g4']);
    expect(nand.every((u) => u.kind === 'NAND2')).toBe(true);
    expect(same(units, nand, ['i1', 'i2', 'i3'], 'g4')).toBe(true);
    expect(nand.length).toBeLessThanOrEqual(3 * 2 + 2 * 3);
  });
});

describe('toNorUnits (sub-project 27)', () => {
  it.each([
    ['NOT', ['a'], 1],
    ['NOR2', ['a', 'b'], 1],
    ['OR2', ['a', 'b'], 2],
    ['AND2', ['a', 'b'], 3],
    ['NAND2', ['a', 'b'], 4],
    ['XOR2', ['a', 'b'], 5],
    ['AND3', ['a', 'b', 'c'], 6],
    ['AND4', ['a', 'b', 'c', 'd'], 9],
  ] as Array<[UnitKind, string[], number]>)('rewrites %s with NOR gates only', (kind, inputs, count) => {
    const original: Unit[] = [{ kind, inputs, output: 'y' }];
    const nor = toNorUnits(original, ['y']);
    expect(nor.every((u) => u.kind === 'NOR2')).toBe(true);
    expect(nor).toHaveLength(count);
    expect(same(original, nor, inputs, 'y')).toBe(true);
  });

  it('cancels double inversions: OR followed by NOT is one NOR', () => {
    const original: Unit[] = [
      { kind: 'OR2', inputs: ['a', 'b'], output: 't' },
      { kind: 'NOT', inputs: ['t'], output: 'y' },
    ];
    expect(toNorUnits(original, ['y'])).toEqual([{ kind: 'NOR2', inputs: ['a', 'b'], output: 'y' }]);
  });

  it('turns figure 2-5 into NOR gates with the same result', () => {
    const units = decompose(majorityDiagram());
    const nor = toNorUnits(units, ['g4']);
    expect(nor.every((u) => u.kind === 'NOR2')).toBe(true);
    expect(same(units, nor, ['i1', 'i2', 'i3'], 'g4')).toBe(true);
  });
});
