import { describe, expect, it } from 'vitest';
import { extractNets } from '../../src/core/circuit/nets';
import { icCandidates } from '../../src/core/icPlacement/candidates';
import { autoRoute } from '../../src/core/routing/autoRoute';
import { checkRoutingLegality } from '../../src/core/routing/legality';
import { getBoard } from '../../src/core/breadboard/registry';
import { getNode } from '../../src/core/breadboard/naming';
import { EXAMPLES, eicCircuit } from '../../src/editor/examples';

describe('routing on an EIC-1106', () => {
  it('routes the example legally', () => {
    const c = eicCircuit();
    const r = autoRoute(c);
    expect(r.status).toBe('success');
    expect(checkRoutingLegality(c, r.wires)).toEqual([]);
  });

  it('never uses a binding post as a via', () => {
    const r = autoRoute(eicCircuit());
    const b = getBoard('EIC1106', 'b1');
    const ends = r.wires.flatMap((w) => [w.start, w.end]).map((p) => getNode(b, p.x, p.y)!.groupId);
    expect(ends).not.toContain('b1:post-yellow');
    expect(ends).not.toContain('b1:post-green');
    expect(ends.filter((g) => g === 'b1:post-red')).toHaveLength(1);
  });

  it('lets an IC move to any of the three areas', () => {
    const c = eicCircuit();
    const ys = new Set(icCandidates(c, extractNets(c), 'U1').filter((p) => p.rotation === 0).map((p) => p.anchor.y));
    expect([...ys].sort((a, b) => a - b)).toEqual([17, 33, 49]);
  });

  it('is in the examples menu', () => {
    expect(EXAMPLES.map((e) => e.id)).toContain('eic-board');
  });
});
