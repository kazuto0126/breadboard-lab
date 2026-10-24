import { describe, expect, it } from 'vitest';
import { nodeIdOf } from '../../src/core/breadboard/naming';
import { DEFAULT_ROUTING_CONFIG } from '../../src/core/routing/config';
import { buildRoutingProblem, toIndex, toPoint, type RoutingProblem } from '../../src/core/routing/problem';
import { findRoute, lineBetween, wireCost, type SearchParams } from '../../src/core/routing/straightSearch';
import { StraightState, type PlacedWire } from '../../src/core/routing/straightState';
import { circuit, comp, hole, wire } from '../fixtures/build';

const hard: SearchParams = { weights: DEFAULT_ROUTING_CONFIG.weights, overlap: { kind: 'hard' } };
const W = DEFAULT_ROUTING_CONFIG.weights;
const at = (p: RoutingProblem, name: string) => toIndex(p, hole(name).x, hole(name).y);
const names = (p: RoutingProblem, cells: number[]) => cells.map((i) => nodeIdOf(toPoint(p, i)));
const ends = (p: RoutingProblem, wires: Array<{ a: number; b: number }>) => wires.map((w) => [nodeIdOf(toPoint(p, w.a)), nodeIdOf(toPoint(p, w.b))]);
const id = (name: string) => nodeIdOf(hole(name));

/** 兩顆 LED：D1 陽極 C10、D2 陽極 C30，使用者用一條線接起來 → NET_1 有兩簇（第 10、30 欄上半）。 */
const twoLeds = () => buildRoutingProblem(circuit([comp('D1', 'led', 'C10'), comp('D2', 'led', 'C30')], [wire('u1', 'A10', 'A30')]), DEFAULT_ROUTING_CONFIG);
const netOf = (p: RoutingProblem, netId = 'NET_1') => p.nets.find((n) => n.netId === netId)!;

/** 一條垂直線：從 top 到 bottom（同一欄），中間經過的格子都算。 */
const vertical = (p: RoutingProblem, id: string, netId: string, top: string, bottom: string): PlacedWire => {
  const line = lineBetween(p, at(p, top), at(p, bottom));
  return { id, netId, a: line.a, b: line.b, o: line.o, cells: line.cells };
};

// 子專案 39（規格 2026-10-20 wiring-rules）：線不能十字交叉。
describe('crossings are not allowed', () => {
  it('finds no route in strict mode when every way crosses another wire (except over an empty rail)', () => {
    const p = twoLeds();
    const net = netOf(p);
    const state = new StraightState(p);
    // 第 20 欄從 A 到 J 擋著一條別的 Net 的直線：上半部從第 10 欄到第 30 欄一定要橫過它。
    state.addWire(vertical(p, 'x', 'OTHER', 'A20', 'J20'));
    // 子專案 47：空的電源軌可以當轉接排：從上面的軌繞過去（兩條直的線）。
    const viaRail = findRoute(p, state, net, new Set(net.clusters[0]), new Set(net.clusters[1]), hard);
    expect(viaRail?.wires.some((w) => [w.a, w.b].some((cell) => p.railGroups.has(p.groupAt[cell] ?? '')))).toBe(true);
    for (const g of p.railGroups) p.pinGroups.add(g);
    expect(findRoute(p, state, net, new Set(net.clusters[0]), new Set(net.clusters[1]), hard)).toBeNull();
    // 協商時可以先交叉（之後當成衝突排開）。
    const negotiate: SearchParams = { weights: W, overlap: { kind: 'negotiate', overlapBase: 1, presentFactor: 1 } };
    expect(findRoute(p, state, net, new Set(net.clusters[0]), new Set(net.clusters[1]), negotiate)).not.toBeNull();
  });

  it('counts a crossing as a conflict between both nets', () => {
    const p = twoLeds();
    const state = new StraightState(p);
    state.addWire(vertical(p, 'x', 'A', 'A20', 'J20'));
    const row = lineBetween(p, at(p, 'B15'), at(p, 'B25'));
    state.addWire({ id: 'y', netId: 'B', a: row.a, b: row.b, o: row.o, cells: row.cells });
    const conflicts = state.conflicts();
    expect(conflicts).toContainEqual({ kind: 'cross', cell: at(p, 'B20') });
    expect([...state.netsIn(conflicts)].sort()).toEqual(['A', 'B']);
  });
});

