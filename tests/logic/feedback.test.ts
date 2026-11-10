import { describe, expect, it } from 'vitest';
import { applyRouting } from '../../src/core/routing/apply';
import { BLOCK_PINS } from '../../src/logic/blocks';
import { convertAndRoute } from '../../src/logic/convertRoute';
import { checkAgainstDiagram } from '../../src/logic/diagramCheck';
import { switchText, toBreadboard } from '../../src/logic/toBreadboard';
import type { LogicDiagram, LogicNode } from '../../src/logic/types';

/** 子專案 59：有迴授的電路與超過 8 個輸入也能轉成麵包板。 */
const node = (id: string, kind: LogicNode['kind'], extra: Partial<LogicNode> = {}): LogicNode => ({ id, kind, x: 0, y: 0, ...extra });
const wire = (id: string, from: string, to: string, pin: number, fromPin?: number) => ({ id, from, to: { node: to, pin }, ...(fromPin ? { fromPin } : {}) });

/** 課本圖 10-14：閘控 SR 閂鎖（4 顆 NAND）。 */
function gatedSr(): LogicDiagram {
  return {
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
  };
}

/** 課本圖 9-5：74LS151 的 8 選 1，11 個輸入（I0–I7、S0–S2）。 */
function mux151(): LogicDiagram {
  const pin = (name: string) => BLOCK_PINS['74LS151'].inputs.indexOf(name);
  const names = ['I0', 'I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'S0', 'S1', 'S2'];
  return {
    version: 1,
    nodes: [...names.map((name) => node(name, 'INPUT', { name })), node('k', 'LOW'), node('b', 'BLOCK', { chip: '74LS151' }), node('y', 'OUTPUT', { name: 'Y' })],
    wires: [
      ...names.slice(0, 8).map((name, k) => wire(`d${k}`, name, 'b', pin(`D${k}`))),
      wire('a', 'S0', 'b', pin('A')), wire('bb', 'S1', 'b', pin('B')), wire('c', 'S2', 'b', pin('C')), wire('g', 'k', 'b', pin('/G')),
      wire('o', 'b', 'y', 0),
    ],
  };
}

describe('feedback and more inputs (sub-project 59)', () => {
  it('puts 11 inputs on an 8-bit and a 4-bit switch in name order', () => {
    const r = toBreadboard(mux151(), { switchTo: 'vcc', board: 'auto' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.bom.switchList).toEqual(['dipsw-8', 'dipsw-4']);
    expect(switchText(r.bom)).toBe('8 位元指撥開關 × 1、4 位元指撥開關 × 1');
    const labels = (id: string) => r.circuit.components.find((c) => c.id === id)?.props.labels;
    expect(labels('SW1')).toEqual(['I0', 'I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7']);
    expect(labels('SW2')).toEqual(['S0', 'S1', 'S2', '']);
  });

  it('converts the gated SR latch and the breadboard matches every row that does not hold', () => {
    const d = gatedSr();
    const r = convertAndRoute(d, { switchTo: 'vcc', board: 'MB102' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.routed.status).toBe('success');
    const check = checkAgainstDiagram(d, applyRouting(r.result.circuit, r.routed));
    expect(check).toMatchObject({ kind: 'done', result: { rows: 8, mismatches: [] } });
  }, 120_000);
});
