import { describe, expect, it } from 'vitest';
import { addNode, connect } from '../../src/logic/edit';
import { evaluate, gateValue, truthTable } from '../../src/logic/evaluate';
import { majorityDiagram } from '../../src/logic/examples';
import { emptyDiagram, type LogicDiagram } from '../../src/logic/types';

describe('three-valued gates', () => {
  it('handles 0, 1 and unknown', () => {
    expect(gateValue('AND', [1, 1, 1])).toBe(1);
    expect(gateValue('AND', [1, 'X'])).toBe('X');
    expect(gateValue('AND', [0, 'X'])).toBe(0);
    expect(gateValue('OR', [0, 0, 0, 0])).toBe(0);
    expect(gateValue('OR', ['X', 1])).toBe(1);
    expect(gateValue('OR', ['X', 0])).toBe('X');
    expect(gateValue('NAND', [1, 1])).toBe(0);
    expect(gateValue('NAND', [0, 'X'])).toBe(1);
    expect(gateValue('NOR', [0, 0])).toBe(1);
    expect(gateValue('NOT', [0])).toBe(1);
    expect(gateValue('NOT', ['X'])).toBe('X');
    expect(gateValue('XOR', [1, 0])).toBe(1);
    expect(gateValue('XOR', [1, 1])).toBe(0);
    expect(gateValue('XOR', [1, 'X'])).toBe('X');
  });
});

describe('figure 2-5 (majority)', () => {
  it('gives X = AB + AC + BC', () => {
    const t = truthTable(majorityDiagram());
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.inputs).toEqual(['A', 'B', 'C']);
    expect(t.outputs).toEqual(['X']);
    expect(t.rows.map((r) => `${r.in.join('')}:${r.out.join('')}`)).toEqual(['000:0', '001:0', '010:0', '011:1', '100:0', '101:1', '110:1', '111:1']);
  });

  it('evaluates with the switch values', () => {
    const d = majorityDiagram();
    const ids = Object.fromEntries(d.nodes.filter((n) => n.name).map((n) => [n.name!, n.id]));
    const v = evaluate(d, { [ids.A]: 1, [ids.B]: 1, [ids.C]: 0 });
    expect(v.loop).toBeNull();
    expect(v.nodes.get(ids.X)).toBe(1);
    expect(evaluate(d).nodes.get(ids.X)).toBe(0);
  });
});

describe('problems', () => {
  const ok = (r: { ok: boolean; diagram: LogicDiagram }) => r.diagram;
  it('marks open inputs as unknown', () => {
    let d = emptyDiagram();
    d = ok(addNode(d, 'INPUT', 0, 0));
    d = ok(addNode(d, 'AND', 4, 0));
    d = ok(addNode(d, 'OUTPUT', 10, 1));
    d = ok(connect(d, 'i1', { node: 'g1', pin: 0 }));
    d = ok(connect(d, 'g1', { node: 'o1', pin: 0 }));
    const t = truthTable(d);
    expect(t.ok && t.rows.map((r) => r.out[0])).toEqual([0, 'X']);
  });

  it('refuses loops and too many inputs', () => {
    let d = emptyDiagram();
    d = ok(addNode(d, 'OR', 0, 0));
    d = ok(addNode(d, 'OR', 10, 0));
    d = ok(connect(d, 'g1', { node: 'g2', pin: 0 }));
    d = ok(connect(d, 'g2', { node: 'g1', pin: 0 }));
    expect(evaluate(d).loop?.sort()).toEqual(['g1', 'g2']);
    expect(truthTable(d)).toMatchObject({ ok: false, reason: 'loop' });
    let big = emptyDiagram();
    for (let i = 0; i < 9; i++) big = ok(addNode(big, 'INPUT', 0, i * 2));
    expect(truthTable(big)).toMatchObject({ ok: false, reason: 'too-many' });
    expect(truthTable(emptyDiagram())).toMatchObject({ ok: false, reason: 'empty' });
  });
});
