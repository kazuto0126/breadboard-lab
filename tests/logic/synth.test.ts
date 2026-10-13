import { describe, expect, it } from 'vitest';
import { addNode, connect, setInputCount } from '../../src/logic/edit';
import { truthTable } from '../../src/logic/evaluate';
import { majorityDiagram } from '../../src/logic/examples';
import { assignIcs, convertProblem, decompose, evaluateUnits, gateSlots } from '../../src/logic/synth';
import { emptyDiagram, type GateKind, type LogicDiagram } from '../../src/logic/types';

const must = (r: { ok: boolean; diagram: LogicDiagram }) => {
  if (!r.ok) throw new Error('bad edit');
  return r.diagram;
};

/** 一個閘、n 個輸入端、一個輸出端，全部接好。 */
function single(kind: GateKind, n: number): LogicDiagram {
  let d = emptyDiagram();
  for (let i = 0; i < n; i++) d = must(addNode(d, 'INPUT', 0, i * 2));
  d = must(addNode(d, kind, 10, 0));
  if (n > 2 || (n === 2 && kind !== 'NOT' && kind !== 'XOR')) d = must(setInputCount(d, 'g1', n));
  d = must(addNode(d, 'OUTPUT', 20, 0));
  for (let i = 0; i < n; i++) d = must(connect(d, `i${i + 1}`, { node: 'g1', pin: i }));
  return must(connect(d, 'g1', { node: 'o1', pin: 0 }));
}

/** 用拆開後的單元算出每一列的輸出，和邏輯圖的真值表比較。 */
function sameAsTable(d: LogicDiagram) {
  const t = truthTable(d);
  if (!t.ok) throw new Error('no table');
  const inputs = d.nodes.filter((n) => n.kind === 'INPUT').sort((a, b) => (a.name! < b.name! ? -1 : 1));
  const out = d.nodes.find((n) => n.kind === 'OUTPUT')!;
  const source = d.wires.find((w) => w.to.node === out.id)!.from;
  const units = decompose(d);
  return t.rows.every((r) => {
    const values = Object.fromEntries(inputs.map((n, i) => [n.id, r.in[i]]));
    return evaluateUnits(units, values)[source] === r.out[0];
  });
}

describe('decompose', () => {
  it.each([
    ['AND', 2, ['AND2']],
    ['AND', 3, ['AND3']],
    ['AND', 4, ['AND4']],
    ['OR', 2, ['OR2']],
    ['OR', 3, ['OR2', 'OR2']],
    ['OR', 4, ['OR2', 'OR2', 'OR2']],
    ['NAND', 2, ['NAND2']],
    ['NAND', 3, ['AND2', 'NAND2']],
    ['NAND', 4, ['AND3', 'NAND2']],
    ['NOR', 2, ['NOR2']],
    ['NOR', 3, ['OR2', 'NOR2']],
    ['NOR', 4, ['OR2', 'OR2', 'NOR2']],
    ['NOT', 1, ['NOT']],
    ['XOR', 2, ['XOR2']],
  ] as Array<[GateKind, number, string[]]>)('%s with %i inputs keeps the same truth table', (kind, n, kinds) => {
    const d = single(kind, n);
    expect(decompose(d).map((u) => u.kind)).toEqual(kinds);
    expect(sameAsTable(d)).toBe(true);
  });

  it('turns figure 2-5 into three ANDs and two ORs', () => {
    const d = majorityDiagram();
    expect(decompose(d).map((u) => u.kind)).toEqual(['AND2', 'AND2', 'AND2', 'OR2', 'OR2']);
    expect(sameAsTable(d)).toBe(true);
  });
});

describe('assignIcs', () => {
  it('fills one chip before opening the next, in IC table order', () => {
    const plan = assignIcs(decompose(majorityDiagram()));
    expect(plan.map((p) => [p.id, p.defId, p.slots.map((s) => (s ? s.kind : null))])).toEqual([
      ['U1', '74LS08', ['AND2', 'AND2', 'AND2', null]],
      ['U2', '74LS32', ['OR2', 'OR2', null, null]],
    ]);
  });

  it('opens a second chip for the fifth gate', () => {
    const units = Array.from({ length: 5 }, (_, i) => ({ kind: 'AND2' as const, inputs: ['a', 'b'], output: `y${i}` }));
    expect(assignIcs(units).map((p) => p.slots.filter(Boolean).length)).toEqual([4, 1]);
  });
});

describe('gateSlots', () => {
  it('reads pin numbers from the part definitions', () => {
    expect(gateSlots('74LS08')[0]).toEqual({ inputs: [1, 2], output: 3 });
    expect(gateSlots('74LS21')[1]).toEqual({ inputs: [9, 10, 12, 13], output: 8 });
    expect(gateSlots('74LS02')[0].output).toBe(1);
    expect(gateSlots('74LS04')).toHaveLength(6);
  });
});

describe('convertProblem', () => {
  it('accepts figure 2-5 and explains why other diagrams cannot be converted', () => {
    expect(convertProblem(majorityDiagram())).toBeNull();
    expect(convertProblem(emptyDiagram())).toBe('邏輯圖要有輸入端和輸出端才能轉');
    let open = emptyDiagram();
    open = must(addNode(open, 'INPUT', 0, 0));
    open = must(addNode(open, 'AND', 4, 0));
    open = must(addNode(open, 'OUTPUT', 10, 1));
    open = must(connect(open, 'g1', { node: 'o1', pin: 0 }));
    expect(convertProblem(open)).toBe('還有沒接好的腳（到「檢查」分頁看是哪些），請先接好');
    let loop = emptyDiagram();
    loop = must(addNode(loop, 'INPUT', 0, 0));
    loop = must(addNode(loop, 'OR', 4, 0));
    loop = must(addNode(loop, 'OR', 12, 0));
    loop = must(addNode(loop, 'OUTPUT', 20, 1));
    loop = must(connect(loop, 'i1', { node: 'g1', pin: 0 }));
    loop = must(connect(loop, 'g2', { node: 'g1', pin: 1 }));
    loop = must(connect(loop, 'g1', { node: 'g2', pin: 0 }));
    loop = must(connect(loop, 'i1', { node: 'g2', pin: 1 }));
    loop = must(connect(loop, 'g2', { node: 'o1', pin: 0 }));
    expect(convertProblem(loop)).toBe('邏輯圖有迴圈，不能轉成麵包板');
    let many = emptyDiagram();
    for (let i = 0; i < 9; i++) many = must(addNode(many, 'INPUT', 0, i * 2));
    many = must(addNode(many, 'OUTPUT', 10, 0));
    many = must(connect(many, 'i1', { node: 'o1', pin: 0 }));
    expect(convertProblem(many)).toBe('輸入端最多 8 個（指撥開關最多 8 位元）');
  });
});
