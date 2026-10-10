import { describe, expect, it } from 'vitest';
import { buildLattice } from '../../src/core/breadboard/lattice';
import { indexCircuit } from '../../src/core/circuit/circuitIndex';
import { extractNets } from '../../src/core/circuit/nets';
import { estimateNets } from '../../src/core/icPlacement/estimate';
import { DEFAULT_ROUTING_CONFIG } from '../../src/core/routing/config';
import type { Circuit } from '../../src/types/circuit';
import { circuit, comp, wire } from '../fixtures/build';

const estimate = (c: Circuit) => estimateNets(indexCircuit(c), buildLattice(c.boards), extractNets(c), DEFAULT_ROUTING_CONFIG.weights);

describe('estimateNets', () => {
  it('costs one wire for two strips on the same row', () => {
    // 第 10 欄下半與第 20 欄下半：同一列一條線，長 10。
    expect(estimate(circuit([comp('C1', 'clock', 'J10'), comp('C2', 'clock', 'J20')], [wire('w', 'I10', 'I20')]))).toBe(6 + 10);
  });

  it('costs two wires and a via when the strips are not aligned', () => {
    // 第 10 欄上半（y 4–8）與第 20 欄下半（y 11–15）：最近是 E10 → F20，橫 10、直 3。
    expect(estimate(circuit([comp('C1', 'clock', 'A10'), comp('C2', 'clock', 'J20')], [wire('w', 'B10', 'I20')]))).toBe(2 * 6 + 3 + 13);
  });

  it('costs nothing for a net that is already in one strip', () => {
    expect(estimate(circuit([comp('C1', 'clock', 'J10'), comp('C2', 'clock', 'I10')]))).toBe(0);
  });

  it('joins three strips with a minimum spanning tree', () => {
    // 10、20、22 欄下半：10 → 20 長 10、20 → 22 長 2（不是 10 → 22 的 12）。
    const c = circuit(
      [comp('C1', 'clock', 'J10'), comp('C2', 'clock', 'J20'), comp('C3', 'clock', 'J22')],
      [wire('a', 'I10', 'I20'), wire('b', 'H20', 'H22')],
    );
    expect(estimate(c)).toBe(6 + 10 + 6 + 2);
  });
});
