import { describe, expect, it } from 'vitest';
import { validateCircuit } from '../../src/core/circuit/validate';
import { applyRouting } from '../../src/core/routing/apply';
import { autoRoute } from '../../src/core/routing/autoRoute';
import { checkRoutingLegality } from '../../src/core/routing/legality';
import { EXAMPLES } from '../../src/editor/examples';

describe.each(EXAMPLES.map((ex) => [ex.name, ex] as const))('example %s', (_name, ex) => {
  it('routes fully with straight wires and stays error-free', () => {
    const c = ex.build();
    const r = autoRoute(c);
    expect(r.failedNets).toEqual([]);
    expect(checkRoutingLegality(c, r.wires)).toEqual([]);
    expect(r.wires.every((w) => w.straight === true)).toBe(true);
    expect(validateCircuit(applyRouting(c, r)).filter((e) => e.severity === 'error')).toEqual([]);
  });
});
