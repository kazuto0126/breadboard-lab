import { describe, expect, it } from 'vitest';
import { buildLattice } from '../../src/core/breadboard/lattice';
import { nodeIdOf } from '../../src/core/breadboard/naming';
import { analyzeWireInteractions, cellsUnder, pathIssues, segmentCrossing, segmentOverlap, wireLength, wireSegments } from '../../src/core/circuit/wireGeometry';
import { validateCircuit } from '../../src/core/circuit/validate';
import { computeMetrics } from '../../src/core/routing/metrics';
import { parseCircuitData, toCircuitFile } from '../../src/editor/fileFormat';
import { buildOccupancy } from '../../src/editor/placement';
import { board, circuit, comp, holeOn, hole, pt, straightWire, wire } from '../fixtures/build';

const ids = (points: Array<{ boardId: string; x: number; y: number }>) => points.map(nodeIdOf);
const seg = (ax: number, ay: number, bx: number, by: number) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });

describe('straight wire geometry', () => {
  const lattice = buildLattice(circuit([]).boards);

  it('builds a straight wire with exactly its two ends as the path', () => {
    const w = straightWire('s1', 'A10', 'C14');
    expect(w).toMatchObject({ id: 's1', straight: true, source: 'manual', start: hole('A10'), end: hole('C14') });
    expect(w.path).toEqual([hole('A10'), hole('C14')]);
  });

  it('lists the holes a horizontal or vertical wire passes over, without its ends', () => {
    expect(ids(cellsUnder(straightWire('h', 'A10', 'A13'), lattice))).toEqual(ids([hole('A11'), hole('A12')]));
    expect(ids(cellsUnder(straightWire('v', 'A10', 'T+10'), lattice))).toEqual(ids([pt(10, 3)]));
  });

  it('a diagonal through the gap between holes touches none, a steeper one touches both neighbours', () => {
    // (10,4) → (12,6)：正好穿過 (11,5) 的中心。
    expect(ids(cellsUnder(straightWire('d', 'A10', 'C12'), lattice))).toEqual(ids([hole('B11')]));
    // (10,4) → (11,5)：只經過兩個孔的角落之間，不算經過任何孔。
    expect(cellsUnder(straightWire('d2', 'A10', 'B11'), lattice)).toEqual([]);
    // (10,4) → (12,5)：在 x = 11 時 y = 4.5，兩邊的孔都被碰到。
    expect(ids(cellsUnder(straightWire('d3', 'A10', 'B12'), lattice))).toEqual(ids([hole('A11'), hole('B11')]));
  });

  it('maps cells to the right board across the seam of a board group', () => {
    const boards = [board('b1'), board('b2', 0, 20)];
    const l = buildLattice(boards);
    const cells = cellsUnder(straightWire('x', holeOn('b1', 'J12'), holeOn('b2', 'A12')), l);
    expect(new Set(cells.map((p) => p.boardId))).toEqual(new Set(['b1', 'b2']));
    expect(ids(cells)).toContain(nodeIdOf(holeOn('b1', 'B+12')));
  });

  it('measures length as the straight distance, and old path wires by their steps', () => {
    expect(wireLength(straightWire('a', 'A10', 'A13'), lattice)).toBe(3);
    expect(wireLength(straightWire('b', 'A10', 'D14'), lattice)).toBeCloseTo(5);
    expect(wireLength(wire('p', 'A10', 'A12', 'C12'))).toBe(4);
  });

  it('splits an old path wire into straight runs', () => {
    expect(wireSegments(wire('p', 'A10', 'A12', 'C12'))).toEqual([seg(10, 4, 12, 4), seg(12, 4, 12, 6)]);
  });

  it('finds collinear overlaps and single-point crossings', () => {
    expect(segmentOverlap(seg(0, 0, 4, 0), seg(2, 0, 6, 0))).toEqual({ x: 2, y: 0 });
    expect(segmentOverlap(seg(0, 0, 4, 0), seg(4, 0, 6, 0))).toBeNull(); // 只碰到端點
    expect(segmentOverlap(seg(0, 0, 4, 4), seg(2, 2, 6, 6))).toEqual({ x: 2, y: 2 });
    expect(segmentCrossing(seg(0, 0, 4, 4), seg(0, 4, 4, 0))).toEqual({ x: 2, y: 2 });
    expect(segmentCrossing(seg(0, 0, 4, 0), seg(4, 0, 4, 3))).toBeNull(); // 端點相接不算交叉
    expect(segmentCrossing(seg(0, 0, 4, 0), seg(2, 0, 6, 0))).toBeNull(); // 共線交給 segmentOverlap
  });

  it('reports overlaps and crossings that involve straight wires', () => {
    const wires = [straightWire('s1', 'A10', 'A20'), straightWire('s2', 'A15', 'A25'), straightWire('s3', 'B12', 'D14'), straightWire('s4', 'D12', 'B14'), wire('p1', 'E30', 'E40')];
    const { overlaps, crossings } = analyzeWireInteractions(wires, lattice);
    expect(overlaps.map((o) => o.wireIds)).toEqual([['s1', 's2']]);
    expect(crossings.map((o) => o.wireIds)).toEqual([['s3', 's4']]);
    expect(analyzeWireInteractions([straightWire('s5', 'E31', 'E35'), wire('p1', 'E30', 'E40')], lattice).overlaps.map((o) => o.wireIds)).toEqual([['p1', 's5']]);
  });

  it('checks a straight wire only by its two ends', () => {
    const onBoard = () => true;
    expect(pathIssues(straightWire('s', 'A10', 'J40'), onBoard, lattice)).toEqual([]);
    expect(pathIssues(straightWire('s', 'A10', 'A10'), onBoard, lattice)).toContain('TOO_SHORT');
    const apart = buildLattice([board('b1'), board('b2', 0, 40)]);
    expect(pathIssues(straightWire('s', holeOn('b1', 'A1'), holeOn('b2', 'A1')), onBoard, apart)).toContain('NOT_SAME_GROUP');
  });
});

