import { describe, expect, it } from 'vitest';
import { indexCircuit } from '../../src/core/circuit/circuitIndex';
import { extractNets } from '../../src/core/circuit/nets';
import { checkRoutingLegality, mismatchedNets } from '../../src/core/routing/legality';
import type { Wire } from '../../src/types/circuit';
import { circuit, comp, pt, wire, type Where } from '../fixtures/build';

// NET_1 = D1 陽極（第 10 欄上半）↔ D2 陽極（第 30 欄上半）；其他腳各自一個 Net。
const base = circuit([comp('D1', 'led', 'C10'), comp('D2', 'led', 'C30'), comp('D3', 'led', 'C50')], [wire('u1', 'A10', 'A30')]);
const NET = 'NET_1';
const auto = (id: string, ...points: Where[]): Wire => ({ ...wire(id, ...points), source: 'auto', netId: NET });
const codes = (wires: Wire[]) => checkRoutingLegality(base, wires).map((v) => v.code);

describe('checkRoutingLegality', () => {
  it('uses the expected reference net names', () => {
    expect(extractNets(base).map((n) => n.id)).toEqual(['NET_1', 'NET_2', 'NET_3', 'NET_4', 'NET_5']);
  });

  it('accepts a clean replacement wire', () => {
    expect(codes([auto('a1', 'B10', 'B30')])).toEqual([]);
  });

  it('flags broken paths', () => {
    const diagonal: Wire = { ...auto('a1', 'B10', 'B30'), path: [pt(10, 5), pt(11, 6)] };
    expect(codes([diagonal])).toContain('PATH_INVALID');
  });

  it('flags endpoints on pins, in a foreign group, shared, or without a net', () => {
    expect(codes([auto('a1', 'C10', 'B30')])).toContain('ENDPOINT_INVALID');
    expect(codes([auto('a1', 'B10', 'B50')])).toContain('ENDPOINT_INVALID');
    expect(codes([auto('a1', 'B10', 'B30'), auto('a2', 'B10', [10, 3], [30, 3], 'A30')])).toContain('ENDPOINT_INVALID');
    expect(codes([{ ...auto('a1', 'B10', 'B30'), netId: undefined }])).toContain('ENDPOINT_INVALID');
  });

  it('flags wires that pass over a pin', () => {
    expect(codes([auto('a1', 'B10', [11, 5], [11, 7], 'D30')])).toContain('THROUGH_OBSTACLE');
  });

  it('flags overlapping wires', () => {
    expect(codes([auto('a1', 'B10', 'B30'), auto('a2', 'A10', [12, 4], [12, 5], [20, 5], [20, 4], 'A30')])).toContain('OVERLAP');
  });

  it('flags missing and merged connections', () => {
    expect(codes([])).toContain('NET_MISMATCH');
    const index = indexCircuit(base);
    const reference = extractNets(base);
    expect(mismatchedNets(index, reference, [])).toEqual(['NET_1']);
    const merging: Wire[] = [auto('a1', 'B10', 'B30'), { ...auto('a2', 'B50', [50, 3], [31, 3], 'A31'), netId: 'NET_4' }];
    expect(mismatchedNets(index, reference, merging)).toEqual(['NET_3', 'NET_4']);
  });
});
