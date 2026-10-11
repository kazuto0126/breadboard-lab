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

  it('wires every pin row of a rail net straight to its rail instead of chaining rows together', () => {
    // 四顆 LED 的陰極（第 11、13、15、17 欄下半）都接 GND（B− 軌）；相鄰兩排只隔 2 格，串接比拉到軌上便宜，但學生都是每排直接拉到軌上。
    const leds = [10, 12, 14, 16].map((x, i) => comp(`D${i + 1}`, 'led', `H${x}`));
    const c = circuit([comp('G1', 'gnd', 'B-3'), ...leds], [11, 13, 15, 17].map((x, i) => wire(`g${i}`, `J${x}`, `B-${x}`)));
    const p = buildRoutingProblem(c, DEFAULT_ROUTING_CONFIG);
    const s = new StraightState(p);
    const net = p.nets.find((n) => n.kind === 'ground')!;
    expect(routeNet(p, s, net, hard)).toMatchObject({ ok: true });
    const wires = s.wiresOf(net.netId);
    expect(wires).toHaveLength(4);
    for (const w of wires) expect([p.groupAt[w.a], p.groupAt[w.b]]).toContain('b1:rail-B-');
  });

  it('never starts the next wire on a hole the previous wire of the same route passed over', () => {
    // 第 32 欄下半只剩 J32 一個空孔（F32～I32 插著兩顆直立的 LED），而且 B−32 是電源軌的空隙。
    // 錯的捷徑：B−31 往上到 I31（經過 J31），再從 J31 拉到 J32。
    const c = circuit(
      [comp('G1', 'gnd', 'B-3'), comp('D1', 'led', 'F32', { rotation: 90 }), comp('D2', 'led', 'H32', { rotation: 90 })],
      [wire('g1', 'J32', 'J31', 'B-31')],
    );
    const p = buildRoutingProblem(c, DEFAULT_ROUTING_CONFIG);
    const s = new StraightState(p);
    const net = p.nets.find((n) => n.kind === 'ground')!;
    expect(routeNet(p, s, net, hard)).toMatchObject({ ok: true });
    expect(s.conflicts()).toEqual([]);
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
