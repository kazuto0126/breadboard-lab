import { describe, expect, it } from 'vitest';
import { decodeState, evaluatePath, findWire, type SearchParams } from '../../src/core/routing/astar';
import { DEFAULT_ROUTING_CONFIG } from '../../src/core/routing/config';
import { MinHeap } from '../../src/core/routing/minHeap';
import { buildRoutingProblem, toIndex, type RoutingProblem } from '../../src/core/routing/problem';
import { pathUsages, RouteState } from '../../src/core/routing/routeState';
import type { ComponentInstance } from '../../src/types/component';
import { circuit, comp } from '../fixtures/build';

const W = DEFAULT_ROUTING_CONFIG.weights;
const hard: SearchParams = { weights: W, overlap: { kind: 'hard' } };
const negotiate: SearchParams = { weights: W, overlap: { kind: 'negotiate', overlapBase: 50, presentFactor: 0.5 } };

/** 沒有任何 Net 的佈線問題：不會有 congestion 成本，方便算出精確數字。 */
function emptyProblem(components: ComponentInstance[] = []): RoutingProblem {
  return buildRoutingProblem(circuit(components), DEFAULT_ROUTING_CONFIG);
}

const at = (p: RoutingProblem, x: number, y: number) => toIndex(p, x, y);
const xy = (p: RoutingProblem, path: number[]) => path.map((i) => [(i % p.width) + 1, Math.floor(i / p.width) + 1]);
const column = (p: RoutingProblem, x: number, fromY: number, toY: number) =>
  Array.from({ length: toY - fromY + 1 }, (_, k) => at(p, x, fromY + k));

describe('MinHeap', () => {
  it('pops by key, then by insertion order', () => {
    const heap = new MinHeap();
    heap.push(5, 1);
    heap.push(1, 2);
    heap.push(5, 3);
    heap.push(0, 4);
    expect([heap.pop()!.value, heap.pop()!.value, heap.pop()!.value, heap.pop()!.value]).toEqual([4, 2, 1, 3]);
    expect(heap.pop()).toBeUndefined();
  });
});

describe('RouteState', () => {
  it('records usages and flags conflicts, but not a legal crossing', () => {
    const p = emptyProblem();
    const state = new RouteState(p.size);
    const h = [at(p, 1, 5), at(p, 2, 5), at(p, 3, 5)];
    expect(pathUsages(h)).toEqual(['E', 'H', 'E']);
    state.addWire({ id: 'h#0', netId: 'h', path: h });
    state.addWire({ id: 'v#0', netId: 'v', path: column(p, 2, 4, 6) });
    expect(state.conflictedNodes()).toEqual([]);
    state.addWire({ id: 'x#0', netId: 'x', path: [at(p, 3, 4), at(p, 3, 5)] });
    expect(state.conflictedNodes()).toEqual([at(p, 3, 5)]);
    expect([...state.netsAt([at(p, 3, 5)])].sort()).toEqual(['h', 'x']);
    state.removeNet('x');
    expect(state.conflictedNodes()).toEqual([]);
    expect(state.wiresOf('h').map((w) => w.id)).toEqual(['h#0']);
    expect(() => state.addWire({ id: 'h#0', netId: 'h', path: h })).toThrow('already placed');
  });
});

