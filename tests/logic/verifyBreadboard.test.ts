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
    expect(result.mismatches[0]).toEqual({ inputs: '011', expected: ['1'], actual: ['0'] });
  });

  it('describes the result in plain words', () => {
    expect(verifyText({ rows: 8, mismatches: [] }, ['X'])).toBe('8 種輸入組合，麵包板的模擬結果和真值表全部一致');
    expect(verifyText({ rows: 8, mismatches: [{ inputs: '011', expected: ['1'], actual: ['0'] }] }, ['X'])).toBe('有 1 列不一致：輸入 011 應該是 X = 1，麵包板是 X = 0');
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

describe('7-segment displays', () => {
  it('reads the digit off the display for all 16 rows, before and after routing', async () => {
    const { bcdDiagram } = await import('../../src/logic/examples');
    const r = toBreadboard(bcdDiagram(), { switchTo: 'vcc', board: 'auto' });
    if (!r.ok) throw new Error(r.reason);
    expect(verifyBreadboard(bcdDiagram(), r.circuit, 'vcc', r)).toEqual({ rows: 16, mismatches: [] });
    const routed = autoPlaceAndRoute(r.circuit);
    expect(routed.status).toBe('success');
    expect(verifyBreadboard(bcdDiagram(), applyRouting(r.circuit, routed), 'vcc', r)).toEqual({ rows: 16, mismatches: [] });
  }, 60_000);

  it('finds the digits that change when segment a is not connected', async () => {
    const { bcdDiagram } = await import('../../src/logic/examples');
    const r = toBreadboard(bcdDiagram(), { switchTo: 'gnd', board: 'auto' });
    if (!r.ok) throw new Error(r.reason);
    const ra = Object.keys(r.netOf).find((pin) => r.netOf[pin] === 'DS1:a' && pin.startsWith('R'))!.split('#')[0];
    const broken = { ...r.circuit, components: r.circuit.components.filter((c) => c.id !== ra) };
    const result = verifyBreadboard(bcdDiagram(), broken, 'gnd', r);
    expect(result.mismatches.map((m) => parseInt(m.inputs, 2))).toEqual([0, 2, 3, 5, 7, 8, 9, 13]);
    expect(result.mismatches.find((m) => m.inputs === '0111')).toEqual({ inputs: '0111', expected: ['7'], actual: ['1'] });
    expect(verifyText(result, ['S1'])).toContain('輸入 0111 應該是 S1 = 7，麵包板是 S1 = 1');
  });
});

describe('verifyRows with switches on several DIP switches', () => {
  it('sets each bound switch by its own polarity and leaves the other switches as they are', async () => {
    const { verifyRows } = await import('../../src/logic/verifyBreadboard');
    const { handWired, gateDiagram } = await import('../fixtures/handWired');
    const d = gateDiagram('AND');
    const bindings = {
      inputs: [
        { node: 'i1', switchId: 'SW1', index: 0, onIs: 1 as const },
        { node: 'i2', switchId: 'SW2', index: 2, onIs: 1 as const },
      ],
      leds: { o1: 'D1' },
      displays: {},
    };
    // 致能開關（SW1 第 2 個）撥 ON：和 AND 的真值表全部一致。
    expect(verifyRows(d, handWired({}), bindings)).toEqual({ rows: 4, mismatches: [] });
    // 致能開關撥 OFF（沒有對應到，維持原狀）：LED 永遠不亮，A = B = 1 那一列不一致。
    expect(verifyRows(d, handWired({ sw1: [false, false, false, false] }), bindings)).toEqual({
      rows: 4,
      mismatches: [{ inputs: '11', expected: ['1'], actual: ['0'] }],
    });
    // 開關改接 GND（撥 ON = 0）：onIs = 0 時也一致。
    const low = { ...bindings, inputs: bindings.inputs.map((b) => ({ ...b, onIs: 0 as const })) };
    expect(verifyRows(d, handWired({ toGnd: true }), low)).toEqual({ rows: 4, mismatches: [] });
  });
});