const codes = (c: ReturnType<typeof circuit>) => validateCircuit(c).map((e) => e.code);

describe('checking straight wires', () => {
  it('flags a straight wire that passes over an IC or another wire end, but not a crossing', () => {
    const ic = comp('U1', '74LS00', 'F10');
    expect(codes(circuit([ic], [straightWire('s1', 'D8', 'H14')]))).toContain('WIRE_THROUGH_OBSTACLE');
    expect(codes(circuit([], [straightWire('s1', 'A10', 'A20'), straightWire('s2', 'C15', 'A15')]))).toContain('WIRE_THROUGH_OBSTACLE');
    const crossing = codes(circuit([], [straightWire('s1', 'B12', 'D14'), straightWire('s2', 'D12', 'B14')]));
    expect(crossing).not.toContain('WIRE_OVERLAP');
    expect(crossing).not.toContain('WIRE_THROUGH_OBSTACLE');
  });

  it('flags collinear overlaps', () => {
    expect(codes(circuit([], [straightWire('s1', 'A10', 'A20'), straightWire('s2', 'A15', 'A25')]))).toContain('WIRE_OVERLAP');
  });

  it('allows several wires in one hole', () => {
    expect(codes(circuit([], [straightWire('s1', 'A10', 'A20'), straightWire('s2', 'A20', 'E25')]))).not.toContain('WIRE_ENDPOINT_INVALID');
  });

  it('counts straight length, no bends, and crossings in the metrics', () => {
    const m = computeMetrics([straightWire('s1', 'B12', 'D14'), straightWire('s2', 'D12', 'B14')]);
    expect(m.totalLength).toBeCloseTo(5.7, 5);
    expect(m.bends).toBe(0);
    expect(m.crossings).toBe(1);
  });

  it('marks the holes a straight wire passes over as wire paths', () => {
    const occ = buildOccupancy(circuit([], [straightWire('s1', 'A10', 'A13')]), 'b1');
    expect([...occ.wirePaths].sort()).toEqual([nodeIdOf(hole('A11')), nodeIdOf(hole('A12'))].sort());
  });

  it('saves and loads the straight flag', () => {
    const c = circuit([], [straightWire('s1', 'A10', 'C14')]);
    const text = JSON.stringify(toCircuitFile(c, 't'));
    const back = parseCircuitData(JSON.parse(text));
    expect(back.ok && back.circuit.wires[0]).toMatchObject({ straight: true, path: [hole('A10'), hole('C14')] });
    const raw = JSON.parse(text);
    raw.circuit.wires[0].path = [hole('A10'), hole('B10'), hole('C14')];
    const fixed = parseCircuitData(raw);
    expect(fixed.ok && fixed.circuit.wires[0].path).toEqual([hole('A10'), hole('C14')]);
  });
});
