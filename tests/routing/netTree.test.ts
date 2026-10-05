import { describe, expect, it } from 'vitest';
import type { SearchParams } from '../../src/core/routing/astar';
import { DEFAULT_ROUTING_CONFIG } from '../../src/core/routing/config';
import { routeNet } from '../../src/core/routing/netTree';
import { buildRoutingProblem } from '../../src/core/routing/problem';
import { RouteState } from '../../src/core/routing/routeState';
import { circuit, comp, wire } from '../fixtures/build';

const hard: SearchParams = { weights: DEFAULT_ROUTING_CONFIG.weights, overlap: { kind: 'hard' } };

describe('routeNet', () => {
  it('connects three groups with two wires that end in the right groups', () => {
    const c = circuit(
      [comp('D1', 'led', 'C10'), comp('D2', 'led', 'C30'), comp('D3', 'led', 'H20')],
      [wire('w1', 'A10', 'A30'), wire('w2', 'B30', [30, 9], 'J20')],
    );
    const problem = buildRoutingProblem(c, DEFAULT_ROUTING_CONFIG);
    const net = problem.nets.find((n) => n.terminalGroups.length === 3)!;
    const state = new RouteState(problem.size);
    const result = routeNet(problem, state, net, hard);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.paths).toHaveLength(2);
    const reached = new Set(result.paths.flatMap((path) => [problem.groupAt[path[0]], problem.groupAt[path[path.length - 1]]]));
    expect([...reached].sort()).toEqual(net.terminalGroups);
    expect(state.wiresOf(net.netId).map((w) => w.id)).toEqual([`${net.netId}#0`, `${net.netId}#1`]);
  });

  it('fails with NO_FREE_HOLE when a terminal group is full', () => {
    const c = circuit(
      [
        comp('R1', 'resistor', 'A20', { rotation: 90, span: 1 }),
        comp('R2', 'resistor', 'C20', { rotation: 90, span: 1 }),
        comp('D1', 'led', 'E20'),
        comp('D2', 'led', 'C40'),
      ],
      [wire('w1', 'A20', 'A40')],
    );
    const problem = buildRoutingProblem(c, DEFAULT_ROUTING_CONFIG);
    const net = problem.nets.find((n) => n.terminalGroups.includes('b1:c20-top'))!;
    const result = routeNet(problem, new RouteState(problem.size), net, hard);
    expect(result).toEqual({ ok: false, reason: 'NO_FREE_HOLE', detail: '第 20 欄上半（A–E）沒有空孔可以接線' });
  });

  it('fails with UNROUTABLE and leaves no wires behind when a group is walled in', () => {
    const c = circuit([comp('D1', 'led', 'C10'), comp('D2', 'led', 'C30')], [wire('w1', 'A10', 'A30')]);
    const problem = buildRoutingProblem(c, DEFAULT_ROUTING_CONFIG);
    const net = problem.nets.find((n) => n.terminalGroups.length === 2)!;
    const holes = problem.freeHoles.get('b1:c30-top')!;
    for (const h of holes) {
      problem.blocked[h - 1] = 1;
      problem.blocked[h + 1] = 1;
    }
    problem.blocked[holes[0] - problem.width] = 1;
    problem.blocked[holes[holes.length - 1] + problem.width] = 1;
    const state = new RouteState(problem.size);
    const result = routeNet(problem, state, net, hard);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('UNROUTABLE');
    expect(state.wiresOf(net.netId)).toEqual([]);
  });
});
