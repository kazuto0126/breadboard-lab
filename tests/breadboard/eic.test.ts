import { describe, expect, it } from 'vitest';
import { buildLattice } from '../../src/core/breadboard/lattice';
import { getNode, holeName, parseHoleName } from '../../src/core/breadboard/naming';
import { getBoard } from '../../src/core/breadboard/registry';
import { describeGroup } from '../../src/core/routing/problem';
import { addBoard } from '../../src/editor/boards';
import { parseCircuitText, serializeCircuitFile } from '../../src/editor/fileFormat';
import { board, circuit } from '../fixtures/build';

const b = getBoard('EIC1106', 'b1');
const groupOfName = (name: string) => {
  const p = parseHoleName(b, name)!;
  return getNode(b, p.x, p.y)!.groupId;
};

describe('EIC-1106 layout', () => {
  it('has 2390 holes plus 4 binding posts', () => {
    expect(b.width).toBe(63);
    expect(b.height).toBe(56);
    expect(b.nodes.filter((n) => n.kind === 'hole')).toHaveLength(2394);
    expect(Object.keys(b.groups).filter((g) => g.includes(':post-'))).toHaveLength(4);
  });

  it('names holes by area, rail and post', () => {
    expect(parseHoleName(b, '1-A15')).toEqual({ boardId: 'b1', x: 15, y: 10 });
    expect(parseHoleName(b, '2-F30')).toEqual({ boardId: 'b1', x: 30, y: 33 });
    expect(parseHoleName(b, '3-J63')).toEqual({ boardId: 'b1', x: 63, y: 53 });
    expect(parseHoleName(b, 'P2+12')).toEqual({ boardId: 'b1', x: 12, y: 7 });
    expect(parseHoleName(b, 'P5−40')).toEqual({ boardId: 'b1', x: 40, y: 56 });
    expect(parseHoleName(b, '紅')).toEqual({ boardId: 'b1', x: 20, y: 2 });
    expect(holeName(b, { boardId: 'b1', x: 15, y: 10 })).toBe('1-A15');
    expect(parseHoleName(b, 'A15')).toBeNull();
  });

  it('connects each half strip, keeps areas apart and runs rails full length', () => {
    expect(groupOfName('2-A15')).toBe(groupOfName('2-E15'));
    expect(groupOfName('2-A15')).not.toBe(groupOfName('2-F15'));
    expect(groupOfName('1-A15')).not.toBe(groupOfName('2-A15'));
    expect(groupOfName('P3+3')).toBe(groupOfName('P3+61'));
    expect(groupOfName('P3+3')).not.toBe(groupOfName('P3-3'));
    expect(b.groups['b1:post-red']).toMatchObject({ kind: 'rail', source: 'vcc' });
    expect(b.groups['b1:post-black']).toMatchObject({ kind: 'rail', source: 'gnd' });
    expect(b.groups['b1:post-yellow'].source).toBeUndefined();
  });

  it('describes area strips and posts', () => {
    expect(describeGroup('b1:a2-c15-top')).toBe('第 2 區第 15 欄上半（A–E）');
    expect(describeGroup('b1:post-red')).toBe('紅色接線柱');
    expect(describeGroup('b1:rail-P3+')).toBe('P3+ 電源軌');
  });

  it('keeps MB-102 names and groups unchanged', () => {
    const m = getBoard('MB102', 'b1');
    expect(parseHoleName(m, 'A15')).toEqual({ boardId: 'b1', x: 15, y: 4 });
    expect(getNode(m, 15, 4)!.groupId).toBe('b1:c15-top');
    expect(describeGroup('b1:c15-top')).toBe('第 15 欄上半（A–E）');
  });

  it('stacks under an MB-102 into one board group', () => {
    const c = circuit([], [], [board('b1'), board('b2', 0, 20, 'EIC1106')]);
    expect(buildLattice(c.boards).groupOf.get('b2')).toBe('b1');
  });

  it('can be added and keeps its layout through save and load', () => {
    const added = addBoard(circuit([]), 'EIC1106')!;
    expect(added.circuit.boards[1]).toMatchObject({ id: 'b2', layoutId: 'EIC1106' });
    const r = parseCircuitText(serializeCircuitFile(added.circuit, 't'));
    expect(r.ok && r.circuit.boards[1].layoutId).toBe('EIC1106');
  });
});

describe('wire colours on an EIC-1106', () => {
  it('colours wires to a + rail or the red post red, and to a − rail or the black post black', async () => {
    const { defaultWireColor } = await import('../../src/editor/manualWire');
    const { holeOn } = await import('../fixtures/build');
    const c = circuit([], [], [board('b1', 0, 0, 'EIC1106')]);
    const at = (n: string) => holeOn('b1', n, 'EIC1106');
    expect(defaultWireColor(c, at('2-A10'), at('P3+6'))).toBe('#d32f2f');
    expect(defaultWireColor(c, at('紅'), at('2-A10'))).toBe('#d32f2f');
    expect(defaultWireColor(c, at('2-J16'), at('P4-6'), 'x')).not.toBe('x');
    expect(defaultWireColor(c, at('黑'), at('2-A10'), 'x')).not.toBe('x');
    expect(defaultWireColor(c, at('黃'), at('2-A10'), 'x')).toBe('x');
  });
});
