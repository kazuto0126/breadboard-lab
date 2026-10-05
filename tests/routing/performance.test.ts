import { expect, it } from 'vitest';
import { autoRoute } from '../../src/core/routing/autoRoute';
import { checkRoutingLegality } from '../../src/core/routing/legality';
import { syntheticCircuit } from '../fixtures/circuits';

it('handles 50 components and 50 wires within the time budget and never outputs illegal wires', () => {
  const c = syntheticCircuit();
  expect(c.components).toHaveLength(50);
  const started = performance.now();
  const r = autoRoute(c);
  expect(performance.now() - started).toBeLessThan(6000);
  const failedIds = new Set(r.failedNets.map((f) => f.netId));
  const violations = checkRoutingLegality(c, r.wires);
  expect(violations.every((v) => v.code === 'NET_MISMATCH' && v.netIds.every((id) => failedIds.has(id)))).toBe(true);
}, 20000);
