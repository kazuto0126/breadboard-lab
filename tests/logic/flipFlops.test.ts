import { describe, expect, it } from 'vitest';
import { BLOCK_PINS } from '../../src/logic/blocks';
import { sequenceTable } from '../../src/logic/evaluate';
import { syncCounterDiagram } from '../../src/logic/examples';
import { packFlipFlops } from '../../src/logic/flipFlops';
import { toBreadboard } from '../../src/logic/toBreadboard';
import type { BlockChip, LogicDiagram, LogicNode, LogicWire } from '../../src/logic/types';

/** 子專案 51（規格 2026-10-25 single-flip-flops）：單顆 D / JK 正反器。 */
let wid = 0;
const pin = (chip: BlockChip, name: string) => BLOCK_PINS[chip].inputs.indexOf(name);
const out = (chip: BlockChip, name: string) => BLOCK_PINS[chip].outputs.indexOf(name);
const w = (from: string, node: string, p = 0, fromPin?: number): LogicWire => ({ id: `w${++wid}`, from, ...(fromPin ? { fromPin } : {}), to: { node, pin: p } });
const clock: LogicNode = { id: 'clk', kind: 'CLOCK', x: 0, y: 0, name: 'CLK' };
const ff = (id: string, chip: BlockChip, y = 0): LogicNode => ({ id, kind: 'BLOCK', x: 4, y, chip });
const output = (id: string): LogicNode => ({ id, kind: 'OUTPUT', x: 12, y: 0, name: id });
const diagram = (nodes: LogicNode[], wires: LogicWire[]): LogicDiagram => ({ version: 1, nodes, wires });
const column = (d: LogicDiagram, n: number, k = 0) => {
  const t = sequenceTable(d, n);
  if (!t.ok) throw new Error(t.reason);
  return t.rows.map((r) => r.out[k]).join('');
};

/** D 接 /Q：每個脈衝翻轉。 */
const toggleD = (id = 'u', y = 0, q = 'Q') => ({
  nodes: [ff(id, 'DFF', y), output(q)],
  wires: [w('clk', id, pin('DFF', 'CLK')), w(id, id, pin('DFF', 'D'), out('DFF', '/Q')), w(id, q, 0, out('DFF', 'Q'))],
});

describe('single flip-flops', () => {
  it('a D flip-flop with D tied to /Q toggles on every pulse', () => {
    const t = toggleD();
    expect(column(diagram([clock, ...t.nodes], t.wires), 4)).toBe('01010');
  });

  it('/CLR held at 0 keeps Q at 0', () => {
    const t = toggleD();
    const low: LogicNode = { id: 'k0', kind: 'LOW', x: 0, y: 4 };
    expect(column(diagram([clock, low, ...t.nodes], [...t.wires, w('k0', 'u', pin('DFF', '/CLR'))]), 4)).toBe('00000');
  });

  it('a JK flip-flop with J = K = 1 toggles on every pulse', () => {
    const high: LogicNode = { id: 'k1', kind: 'HIGH', x: 0, y: 4 };
    const d = diagram([clock, high, ff('u', 'JKFF'), output('Q')], [w('clk', 'u', pin('JKFF', 'CLK')), w('k1', 'u', pin('JKFF', 'J')), w('k1', 'u', pin('JKFF', 'K')), w('u', 'Q', 0, out('JKFF', 'Q'))]);
    expect(column(d, 4)).toBe('01010');
  });
});

describe('packFlipFlops', () => {
  it('puts every two D flip-flops in one 74LS74 and keeps the sequence table', () => {
    // 三顆各自翻轉的 D 正反器（Q 接 Qa、Qb、Qc）；第三顆的時脈接第一顆的 Q（數得比較慢）。
    const a = toggleD('a', 0, 'Qa');
    const b = toggleD('b', 6, 'Qb');
    const c = toggleD('c', 12, 'Qc');
    c.wires[0] = w('a', 'c', pin('DFF', 'CLK'), out('DFF', '/Q'));
    const d = diagram([clock, ...a.nodes, ...b.nodes, ...c.nodes], [...a.wires, ...b.wires, ...c.wires]);
    const packed = packFlipFlops(d);
    const chips = packed.nodes.filter((n) => n.kind === 'BLOCK');
    expect(chips.map((n) => n.chip)).toEqual(['74LS74', '74LS74']);
    // b 用第一片的第 2 組。
    expect(packed.wires.find((x) => x.to.node === 'Qb')).toMatchObject({ from: 'a', fromPin: out('74LS74', '2Q') });
    expect(packed.wires.some((x) => x.to.node === 'a' && x.to.pin === pin('74LS74', '2D') && x.from === 'a' && x.fromPin === out('74LS74', '2/Q'))).toBe(true);
    const all = (x: LogicDiagram) => {
      const t = sequenceTable(x, 8);
      if (!t.ok) throw new Error(t.reason);
      return t.rows.map((r) => r.out.join(''));
    };
    expect(all(packed)).toEqual(all(d));
    expect(all(d).slice(0, 5)).toEqual(['000', '110', '001', '111', '000']);
  });

  it('leaves diagrams without single flip-flops alone', () => {
    const d = diagram([clock, ff('u', '74LS74')], []);
    expect(packFlipFlops(d)).toBe(d);
  });
});

describe('the synchronous counter example', () => {
  it('counts 0 1 2 3 and converts to one 74LS74 and one 74LS86', () => {
    const d = syncCounterDiagram();
    const t = sequenceTable(d, 4);
    if (!t.ok) throw new Error(t.reason);
    expect(t.outputs).toEqual(['Q0', 'Q1']);
    expect(t.rows.map((r) => `${r.out[1]}${r.out[0]}`)).toEqual(['00', '01', '10', '11', '00']);
    const r = toBreadboard(d, { switchTo: 'vcc', board: 'auto' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.bom.ics).toMatchObject({ '74LS74': 1, '74LS86': 1 });
  });
});
