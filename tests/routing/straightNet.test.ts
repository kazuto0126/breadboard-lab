import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTING_CONFIG } from '../../src/core/routing/config';
import { buildRoutingProblem } from '../../src/core/routing/problem';
import { routeNet } from '../../src/core/routing/straightNet';
import type { SearchParams } from '../../src/core/routing/straightSearch';
import { StraightState } from '../../src/core/routing/straightState';
import { circuit, comp, wire } from '../fixtures/build';
import { acceptanceCircuit } from '../fixtures/circuits';

const hard: SearchParams = { weights: DEFAULT_ROUTING_CONFIG.weights, overlap: { kind: 'hard' } };

describe('routeNet with straight wires', () => {
  it('connects every cluster of a net and leaves no conflicts', () => {
    const p = buildRoutingProblem(acceptanceCircuit(), DEFAULT_ROUTING_CONFIG);
    const s = new StraightState(p);
    for (const net of p.nets.filter((n) => n.clusters.length >= 2)) expect(routeNet(p, s, net, hard)).toMatchObject({ ok: true });
    expect(s.conflicts()).toEqual([]);
  });

  it('uses its own rail as a bus', () => {
    // VCC 在 T+；兩顆 LED 的陽極都要接 VCC：兩條線都插在 T+ 上，不需要別的轉接排。
    const c = circuit([comp('V1', 'vcc', 'T+3'), comp('D1', 'led', 'C10'), comp('D2', 'led', 'C40')], [wire('u1', 'T+10', 'A10'), wire('u2', 'T+40', 'A40')]);
    const p = buildRoutingProblem(c, DEFAULT_ROUTING_CONFIG);
    const s = new StraightState(p);
    const net = p.nets.find((n) => n.kind === 'power')!;
    expect(routeNet(p, s, net, hard)).toMatchObject({ ok: true });
    const wires = s.wiresOf(net.netId);
    expect(wires).toHaveLength(2);
    for (const w of wires) expect([p.groupAt[w.a], p.groupAt[w.b]]).toContain('b1:rail-T+');
  });

  it('reports a cluster without free holes', () => {
    const c = circuit(
      [comp('R1', 'resistor', 'A20', { rotation: 90, span: 1 }), comp('R2', 'resistor', 'C20', { rotation: 90, span: 1 }), comp('D1', 'led', 'E20'), comp('D2', 'led', 'C40')],
      [wire('u1', 'A20', 'A40')],
    );
    const p = buildRoutingProblem(c, DEFAULT_ROUTING_CONFIG);
    const net = p.nets.find((n) => n.clusters.length >= 2)!;
    expect(routeNet(p, new StraightState(p), net, hard)).toMatchObject({ ok: false, reason: 'NO_FREE_HOLE' });
  });
});
