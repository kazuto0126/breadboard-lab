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

  // 子專案 59：輸入最多 12 個（以前 8 個）。
  it('refuses more than 12 inputs', () => {
    let big = emptyDiagram();
    for (let i = 0; i < 12; i++) big = ok(addNode(big, 'INPUT', 0, i * 2));
    big = ok(addNode(big, 'OUTPUT', 10, 0));
    big = ok(connect(big, 'i1', { node: 'o1', pin: 0 }));
    const t = truthTable(big);
    expect(t.ok && t.rows.length).toBe(4096);
    big = ok(addNode(big, 'INPUT', 0, 30));
    expect(truthTable(big)).toMatchObject({ ok: false, reason: 'too-many' });
    expect(truthTable(emptyDiagram())).toMatchObject({ ok: false, reason: 'empty' });
  });
});

// 子專案 59：閘接回前面的迴授（課本圖 10-14 的閘控 SR 閂鎖）。
describe('feedback', () => {
  const node = (id: string, kind: LogicDiagram['nodes'][number]['kind'], extra: Partial<LogicDiagram['nodes'][number]> = {}) => ({ id, kind, x: 0, y: 0, ...extra });
  const wire = (id: string, from: string, to: string, pin: number) => ({ id, from, to: { node: to, pin } });
  const gatedSr = (): LogicDiagram => ({
    version: 1,
    nodes: [
      node('s', 'INPUT', { name: 'S' }), node('r', 'INPUT', { name: 'R' }), node('cp', 'INPUT', { name: 'CP' }),
      node('g1', 'NAND', { inputs: 2 }), node('g2', 'NAND', { inputs: 2 }), node('g3', 'NAND', { inputs: 2 }), node('g4', 'NAND', { inputs: 2 }),
      node('q', 'OUTPUT', { name: 'Q' }), node('qb', 'OUTPUT', { name: 'QBAR' }),
    ],
    wires: [
      wire('w1', 's', 'g1', 0), wire('w2', 'cp', 'g1', 1), wire('w3', 'r', 'g2', 0), wire('w4', 'cp', 'g2', 1),
      wire('w5', 'g1', 'g3', 0), wire('w6', 'g4', 'g3', 1), wire('w7', 'g2', 'g4', 0), wire('w8', 'g3', 'g4', 1),
      wire('w9', 'g3', 'q', 0), wire('w10', 'g4', 'qb', 0),
    ],
  });

  it('writes 保持 where the latch keeps its state', () => {
    const t = truthTable(gatedSr());
    expect(t).toMatchObject({ ok: true, inputs: ['CP', 'R', 'S'], outputs: ['Q', 'QBAR'], feedback: true });
    if (!t.ok) return;
    expect(t.rows.map((r) => `${r.in.join('')}:${r.out.join(',')}`)).toEqual([
      '000:保持,保持', '001:保持,保持', '010:保持,保持', '011:保持,保持',
      '100:保持,保持', '101:1,0', '110:0,1', '111:1,1',
    ]);
  });

  it('remembers the latch between evaluations', () => {
    const d = gatedSr();
    let v = evaluate(d, { s: 1, r: 0, cp: 1 });
    expect(v.nodes.get('q')).toBe(1);
    v = evaluate(d, { s: 0, r: 0, cp: 0 }, v.seq);
    expect([v.nodes.get('q'), v.nodes.get('qb')]).toEqual([1, 0]);
    v = evaluate(d, { s: 0, r: 1, cp: 1 }, v.seq);
    v = evaluate(d, { s: 0, r: 0, cp: 0 }, v.seq);
    expect([v.nodes.get('q'), v.nodes.get('qb')]).toEqual([0, 1]);
    expect(v.unstable.size).toBe(0);
  });

  it('writes 不穩定 when a loop never settles', () => {
    const d: LogicDiagram = { version: 1, nodes: [node('g1', 'NOT'), node('x', 'OUTPUT', { name: 'X' })], wires: [wire('w1', 'g1', 'g1', 0), wire('w2', 'g1', 'x', 0)] };
    expect(evaluate(d).unstable.has('g1')).toBe(true);
    const t = truthTable(d);
    expect(t.ok && t.rows.map((r) => r.out)).toEqual([['不穩定']]);
  });
});
