import { describe, expect, it } from 'vitest';
import {
  analyzeWireInteractions,
  countBends,
  countShortJogs,
  pathIssues,
  segments,
  stepDirection,
  wireNodeUsages,
} from '../../src/core/circuit/wireGeometry';
import type { Wire } from '../../src/types/circuit';
import type { GridPoint } from '../../src/types/geometry';
import { pt, wire } from '../fixtures/build';

const onBoard = (p: GridPoint) => p.x >= 1 && p.x <= 63 && p.y >= 1 && p.y <= 18;

function raw(id: string, points: Array<[number, number]>): Wire {
  const path = points.map(([x, y]) => pt(x, y));
  return { id, color: '#888888', source: 'manual', start: path[0], end: path[path.length - 1], path };
}

describe('stepDirection', () => {
  it('only accepts unit orthogonal steps on the same board', () => {
    expect(stepDirection(pt(5, 5), pt(6, 5))).toBe('E');
    expect(stepDirection(pt(5, 5), pt(4, 5))).toBe('W');
    expect(stepDirection(pt(5, 5), pt(5, 6))).toBe('S');
    expect(stepDirection(pt(5, 5), pt(5, 4))).toBe('N');
    expect(stepDirection(pt(5, 5), pt(6, 6))).toBeNull();
    expect(stepDirection(pt(5, 5), pt(7, 5))).toBeNull();
    expect(stepDirection(pt(5, 5), { boardId: 'b2', x: 6, y: 5 })).toBeNull();
  });
});

describe('pathIssues', () => {
  it('accepts a clean L-shaped wire', () => {
    expect(pathIssues(wire('w', 'A10', 'C20'), onBoard)).toEqual([]);
  });

  it('flags each kind of broken path', () => {
    expect(pathIssues(raw('w', [[5, 5]]), onBoard)).toContain('TOO_SHORT');
    expect(pathIssues(raw('w', [[5, 5], [6, 6]]), onBoard)).toContain('NOT_ORTHOGONAL_STEP');
    expect(pathIssues(raw('w', [[5, 5], [6, 5], [5, 5]]), onBoard)).toContain('SELF_INTERSECT');
    expect(pathIssues(raw('w', [[1, 5], [0, 5]]), onBoard)).toContain('OUT_OF_BOARD');
    expect(pathIssues({ ...raw('w', [[5, 5], [6, 5]]), end: pt(9, 9) }, onBoard)).toContain('ENDPOINT_MISMATCH');
  });
});

describe('segments, bends and short jogs', () => {
  it('measures straight, L and Z shapes', () => {
    const straight = raw('a', [[1, 4], [2, 4], [3, 4]]);
    const l = raw('b', [[1, 4], [2, 4], [2, 5], [2, 6]]);
    const z = raw('c', [[1, 4], [2, 4], [2, 5], [3, 5], [4, 5]]);
    const zLong = raw('d', [[1, 4], [2, 4], [2, 5], [2, 6], [3, 6]]);
    expect(segments(l.path)).toEqual([
      { dir: 'E', length: 1 },
      { dir: 'S', length: 2 },
    ]);
    expect([countBends(straight.path), countShortJogs(straight.path)]).toEqual([0, 0]);
    expect([countBends(l.path), countShortJogs(l.path)]).toEqual([1, 0]);
    expect([countBends(z.path), countShortJogs(z.path)]).toEqual([2, 1]);
    expect([countBends(zLong.path), countShortJogs(zLong.path)]).toEqual([2, 0]);
  });
});

describe('wireNodeUsages', () => {
  it('labels ends, straight runs and turns', () => {
    const l = raw('w', [[1, 4], [2, 4], [3, 4], [3, 5], [3, 6]]);
    expect(wireNodeUsages(l).map((u) => u.kind)).toEqual(['end', 'H', 'turn', 'V', 'end']);
  });
});

describe('analyzeWireInteractions', () => {
  const horizontal = raw('h', [[1, 5], [2, 5], [3, 5], [4, 5], [5, 5]]);

  it('counts a perpendicular pass-through as a crossing', () => {
    const vertical = raw('v', [[3, 3], [3, 4], [3, 5], [3, 6], [3, 7]]);
    const result = analyzeWireInteractions([horizontal, vertical]);
    expect(result.crossings).toEqual([{ nodeId: 'b1:3,5', wireIds: ['h', 'v'] }]);
    expect(result.overlaps).toEqual([]);
  });

  it('counts a shared segment as overlaps', () => {
    const parallel = raw('p', [[2, 5], [3, 5], [4, 5]]);
    expect(analyzeWireInteractions([horizontal, parallel]).overlaps.length).toBeGreaterThan(0);
  });

  it('counts an endpoint touching another wire as an overlap', () => {
    const ending = raw('e', [[3, 3], [3, 4], [3, 5]]);
    expect(analyzeWireInteractions([horizontal, ending]).overlaps).toEqual([{ nodeId: 'b1:3,5', wireIds: ['e', 'h'] }]);
  });
});