describe('straight-wire search', () => {
  it('connects two strips in the same row band with one horizontal wire', () => {
    const p = twoLeds();
    const net = netOf(p);
    const state = new StraightState(p);
    const r = findRoute(p, state, net, new Set(net.clusters[0]), new Set(net.clusters[1]), hard)!;
    expect(r.wires).toHaveLength(1);
    const [w] = r.wires;
    expect(w.o).toBe(0);
    expect(p.groupAt[w.a]).toBe('b1:c10-top');
    expect(p.groupAt[w.b]).toBe('b1:c30-top');
    expect(r.cost).toBe(W.wire + 20 * W.distance);
  });

  it('turns through a free strip when the straight way is blocked', () => {
    // 第 10 欄上半 ↔ 第 30 欄下半：沒有同一列可以直達，要經過一個轉接排。
    const c = circuit([comp('D1', 'led', 'C10'), comp('D2', 'led', 'H30')], [wire('u1', 'A10', 'J30')]);
    const p = buildRoutingProblem(c, DEFAULT_ROUTING_CONFIG);
    const net = p.nets.find((n) => n.clusters.length === 2)!;
    const r = findRoute(p, new StraightState(p), net, new Set(net.clusters[0]), new Set(net.clusters[1]), hard)!;
    expect(r.wires.length).toBeGreaterThanOrEqual(2);
    for (const w of r.wires) expect(w.cells.length + 1).toBe(Math.abs(w.b - w.a) / (w.o === 0 ? 1 : p.width));
    const vias = r.wires.slice(0, -1).map((w) => p.groupAt[w.b]!);
    for (const g of vias) {
      expect(p.pinGroups.has(g)).toBe(false);
      expect(p.railGroups.has(g)).toBe(false);
    }
  });

  it('never ends on a pin, never passes over a pin or body, and never reuses the arrival hole', () => {
    const c = circuit([comp('U1', '74LS00', 'F10'), comp('D1', 'led', 'C5'), comp('D2', 'led', 'H25')], [wire('u1', 'A5', 'J25')]);
    const p = buildRoutingProblem(c, DEFAULT_ROUTING_CONFIG);
    const net = p.nets.find((n) => n.clusters.length === 2)!;
    const r = findRoute(p, new StraightState(p), net, new Set(net.clusters[0]), new Set(net.clusters[1]), hard)!;
    const used = r.wires.flatMap((w) => [w.a, w.b]);
    expect(new Set(used).size).toBe(used.length);
    for (const w of r.wires) for (const cell of [w.a, w.b, ...w.cells]) expect(p.blocked[cell]).toBe(0);
  });

  it('refuses to end on a hole that has a wire end or under another wire, and to pass over a wire end, in hard mode', () => {
    const p = twoLeds();
    const net = netOf(p);
    const state = new StraightState(p);
    // 別的 Net 的一條直線佔住第 4 列（A 列）第 15～25 欄。
    state.addWire({ id: 'x', netId: 'OTHER', ...lineBetween(p, at(p, 'A15'), at(p, 'A25')) });
    const r = findRoute(p, state, net, new Set(net.clusters[0]), new Set(net.clusters[1]), hard)!;
    for (const w of r.wires) {
      expect(w.cells).not.toContain(at(p, 'A15'));
      expect(w.cells).not.toContain(at(p, 'A25'));
      expect(w.o === 0 && w.cells.some((cell) => cell > at(p, 'A15') && cell < at(p, 'A25'))).toBe(false);
    }
  });

  it("passes over the empty middle holes of another net's strip", () => {
    const p = twoLeds();
    const net = netOf(p);
    const state = new StraightState(p);
    // OTHER 用第 20 欄上半當轉接排：線端插在 A20 與 E20（往右的短線），中間 B20～D20 空著。
    state.addWire({ id: 'x1', netId: 'OTHER', ...lineBetween(p, at(p, 'A20'), at(p, 'A22')) });
    state.addWire({ id: 'x2', netId: 'OTHER', ...lineBetween(p, at(p, 'E20'), at(p, 'E22')) });
    const r = findRoute(p, state, net, new Set(net.clusters[0]), new Set(net.clusters[1]), hard)!;
    expect(r.wires).toHaveLength(1);
    expect(names(p, r.wires[0].cells).some((n) => [id('B20'), id('C20'), id('D20')].includes(n))).toBe(true);
  });

  it('prices an existing wire exactly like the search', () => {
    const p = twoLeds();
    const net = netOf(p);
    const state = new StraightState(p);
    const r = findRoute(p, state, net, new Set(net.clusters[0]), new Set(net.clusters[1]), hard)!;
    expect(r.wires.reduce((sum, w) => sum + wireCost(p, state, net, w, hard), 0)).toBe(r.cost);
  });
});

describe('straight-wire state', () => {
  it('finds shared ends, collinear overlaps, wires over ends, and shared strips', () => {
    const p = twoLeds();
    const s = new StraightState(p);
    s.addWire({ id: 'a', netId: 'N1', ...lineBetween(p, at(p, 'A40'), at(p, 'A45')) });
    s.addWire({ id: 'b', netId: 'N2', ...lineBetween(p, at(p, 'A43'), at(p, 'A50')) });
    s.addWire({ id: 'c', netId: 'N3', ...lineBetween(p, at(p, 'A50'), at(p, 'E50')) });
    const kinds = s.conflicts().map((x) => x.kind).sort();
    expect(kinds).toContain('line'); // a 與 b 在 A44 共線
    expect(kinds).toContain('pass'); // b 經過 a 的端點 A45
    expect(kinds).toContain('end'); // b 與 c 都插 A50
    expect(kinds).toContain('via'); // N2 與 N3 都用第 50 欄上半
    expect([...s.netsIn(s.conflicts())].sort()).toEqual(['N1', 'N2', 'N3']);
    s.removeNet('N2');
    expect(s.conflicts()).toEqual([]);
  });

  it('owns its terminal groups and the strips its wires end in', () => {
    const p = twoLeds();
    const s = new StraightState(p);
    expect(s.owns('NET_1', 'b1:c10-top')).toBe(true);
    expect(s.owns('NET_1', 'b1:c50-top')).toBe(false);
    s.addWire({ id: 'a', netId: 'NET_1', ...lineBetween(p, at(p, 'A10'), at(p, 'A50')) });
    expect(s.owns('NET_1', 'b1:c50-top')).toBe(true);
    expect(s.viaOthers('NET_2', 'b1:c50-top')).toBe(1);
  });
});
