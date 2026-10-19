import { describe, expect, it } from 'vitest';
import { addNode, connect, setInputCount } from '../../src/logic/edit';
import { sortedIo, truthTable } from '../../src/logic/evaluate';
import { majorityDiagram } from '../../src/logic/examples';
import { parseLogicDiagram } from '../../src/logic/file';
import { toNandUnits, toNorUnits } from '../../src/logic/nandOnly';
import { assignIcs, convertProblem, decompose, evaluateUnits, gateSlots, type Unit } from '../../src/logic/synth';
import { emptyDiagram, type GateKind, type LogicDiagram } from '../../src/logic/types';
import { encoder } from '../fixtures/labCircuits';

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

/** 子專案 38：輸入端 A、B、C、D（i1–i4），閘與輸出端依序排好（不重疊）。gates：[種類, 輸入數, 接的訊號]。 */
function diagramOf(gates: Array<[GateKind, number, string[]]>): LogicDiagram {
  const nodes = [
    ...['A', 'B', 'C', 'D'].map((name, k) => ({ id: `i${k + 1}`, kind: 'INPUT', x: 0, y: k * 3, name })),
    ...gates.map(([kind, inputs], k) => ({ id: `g${k + 1}`, kind, x: 10, y: k * 6, inputs })),
    ...gates.map((_, k) => ({ id: `o${k + 1}`, kind: 'OUTPUT', x: 20, y: k * 6, name: `X${k + 1}` })),
  ];
  const wires = gates.flatMap(([, , from], k) => [
    ...from.map((f, pin) => ({ id: `w${k}-${pin}`, from: f, to: { node: `g${k + 1}`, pin } })),
    { id: `w${k}-out`, from: `g${k + 1}`, to: { node: `o${k + 1}`, pin: 0 } },
  ]);
  const r = parseLogicDiagram({ version: 1, nodes, wires });
  if (!r.ok) throw new Error(r.error);
  return r.diagram;
}

/** 拆開後的單元算出來的每個輸出都和真值表一樣。 */
function unitsMatchTable(d: LogicDiagram, units: Unit[]): boolean {
  const t = truthTable(d);
  if (!t.ok) throw new Error('no table');
  const { inputs, outputs } = sortedIo(d);
  const source = outputs.map((o) => d.wires.find((w) => w.to.node === o.id)!.from);
  return t.rows.every((r) => {
    const v = evaluateUnits(units, Object.fromEntries(inputs.map((n, i) => [n.id, r.in[i]])));
    return source.every((s, k) => v[s] === r.out[k]);
  });
}

describe('sharing 2-input ORs when splitting gates (sub-project 38)', () => {
  it('shares the pair two 4-input ORs both need, so the 8-to-3 encoder fits two 74LS32', () => {
    const d = encoder();
    const units = decompose(d);
    expect(units.map((u) => u.kind)).toEqual(Array(8).fill('OR2'));
    expect(assignIcs(units).map((p) => p.defId)).toEqual(['74LS32', '74LS32']);
    expect(unitsMatchTable(d, units)).toBe(true);
  });

  it('reuses a 2-input OR that already is the shared pair', () => {
    const d = diagramOf([['OR', 2, ['i1', 'i2']], ['OR', 3, ['i1', 'i2', 'i3']]]);
    const units = decompose(d);
    expect(units).toHaveLength(2);
    expect(units).toContainEqual({ kind: 'OR2', inputs: ['i1', 'i2'], output: 'g1' });
    expect(units).toContainEqual({ kind: 'OR2', inputs: ['g1', 'i3'], output: 'g2' });
    expect(unitsMatchTable(d, units)).toBe(true);
  });

  it('shares a pair between a 3-input NOR and a 3-input OR', () => {
    const d = diagramOf([['NOR', 3, ['i1', 'i2', 'i3']], ['OR', 3, ['i1', 'i2', 'i4']]]);
    const units = decompose(d);
    expect(units.map((u) => u.kind).sort()).toEqual(['NOR2', 'OR2', 'OR2']);
    expect(unitsMatchTable(d, units)).toBe(true);
  });

  it('keeps two identical 2-input ORs as they are', () => {
    const d = diagramOf([['OR', 2, ['i1', 'i2']], ['OR', 2, ['i1', 'i2']]]);
    expect(decompose(d)).toEqual([
      { kind: 'OR2', inputs: ['i1', 'i2'], output: 'g1' },
      { kind: 'OR2', inputs: ['i1', 'i2'], output: 'g2' },
    ]);
  });

  it('still works when everything is turned into NAND or NOR gates', () => {
    const d = encoder();
    const keep = ['gx', 'gy', 'gz'];
    expect(unitsMatchTable(d, toNandUnits(decompose(d), keep))).toBe(true);
    expect(unitsMatchTable(d, toNorUnits(decompose(d), keep))).toBe(true);
  });
});
