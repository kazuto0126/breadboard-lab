import { describe, expect, it } from 'vitest';
import {
  buildCanvas,
  buildLattice,
  isRoutablePoint,
  isSeamPoint,
  latticeOf,
  latticeStep,
  pointAt,
} from '../../src/core/breadboard/lattice';
import { extractNets } from '../../src/core/circuit/nets';
import { validateCircuit } from '../../src/core/circuit/validate';
import { stepDirection } from '../../src/core/circuit/wireGeometry';
import { autoRoute } from '../../src/core/routing/autoRoute';
import { checkRoutingLegality } from '../../src/core/routing/legality';
import { buildRoutingProblems } from '../../src/core/routing/problem';
import { scoreRouting } from '../../src/core/routing/score';
import { compileSimulation, initialSimState, settle } from '../../src/core/simulation/simulate';
import { DEFAULT_ROUTING_CONFIG } from '../../src/core/routing/config';
import type { Wire } from '../../src/types/circuit';
import { board, circuit, comp, holeOn, latticeWire } from '../fixtures/build';

/** b2 在 b1 正下方（上下貼合）。 */
const STACKED = [board('b1'), board('b2', 0, 20)];
/** b2 在 b1 右邊（左右貼合）。 */
const SIDE = [board('b1'), board('b2', 65, 0)];
/** 中間隔了 10 格，沒有貼合。 */
const APART = [board('b1'), board('b2', 0, 30)];
/** 邊碰在一起但沒有對齊。 */
const SHIFTED = [board('b1'), board('b2', 10, 20)];

const crossingWires = (wires: Wire[]) => wires.filter((w) => new Set(w.path.map((p) => p.boardId)).size > 1);

describe('global lattice', () => {
  it('puts every board on one shared grid', () => {
    const l = buildLattice(STACKED);
    expect(latticeOf(l, holeOn('b2', 'A1'))).toEqual({ x: 1, y: 24 });
    expect(pointAt(l, 1, 24)).toEqual(holeOn('b2', 'A1'));
    expect(pointAt(l, 5, 19)).toEqual({ boardId: 'b1', x: 5, y: 19 }); // b1 下緣留白
    expect(pointAt(l, 5, 20)).toEqual({ boardId: 'b2', x: 5, y: 0 }); // b2 上緣留白
    expect(pointAt(l, 70, 5)).toBeNull();
  });

  it('groups boards only when they touch edge to edge and are aligned', () => {
    const groups = (boards: typeof STACKED) => new Set(buildLattice(boards).groupOf.values()).size;
    expect(groups(STACKED)).toBe(1);
    expect(groups(SIDE)).toBe(1);
    expect(groups(APART)).toBe(2);
    expect(groups(SHIFTED)).toBe(2);
    const chain = buildLattice([board('b1'), board('b2', 0, 20), board('b3', 65, 20)]);
    expect([...chain.groupOf.values()]).toEqual(['b1', 'b1', 'b1']);
  });

  it('opens only the seam between grouped boards', () => {
    const l = buildLattice(STACKED);
    expect(isSeamPoint(l, { boardId: 'b1', x: 10, y: 19 })).toBe(true);
    expect(isSeamPoint(l, { boardId: 'b2', x: 10, y: 0 })).toBe(true);
    expect(isRoutablePoint(l, { boardId: 'b1', x: 10, y: 0 })).toBe(false); // b1 上緣（外側）
    expect(isRoutablePoint(l, { boardId: 'b1', x: 0, y: 10 })).toBe(false); // b1 左緣
    expect(isRoutablePoint(buildLattice(APART), { boardId: 'b1', x: 10, y: 19 })).toBe(false);
    expect(isSeamPoint(buildLattice(SIDE), { boardId: 'b1', x: 64, y: 7 })).toBe(true);
    expect(latticeStep(l, { boardId: 'b1', x: 10, y: 19 }, { boardId: 'b2', x: 10, y: 0 })).toBe('S');
    expect(stepDirection({ boardId: 'b1', x: 10, y: 19 }, { boardId: 'b2', x: 10, y: 0 })).toBeNull(); // 沒有 lattice 無法判斷
  });

  it('keeps the single-board canvas identical to the original 63 × 18 grid', () => {
    const single = buildCanvas(buildLattice([board('b1')]), 'b1');
    expect([single.originX, single.originY, single.width, single.height]).toEqual([1, 1, 63, 18]);
    const stacked = buildCanvas(buildLattice(STACKED), 'b1');
    expect(stacked.boardIds).toEqual(['b1', 'b2']);
    expect([stacked.originX, stacked.originY, stacked.width, stacked.height]).toEqual([0, 1, 65, 38]);
  });
});

