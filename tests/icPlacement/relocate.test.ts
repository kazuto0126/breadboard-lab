import { describe, expect, it } from 'vitest';
import { extractNets } from '../../src/core/circuit/nets';
import { applyMoves, placementOf, relocatedCircuit, samePinPartition } from '../../src/core/icPlacement/relocate';
import { applyRouting } from '../../src/core/routing/apply';
import { autoRoute } from '../../src/core/routing/autoRoute';
import type { Circuit } from '../../src/types/circuit';
import type { IcMove, IcPlacement, RoutingResult } from '../../src/types/routing';
import { acceptanceCircuit, adderCircuit } from '../fixtures/circuits';

const move = (c: Circuit, componentId: string, to: IcPlacement): IcMove => ({
  componentId,
  from: placementOf(c.components.find((k) => k.id === componentId)!),
  to,
});
const shape = (r: RoutingResult) => ({ wires: r.wires.map((w) => [w.netId, w.start, w.end]), metrics: r.metrics, failed: r.failedNets });

describe('applyMoves', () => {
  it('returns the same array when nothing moves and keeps unmoved components', () => {
    const c = acceptanceCircuit();
    expect(applyMoves(c.components, [])).toBe(c.components);
    const moved = applyMoves(c.components, [move(c, 'U1', { boardId: 'b1', anchor: { x: 20, y: 11 }, rotation: 0 })]);
    expect(moved.find((k) => k.id === 'U1')).toMatchObject({ anchor: { x: 20, y: 11 }, rotation: 0 });
    for (const k of moved) if (k.id !== 'U1') expect(c.components).toContain(k);
  });
});

describe('relocatedCircuit', () => {
  it.each([
    ['acceptance', acceptanceCircuit],
    ['adder', adderCircuit],
  ])('routes the %s circuit exactly like the original when nothing moves', (_name, build) => {
    const c = build();
    const nets = extractNets(c);
    const relocated = relocatedCircuit(c, nets, []);
    expect(samePinPartition(nets, extractNets(relocated))).toBe(true);
    expect(shape(autoRoute(relocated))).toEqual(shape(autoRoute(c)));
  });

  it('keeps every pin connected to the same pins after an IC turns around', () => {
    const c = acceptanceCircuit();
    const nets = extractNets(c);
    const relocated = relocatedCircuit(c, nets, [move(c, 'U1', { boardId: 'b1', anchor: { x: 16, y: 8 }, rotation: 180 })]);
    expect(samePinPartition(nets, extractNets(relocated))).toBe(true);
    expect(autoRoute(relocated).status).toBe('success');
  });

  it('notices a short: a pin moved into a strip of another net', () => {
    const c = acceptanceCircuit();
    const nets = extractNets(c);
    // U1 第 7 腳（GND）會落在第 34 欄下半，和 R1 第 2 腳（接 LED 陽極）同一排。
    const relocated = relocatedCircuit(c, nets, [move(c, 'U1', { boardId: 'b1', anchor: { x: 28, y: 11 }, rotation: 0 })]);
    expect(samePinPartition(nets, extractNets(relocated))).toBe(false);
  });
});

describe('applyRouting with moves', () => {
  it('moves the ICs and replaces the wires', () => {
    const c = acceptanceCircuit();
    const moves = [move(c, 'U1', { boardId: 'b1', anchor: { x: 16, y: 8 }, rotation: 180 })];
    const r: RoutingResult = { ...autoRoute(relocatedCircuit(c, extractNets(c), moves)), moves };
    const applied = applyRouting(c, r);
    expect(applied.components.find((k) => k.id === 'U1')).toMatchObject({ anchor: { x: 16, y: 8 }, rotation: 180 });
    expect(applied.wires.every((w) => w.source === 'auto')).toBe(true);
  });

  it('keeps the component array when nothing moved', () => {
    const c = acceptanceCircuit();
    expect(applyRouting(c, autoRoute(c)).components).toBe(c.components);
  });
});
