import { describe, expect, it } from 'vitest';
import { autoRoute } from '../../src/core/routing/autoRoute';
import { checkRoutingLegality } from '../../src/core/routing/legality';
import { scoreRouting } from '../../src/core/routing/score';
import type { RoutingResult } from '../../src/types/routing';
import { acceptanceCircuit, adderCircuit, counterCircuit } from '../fixtures/circuits';

const withoutTiming = (r: RoutingResult) => ({ ...r, stats: { ...r.stats, elapsedMs: 0 } });

describe.each([
  ['acceptance', acceptanceCircuit],
  ['counter', counterCircuit],
  ['adder', adderCircuit],
])('%s fixture', (_name, build) => {
  it('routes successfully, legally and deterministically', () => {
    const c = build();
    const r = autoRoute(c);
    expect(r.failedNets).toEqual([]);
    expect(r.status).toBe('success');
    expect(r.metrics.overlaps).toBe(0);
    expect(checkRoutingLegality(c, r.wires)).toEqual([]);
    expect(withoutTiming(autoRoute(c))).toEqual(withoutTiming(r));
  });
});

describe('completion criteria', () => {
  it('routes the acceptance circuit with no crossings and a score of at least 90', () => {
    const r = autoRoute(acceptanceCircuit());
    expect(r.metrics.crossings).toBe(0);
    expect(r.score).toBeGreaterThanOrEqual(90);
  });

  it('beats the user wiring of the acceptance circuit', () => {
    const c = acceptanceCircuit();
    expect(autoRoute(c).score).toBeGreaterThan(scoreRouting(c).score);
  });
});
