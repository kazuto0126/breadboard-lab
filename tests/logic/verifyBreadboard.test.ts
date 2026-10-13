import { describe, expect, it } from 'vitest';
import { autoPlaceAndRoute } from '../../src/core/icPlacement/autoPlace';
import { applyRouting } from '../../src/core/routing/apply';
import { majorityDiagram } from '../../src/logic/examples';
import { toBreadboard } from '../../src/logic/toBreadboard';
import { verifyBreadboard, verifyText } from '../../src/logic/verifyBreadboard';

function convert(switchTo: 'vcc' | 'gnd') {
  const r = toBreadboard(majorityDiagram(), { switchTo, board: 'auto' });
  if (!r.ok) throw new Error(r.reason);
  return r;
}

describe('verifyBreadboard', () => {
  it.each(['vcc', 'gnd'] as const)('matches the truth table of figure 2-5 with switches to %s, before and after routing', (switchTo) => {
    const r = convert(switchTo);
    expect(verifyBreadboard(majorityDiagram(), r.circuit, switchTo, r)).toEqual({ rows: 8, mismatches: [] });
    const routed = autoPlaceAndRoute(r.circuit);
    expect(routed.status).toBe('success');
    expect(verifyBreadboard(majorityDiagram(), applyRouting(r.circuit, routed), switchTo, r)).toEqual({ rows: 8, mismatches: [] });
  });

  it('reports rows that differ when the LED is put in backwards', () => {
    const r = convert('vcc');
    const flipped = { ...r.circuit, components: r.circuit.components.map((c) => (c.id === 'D1' ? { ...c, rotation: 180 as const, anchor: { ...c.anchor, x: c.anchor.x + 1 } } : c)) };
    const result = verifyBreadboard(majorityDiagram(), flipped, 'vcc', r);
    expect(result.rows).toBe(8);
    expect(result.mismatches.map((m) => m.inputs)).toEqual(['011', '101', '110', '111']);
    expect(result.mismatches[0]).toEqual({ inputs: '011', expected: '1', actual: '0' });
  });

  it('describes the result in plain words', () => {
    expect(verifyText({ rows: 8, mismatches: [] }, ['X'])).toBe('8 種輸入組合，麵包板的模擬結果和真值表全部一致');
    expect(verifyText({ rows: 8, mismatches: [{ inputs: '011', expected: '1', actual: '0' }] }, ['X'])).toBe('有 1 列不一致：輸入 011 應該是 X = 1，麵包板是 X = 0');
  });
});

describe('NAND-only conversion and labels', () => {
  it.each(['vcc', 'gnd'] as const)('uses only 74LS00 and still matches the truth table (switches to %s)', (switchTo) => {
    // MB-102 上只用 NAND 的線排不完（store 會自動改用 EIC-1106），這裡直接用 EIC-1106。
    const r = toBreadboard(majorityDiagram(), { switchTo, board: 'EIC1106', gates: 'nand' });
    if (!r.ok) throw new Error(r.reason);
    expect(Object.keys(r.bom.ics)).toEqual(['74LS00']);
    expect(verifyBreadboard(majorityDiagram(), r.circuit, switchTo, r)).toEqual({ rows: 8, mismatches: [] });
    const routed = autoPlaceAndRoute(r.circuit);
    expect(routed.status).toBe('success');
    expect(verifyBreadboard(majorityDiagram(), applyRouting(r.circuit, routed), switchTo, r)).toEqual({ rows: 8, mismatches: [] });
  });

  it('names the switches and the LED after the diagram', () => {
    const r = convert('vcc');
    expect(r.circuit.components.find((c) => c.id === 'SW1')!.props.labels).toEqual(['A', 'B', 'C', '']);
    expect(r.circuit.components.find((c) => c.id === 'D1')!.props.labels).toEqual(['X']);
  });
});