describe('需求文件 38.19：Board Group 的電氣與佈線規則', () => {
  // b1 的 LED D1 陰極在 b1:c12-bot；b2 的 LED D2 陽極在 b2:c12-top。
  const parts = [comp('D1', 'led', 'H11'), comp('D2', 'led', 'C12', { board: 'b2' })];

  it('#7 貼在一起不代表導通：沒有導線時兩塊板的孔是不同的 Net', () => {
    const nets = extractNets(circuit(parts, [], STACKED));
    expect(nets).toHaveLength(4);
    for (const net of nets) expect(new Set(net.groupIds.map((g) => g.split(':')[0])).size).toBe(1);
  });

  it('#8 用導線跨板連接後才成為同一個 Net，而且是合法的導線', () => {
    const w = latticeWire(STACKED, 'x1', holeOn('b1', 'J12'), holeOn('b2', 'A12'));
    expect(w.path.map((p) => p.boardId)).toContain('b2');
    const c = circuit(parts, [w], STACKED);
    const shared = extractNets(c).find((n) => n.groupIds.includes('b1:c12-bot'))!;
    expect(shared.groupIds).toContain('b2:c12-top');
    const codes = validateCircuit(c).map((e) => e.code);
    for (const code of ['WIRE_PATH_INVALID', 'WIRE_ENDPOINT_INVALID', 'WIRE_THROUGH_OBSTACLE', 'WIRE_OVERLAP']) expect(codes).not.toContain(code);
  });

  it('#9 #10 Auto Route 把群組當成一張格子，跨板導線仍然合法', () => {
    const c = circuit(
      [...parts, comp('R1', 'resistor', 'G40'), comp('D3', 'led', 'D44', { board: 'b2' })],
      [latticeWire(STACKED, 'x1', holeOn('b1', 'J12'), holeOn('b2', 'A12')), latticeWire(STACKED, 'x2', holeOn('b1', 'J44'), holeOn('b2', 'A44'))],
      STACKED,
    );
    const { problems, spanning } = buildRoutingProblems(c, DEFAULT_ROUTING_CONFIG);
    expect(problems).toHaveLength(1);
    expect(spanning).toEqual([]);
    const r = autoRoute(c);
    expect(r.status).toBe('success');
    expect(checkRoutingLegality(c, r.wires)).toEqual([]);
    expect(crossingWires(r.wires)).toHaveLength(2);
    const lattice = buildLattice(c.boards);
    for (const w of r.wires) for (let i = 1; i < w.path.length; i++) expect(stepDirection(w.path[i - 1], w.path[i], lattice)).not.toBeNull();
    expect(r.metrics.overlaps).toBe(0);
    expect(r.metrics.crossings).toBe(0);
    expect(scoreRouting(c, r.wires).score).toBeGreaterThanOrEqual(90);
  });

  it('routes boards side by side through the vertical seam', () => {
    const c = circuit(
      [comp('D1', 'led', 'C60'), comp('D2', 'led', 'C3', { board: 'b2' })],
      [latticeWire(SIDE, 'x1', holeOn('b1', 'A61'), holeOn('b2', 'A3'))],
      SIDE,
    );
    const r = autoRoute(c);
    expect(r.status).toBe('success');
    expect(crossingWires(r.wires)).toHaveLength(1);
    expect(checkRoutingLegality(c, r.wires)).toEqual([]);
  });

  it('reports a net that spans boards which are not grouped', () => {
    const jump: Wire = {
      id: 'x1',
      color: '#888888',
      source: 'manual',
      start: holeOn('b1', 'J12'),
      end: holeOn('b2', 'A12'),
      path: [holeOn('b1', 'J12'), holeOn('b2', 'A12')],
    };
    const c = circuit(parts, [jump], APART);
    expect(validateCircuit(c).map((e) => e.code)).toContain('WIRE_PATH_INVALID');
    const r = autoRoute(c);
    expect(r.status).toBe('failed');
    expect(r.message).toBe('No valid routing solution.');
    expect(r.failedNets[0]).toMatchObject({ reason: 'UNROUTABLE' });
    expect(r.failedNets[0].detail).toContain('沒有貼在一起');
  });

  it('names holes with their board when there is more than one board', () => {
    const c = circuit([comp('D1', 'led', 'H11'), comp('D9', 'led', 'H12')], [], STACKED);
    expect(validateCircuit(c).find((e) => e.code === 'PIN_COLLISION')?.message).toContain('b1:H12');
  });

  it('simulates across boards: VCC on b1 lights an LED on b2', () => {
    const c = circuit(
      [
        comp('V1', 'vcc', 'F20'),
        comp('R1', 'resistor', 'C20', { board: 'b2' }),
        comp('D1', 'led', 'E24', { board: 'b2' }),
        comp('G1', 'gnd', 'A25', { board: 'b2' }),
      ],
      [latticeWire(STACKED, 'x1', holeOn('b1', 'J20'), holeOn('b2', 'A20'))],
      STACKED,
    );
    const sim = compileSimulation(c);
    expect(settle(sim, initialSimState(sim), { pressed: {}, clocks: {} }).result.litLeds).toEqual(['D1']);
  });
});