describe('findWire', () => {
  it('finds a straight wire whose cost equals its length', () => {
    const p = emptyProblem();
    const r = findWire(p, new RouteState(p.size), [at(p, 10, 4)], [at(p, 20, 4)], hard)!;
    expect(xy(p, r.path)).toEqual(Array.from({ length: 11 }, (_, i) => [10 + i, 4]));
    expect(r.cost).toBe(10);
  });

  it('pays one bend for an L-shaped wire', () => {
    const p = emptyProblem();
    const r = findWire(p, new RouteState(p.size), [at(p, 10, 4)], [at(p, 20, 7)], hard)!;
    expect(r.path).toHaveLength(14);
    expect(r.cost).toBe(13 + W.bend);
  });

  it('picks the cheapest source/target pair', () => {
    const p = emptyProblem();
    const r = findWire(p, new RouteState(p.size), [at(p, 1, 4), at(p, 30, 4)], [at(p, 33, 4), at(p, 60, 4)], hard)!;
    expect(xy(p, [r.path[0], r.path[r.path.length - 1]])).toEqual([[30, 4], [33, 4]]);
  });

  it('never enters blocked nodes such as an IC body', () => {
    const p = emptyProblem([comp('U1', '74LS00', 'F10')]);
    const r = findWire(p, new RouteState(p.size), [at(p, 8, 8)], [at(p, 18, 11)], hard)!;
    expect(r.path.every((i) => p.blocked[i] === 0)).toBe(true);
  });

  it('detours instead of crossing when a detour exists', () => {
    const p = emptyProblem();
    const state = new RouteState(p.size);
    state.addWire({ id: 'v#0', netId: 'v', path: column(p, 20, 4, 15) });
    const r = findWire(p, state, [at(p, 10, 6)], [at(p, 30, 6)], hard)!;
    expect(r.path.includes(at(p, 20, 6))).toBe(false);
    expect(r.cost).toBeLessThan(W.crossing);
  });

  it('crosses exactly once when the other wire spans the whole board', () => {
    const p = emptyProblem();
    const state = new RouteState(p.size);
    state.addWire({ id: 'v#0', netId: 'v', path: column(p, 30, 1, 18) });
    const r = findWire(p, state, [at(p, 10, 6)], [at(p, 50, 6)], hard)!;
    expect(r.path.filter((i) => i % p.width === 29)).toHaveLength(1);
    expect(r.cost).toBe(40 + W.crossing);
  });

  it('returns null when every route is blocked', () => {
    const p = emptyProblem();
    const target = at(p, 30, 6);
    for (const n of [target - 1, target + 1, target - p.width, target + p.width]) p.blocked[n] = 1;
    expect(findWire(p, new RouteState(p.size), [at(p, 10, 6)], [target], hard)).toBeNull();
  });

  it('allows a priced overlap in negotiation mode but not in hard mode', () => {
    const p = emptyProblem();
    const state = new RouteState(p.size);
    const target = at(p, 30, 6);
    for (const n of [target - 1, target + 1, target - p.width]) p.blocked[n] = 1;
    state.addWire({ id: 'o#0', netId: 'o', path: [target + p.width, target + p.width + 1] });
    expect(findWire(p, state, [at(p, 10, 6)], [target], hard)).toBeNull();
    const r = findWire(p, state, [at(p, 10, 6)], [target], negotiate)!;
    expect(r.path).toContain(target + p.width);
  });

  it('reports the same cost as evaluatePath for the path it returns', () => {
    const p = emptyProblem([comp('U1', '74LS00', 'F10'), comp('R1', 'resistor', 'C20')]);
    const state = new RouteState(p.size);
    state.addWire({ id: 'v#0', netId: 'v', path: column(p, 40, 1, 18) });
    const r = findWire(p, state, [at(p, 5, 13)], [at(p, 50, 5)], hard)!;
    expect(evaluatePath(p, state, r.path, hard)).toBeCloseTo(r.cost, 9);
  });
});

describe('evaluatePath', () => {
  it('charges the aesthetic cost for a one-step jog between two bends', () => {
    const p = emptyProblem();
    const state = new RouteState(p.size);
    const z = [at(p, 1, 4), at(p, 2, 4), at(p, 2, 5), at(p, 3, 5), at(p, 4, 5)];
    const zLong = [at(p, 1, 4), at(p, 2, 4), at(p, 2, 5), at(p, 2, 6), at(p, 3, 6)];
    expect(evaluatePath(p, state, z, hard)).toBe(4 + 2 * W.bend + W.aesthetic);
    expect(evaluatePath(p, state, zLong, hard)).toBe(4 + 2 * W.bend);
  });
});

describe('decodeState', () => {
  it('decodes node, direction, run length and first-segment flags', () => {
    expect(decodeState(((7 * 5 + 2) * 2 + 1) * 2 + 0)).toEqual({ index: 7, direction: 2, longRun: true, firstSegment: false });
  });
});
