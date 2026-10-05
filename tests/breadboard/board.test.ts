import { describe, expect, it } from 'vitest';
import { buildBoard } from '../../src/core/breadboard/buildBoard';
import { MB102_LAYOUT } from '../../src/core/breadboard/layouts';
import { getNode, holeName, nodeIdOf, parseHoleName, parseNodeId } from '../../src/core/breadboard/naming';
import { getBoard } from '../../src/core/breadboard/registry';

const board = buildBoard(MB102_LAYOUT, 'b1');

function nodeNamed(name: string) {
  const p = parseHoleName(board, name);
  if (!p) throw new Error(`no hole ${name}`);
  return getNode(board, p.x, p.y)!;
}

describe('MB-102 board model', () => {
  it('has a 63 x 18 lattice', () => {
    expect(board.nodes).toHaveLength(1134);
    expect(getNode(board, 12, 4)).toBe(board.nodes[(4 - 1) * 63 + (12 - 1)]);
  });

  it('has 830 holes in 130 conductive groups', () => {
    expect(board.nodes.filter((n) => n.kind === 'hole')).toHaveLength(830);
    expect(Object.keys(board.groups)).toHaveLength(130);
  });

  it('connects A12..E12, and separates E12 from F12', () => {
    expect(nodeNamed('A12').groupId).toBe('b1:c12-top');
    expect(nodeNamed('E12').groupId).toBe('b1:c12-top');
    expect(nodeNamed('F12').groupId).toBe('b1:c12-bot');
    expect(nodeNamed('J12').groupId).toBe('b1:c12-bot');
    expect(board.groups['b1:c12-top'].nodeIds).toHaveLength(5);
  });

  it('makes each power rail a single 50-hole group', () => {
    for (const rail of ['T-', 'T+', 'B+', 'B-']) {
      expect(board.groups[`b1:rail-${rail}`].nodeIds).toHaveLength(50);
      expect(board.groups[`b1:rail-${rail}`].kind).toBe('rail');
    }
    expect(nodeNamed('T+3').groupId).toBe('b1:rail-T+');
    expect(nodeNamed('T+61').groupId).toBe('b1:rail-T+');
  });

  it('treats rail gaps, gap rows and the trench as surface', () => {
    const surface: Array<[number, number]> = [[8, 1], [1, 2], [62, 17], [12, 3], [12, 9], [12, 10], [12, 16]];
    for (const [x, y] of surface) {
      const node = getNode(board, x, y)!;
      expect(node.kind).toBe('surface');
      expect(node.groupId).toBeNull();
      expect(node.name).toBeNull();
    }
  });

  it('round-trips every hole name', () => {
    for (const node of board.nodes.filter((n) => n.kind === 'hole')) {
      const p = { boardId: 'b1', x: node.x, y: node.y };
      expect(parseHoleName(board, holeName(board, p)!)).toEqual(p);
    }
  });

  it('parses qualified, lowercase and unicode-minus names, and rejects junk', () => {
    expect(parseHoleName(board, 'b1:A12')).toEqual({ boardId: 'b1', x: 12, y: 4 });
    expect(parseHoleName(board, 'a12')).toEqual({ boardId: 'b1', x: 12, y: 4 });
    expect(parseHoleName(board, 'B−30')).toEqual({ boardId: 'b1', x: 30, y: 18 });
    expect(parseHoleName(board, 'b+30')).toEqual({ boardId: 'b1', x: 30, y: 17 });
    expect(parseHoleName(board, 'B12')).toEqual({ boardId: 'b1', x: 12, y: 5 });
    expect(parseHoleName(board, 'T+8')).toBeNull();
    expect(parseHoleName(board, 'K1')).toBeNull();
    expect(parseHoleName(board, 'b2:A1')).toBeNull();
  });

  it('returns undefined outside the board and null names for surface', () => {
    expect(getNode(board, 0, 1)).toBeUndefined();
    expect(getNode(board, 64, 1)).toBeUndefined();
    expect(getNode(board, 1, 19)).toBeUndefined();
    expect(holeName(board, { boardId: 'b1', x: 12, y: 9 })).toBeNull();
  });

  it('converts node ids both ways', () => {
    expect(nodeIdOf({ boardId: 'b1', x: 12, y: 4 })).toBe('b1:12,4');
    expect(parseNodeId('b1:12,4')).toEqual({ boardId: 'b1', x: 12, y: 4 });
  });

  it('caches boards by layout and id', () => {
    expect(getBoard('MB102', 'b1')).toBe(getBoard('MB102', 'b1'));
    expect(() => getBoard('NOPE', 'b1')).toThrow('Unknown board layout');
  });
});
