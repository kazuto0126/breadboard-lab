import { describe, expect, it } from 'vitest';
import { applyRouting } from '../../src/core/routing/apply';
import { computeMetrics } from '../../src/core/routing/metrics';
import { scoreRouting } from '../../src/core/routing/score';
import type { RoutingResult } from '../../src/types/routing';
import { circuit, comp, pt, wire } from '../fixtures/build';

// 兩顆 LED 的陽極（第 10、30 欄上半）要接在一起；u1 是最短的直線。
const c = circuit([comp('D1', 'led', 'C10'), comp('D2', 'led', 'C30')], [wire('u1', 'B10', 'B30')]);

describe('computeMetrics', () => {
  it('counts wires, length, bends, crossings, overlaps and short jogs', () => {
    expect(computeMetrics([wire('a', 'A10', 'A30'), wire('b', [20, 3], [20, 6])])).toEqual({
      wireCount: 2,
      totalLength: 23,
      bends: 0,
      crossings: 1,
      overlaps: 0,
      shortJogs: 0,
    });
  });
});

describe('scoreRouting', () => {
  it('gives 100 to the shortest straight wiring', () => {
    expect(scoreRouting(c).score).toBe(100);
  });

  it('deducts for a detour and its extra bend', () => {
    expect(scoreRouting(c, [wire('u1', 'B10', [10, 3], [30, 3], 'B30')]).score).toBe(95.2);
  });

  it('deducts 8 per crossing', () => {
    const crossed = circuit(
      [comp('D1', 'led', 'C10'), comp('D2', 'led', 'C30'), comp('V1', 'vcc', 'T+5'), comp('D3', 'led', 'E21')],
      [wire('u1', 'B10', 'B30'), wire('u2', 'T+21', 'D21')],
    );
    expect(scoreRouting(crossed).score).toBe(89.6);
  });

  it('treats a wire through a component as an overlap', () => {
    const blocked = circuit(
      [comp('D1', 'led', 'C10'), comp('D2', 'led', 'C30'), comp('D3', 'led', 'B20', { rotation: 90 })],
      [wire('u1', 'B10', 'B30')],
    );
    expect(scoreRouting(blocked).score).toBe(70);
  });

  it('scores 0 when a connection is missing or a wire is broken', () => {
    expect(scoreRouting(c, []).score).toBe(0);
    expect(scoreRouting(c, [{ ...wire('u1', 'B10', 'B30'), path: [pt(10, 5), pt(11, 6)] }]).score).toBe(0);
  });

  it('scores an empty circuit as 100', () => {
    expect(scoreRouting(circuit([])).score).toBe(100);
  });
});

describe('applyRouting', () => {
  const result: RoutingResult = {
    status: 'success',
    message: 'Standard Routing Complete',
    wires: [{ ...wire('a1', 'A10', 'A30'), source: 'auto', netId: 'NET_1' }],
    failedNets: [],
    metrics: computeMetrics([]),
    score: 100,
    stats: { iterations: 1, elapsedMs: 0 },
  };

  it('replaces the wires without touching the original circuit', () => {
    const applied = applyRouting(c, result);
    expect(applied.wires.map((w) => w.id)).toEqual(['a1']);
    expect(c.wires.map((w) => w.id)).toEqual(['u1']);
    expect(applied.wires[0]).not.toBe(result.wires[0]);
  });

  it('refuses partial results', () => {
    expect(() => applyRouting(c, { ...result, status: 'partial' })).toThrow('Only a successful routing result can be applied');
  });
});
