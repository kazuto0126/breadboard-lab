import { describe, expect, it } from 'vitest';
import { getComponentDefinition } from '../../src/core/circuit/library';
import { extractNets } from '../../src/core/circuit/nets';
import { validateCircuit } from '../../src/core/circuit/validate';
import { autoPlaceAndRoute, isBetterRouting } from '../../src/core/icPlacement/autoPlace';
import { relocatedCircuit, samePinPartition } from '../../src/core/icPlacement/relocate';
import { applyRouting } from '../../src/core/routing/apply';
import { autoRoute } from '../../src/core/routing/autoRoute';
import { checkRoutingLegality } from '../../src/core/routing/legality';
import { compileSimulation, initialSimState, settle } from '../../src/core/simulation/simulate';
import { EXAMPLES } from '../../src/editor/examples';
import type { Circuit } from '../../src/types/circuit';
import type { RoutingResult } from '../../src/types/routing';
import { circuit, comp, wire } from '../fixtures/build';
import { adderCircuit, farIcCircuit } from '../fixtures/circuits';

const timeless = (r: RoutingResult) => ({ ...r, stats: { ...r.stats, elapsedMs: 0 } });
const lit = (c: Circuit) => {
  const sim = compileSimulation(c);
  return settle(sim, initialSimState(sim), { pressed: {}, clocks: {} }).result.litLeds;
};
const fake = (failed: number, crossings: number, wireCount: number, totalLength: number): RoutingResult => ({
  status: failed === 0 ? 'success' : 'partial',
  message: '',
  wires: [],
  failedNets: Array.from({ length: failed }, (_, i) => ({ netId: `N${i}`, reason: 'UNROUTABLE' as const, detail: '' })),
  metrics: { wireCount, totalLength, bends: 0, crossings, overlaps: 0, shortJogs: 0 },
  score: 0,
  stats: { iterations: 0, elapsedMs: 0 },
});

describe('isBetterRouting', () => {
  it('ranks unrouted nets, then crossings, then wires, then length', () => {
    expect(isBetterRouting(fake(0, 9, 99, 999), fake(1, 0, 1, 1))).toBe(true);
    expect(isBetterRouting(fake(0, 0, 99, 999), fake(0, 1, 1, 1))).toBe(true);
    expect(isBetterRouting(fake(0, 0, 5, 999), fake(0, 0, 6, 1))).toBe(true);
    expect(isBetterRouting(fake(0, 0, 5, 10), fake(0, 0, 5, 11))).toBe(true);
    expect(isBetterRouting(fake(0, 0, 5, 10), fake(0, 0, 5, 10))).toBe(false);
  });
});

describe('autoPlaceAndRoute', () => {
  it('moves an IC that sits far from its LED and saves wire', () => {
    const c = farIcCircuit();
    const base = autoRoute(c);
    const r = autoPlaceAndRoute(c);
    expect(r.status).toBe('success');
    expect(r.moves?.map((m) => m.componentId)).toEqual(['U1']);
    expect(isBetterRouting(r, base)).toBe(true);
    expect(r.metrics.totalLength).toBeLessThan(base.metrics.totalLength);
    expect(checkRoutingLegality(relocatedCircuit(c, extractNets(c), r.moves!), r.wires)).toEqual([]);
    const applied = applyRouting(c, r);
    expect(samePinPartition(extractNets(c), extractNets(applied))).toBe(true);
    expect(validateCircuit(applied).filter((e) => e.severity === 'error')).toEqual([]);
  }, 60_000);

  it('is deterministic', () => {
    const c = farIcCircuit();
    expect(timeless(autoPlaceAndRoute(c))).toEqual(timeless(autoPlaceAndRoute(c)));
  }, 60_000);

  it('keeps odd user connections (two IC outputs tied together)', () => {
    // 1Y（第 3 腳，F47）經過空的第 43 欄接到 4Y（第 11 腳，E48）。
    const base = farIcCircuit();
    const tied = { ...base, wires: [...base.wires, wire('tie1', 'A48', 'A43'), wire('tie2', 'B43', 'J43'), wire('tie3', 'I43', 'I47')] };
    const r = autoPlaceAndRoute(tied);
    expect(r.status).toBe('success');
    expect(samePinPartition(extractNets(tied), extractNets(applyRouting(tied, r)))).toBe(true);
  }, 60_000);

  it('gives up quickly on places that cannot be routed', () => {
    // 加法器把 U1 搬到上板的某些位置會佈不完；每個這樣的位置不能拖上好幾秒。
    const r = autoPlaceAndRoute(adderCircuit());
    expect(r.failedNets).toEqual([]);
    expect(r.stats.elapsedMs).toBeLessThan(15_000);
  }, 60_000);

  it('leaves a circuit without ICs as it is', () => {
    const c = circuit([comp('R1', 'resistor', 'G5'), comp('D1', 'led', 'G15')], [wire('w1', 'J9', 'J15')]);
    const r = autoPlaceAndRoute(c);
    expect(r.moves).toEqual([]);
    expect(r.wires.map((w) => [w.start, w.end])).toEqual(autoRoute(c).wires.map((w) => [w.start, w.end]));
  });

  it('stops at the time budget and keeps the ICs where they are', () => {
    const r = autoPlaceAndRoute(farIcCircuit(), { placement: { timeBudgetMs: 0 } });
    expect(r.status).toBe('success');
    expect(r.moves).toEqual([]);
  });
});

describe.each(EXAMPLES.map((ex) => [ex.name, ex] as const))('example %s with IC moving', (_name, ex) => {
  it('routes fully, never worse than standard routing, moves only ICs and simulates the same', () => {
    const c = ex.build();
    const base = autoRoute(c);
    const r = autoPlaceAndRoute(c);
    expect(r.failedNets).toEqual([]);
    expect(isBetterRouting(base, r)).toBe(false);
    expect(r.wires.every((w) => w.straight === true)).toBe(true);
    const applied = applyRouting(c, r);
    const moved = new Set(r.moves!.map((m) => m.componentId));
    for (const k of c.components) {
      if (moved.has(k.id)) expect(getComponentDefinition(k.defId)?.category).toBe('ic');
      else expect(applied.components).toContain(k);
    }
    expect(samePinPartition(extractNets(c), extractNets(applied))).toBe(true);
    expect(validateCircuit(applied).filter((e) => e.severity === 'error')).toEqual([]);
    expect(lit(applied)).toEqual(lit(applyRouting(c, base)));
  }, 60_000);
});
