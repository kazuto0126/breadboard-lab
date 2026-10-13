import { describe, expect, it } from 'vitest';
import { validateCircuit } from '../../src/core/circuit/validate';
import { analyzeCircuit } from '../../src/editor/analysis';
import { addNode, connect } from '../../src/logic/edit';
import { majorityDiagram } from '../../src/logic/examples';
import { toBreadboard, type ConvertResult } from '../../src/logic/toBreadboard';
import { emptyDiagram, type LogicDiagram } from '../../src/logic/types';

const must = (r: { ok: boolean; diagram: LogicDiagram }) => {
  if (!r.ok) throw new Error('bad edit');
  return r.diagram;
};
const ok = (r: ConvertResult) => {
  if (!r.ok) throw new Error(r.reason);
  return r;
};

/** 每個實際的 Net 只含一個預定的訊號，每個訊號的腳都在同一個 Net（沒有短路，也沒有漏接）。 */
function wiredAsPlanned(r: Extract<ConvertResult, { ok: true }>) {
  const nets = analyzeCircuit(r.circuit).nets;
  const signalsOf = nets.map((n) => new Set(n.pins.map((p) => r.netOf[`${p.componentId}#${p.pinNumber}`]).filter(Boolean)));
  const merged = signalsOf.filter((s) => s.size > 1);
  const split = Object.values(r.netOf).filter((sig, i, all) => all.indexOf(sig) === i).filter((sig) => signalsOf.filter((s) => s.has(sig)).length > 1);
  return { merged: merged.map((s) => [...s]), split };
}

/** n 個 2 輸入 AND 串成一串：i1 & i2 → g1，g1 & i2 → g2…，最後接到輸出端。 */
function andChain(n: number): LogicDiagram {
  let d = emptyDiagram();
  d = must(addNode(d, 'INPUT', 0, 0));
  d = must(addNode(d, 'INPUT', 0, 2));
  for (let i = 0; i < n; i++) d = must(addNode(d, 'AND', 6 + i * 6, 0));
  d = must(addNode(d, 'OUTPUT', 6 + n * 6 + 2, 1));
  d = must(connect(d, 'i1', { node: 'g1', pin: 0 }));
  for (let i = 1; i <= n; i++) {
    if (i > 1) d = must(connect(d, `g${i - 1}`, { node: `g${i}`, pin: 0 }));
    d = must(connect(d, 'i2', { node: `g${i}`, pin: 1 }));
  }
  return must(connect(d, `g${n}`, { node: 'o1', pin: 0 }));
}

describe('toBreadboard', () => {
  it.each(['vcc', 'gnd'] as const)('builds figure 2-5 with switches to %s', (switchTo) => {
    const r = ok(toBreadboard(majorityDiagram(), { switchTo, board: 'auto' }));
    const parts = r.circuit.components.map((c) => [c.id, c.defId, c.props.resistance ?? null]);
    const pull = switchTo === 'vcc' ? 330 : 1000;
    expect(parts).toEqual([
      ['SW1', 'dipsw-4', null],
      ['U1', '74LS08', null],
      ['U2', '74LS32', null],
      ['R1', 'resistor', pull],
      ['R2', 'resistor', pull],
      ['R3', 'resistor', pull],
      ['R4', 'resistor', 220],
      ['D1', 'led', null],
      ['V1', 'vcc', null],
      ['G1', 'gnd', null],
    ]);
    expect(r.bom).toEqual({ ics: { '74LS08': 1, '74LS32': 1 }, switch: 'dipsw-4', resistors: 4, leds: 1, layout: 'MB102' });
    expect(r.inputs).toEqual(['i1', 'i2', 'i3']);
    expect(r.leds).toEqual({ o1: 'D1' });
    expect(validateCircuit(r.circuit).filter((e) => e.severity === 'error' && !e.code.startsWith('WIRE'))).toEqual([]);
    expect(wiredAsPlanned(r)).toEqual({ merged: [], split: [] });
  });

  it('uses the 8-way switch for more than four inputs', () => {
    let d = emptyDiagram();
    for (let i = 0; i < 5; i++) d = must(addNode(d, 'INPUT', 0, i * 2));
    d = must(addNode(d, 'OUTPUT', 10, 0));
    d = must(connect(d, 'i1', { node: 'o1', pin: 0 }));
    const r = ok(toBreadboard(d, { switchTo: 'vcc', board: 'auto' }));
    expect(r.bom.switch).toBe('dipsw-8');
    expect(wiredAsPlanned(r)).toEqual({ merged: [], split: [] });
  });

  it('moves to the EIC-1106 when the parts do not fit an MB-102', () => {
    const d = andChain(24);
    const r = ok(toBreadboard(d, { switchTo: 'vcc', board: 'auto' }));
    expect(r.bom.layout).toBe('EIC1106');
    expect(r.bom.ics).toEqual({ '74LS08': 6 });
    expect(validateCircuit(r.circuit).filter((e) => e.severity === 'error' && !e.code.startsWith('WIRE'))).toEqual([]);
    expect(wiredAsPlanned(r)).toEqual({ merged: [], split: [] });
    expect(toBreadboard(d, { switchTo: 'vcc', board: 'MB102' })).toEqual({ ok: false, reason: 'MB-102 放不下，請改用 EIC-1106' });
    expect(toBreadboard(andChain(60), { switchTo: 'vcc', board: 'auto' })).toMatchObject({ ok: false, reason: expect.stringContaining('EIC-1106 放不下') });
  });

  it('refuses diagrams that cannot be converted', () => {
    expect(toBreadboard(emptyDiagram(), { switchTo: 'vcc', board: 'auto' })).toEqual({ ok: false, reason: '邏輯圖要有輸入端和輸出端才能轉' });
  });
});
