import { describe, expect, it } from 'vitest';
import { analyzeCircuit } from '../../src/editor/analysis';
import { addNode, connect } from '../../src/logic/edit';
import { bcdDiagram } from '../../src/logic/examples';
import { convertProblem } from '../../src/logic/synth';
import { toBreadboard, type ConvertResult } from '../../src/logic/toBreadboard';
import { emptyDiagram, type LogicDiagram } from '../../src/logic/types';
import { powerProblems } from '../fixtures/powerChecks';

const must = (r: { ok: boolean; diagram: LogicDiagram }) => {
  if (!r.ok) throw new Error('bad edit');
  return r.diagram;
};
const ok = (r: ConvertResult) => {
  if (!r.ok) throw new Error(r.reason);
  return r;
};

/** 每個實際的 Net 只含一個預定的訊號，每個訊號的腳都在同一個 Net。 */
function wiredAsPlanned(r: Extract<ConvertResult, { ok: true }>) {
  const nets = analyzeCircuit(r.circuit).nets;
  const signalsOf = nets.map((n) => new Set(n.pins.map((p) => r.netOf[`${p.componentId}#${p.pinNumber}`]).filter(Boolean)));
  const merged = signalsOf.filter((s) => s.size > 1);
  // 子專案 34：5V / GND 每條軌各自有符號，本來就會分成好幾塊；改用 powerProblems 檢查電源的接法。
  const split = Object.values(r.netOf)
    .filter((sig, i, all) => all.indexOf(sig) === i)
    .filter((sig) => sig !== 'VCC' && sig !== 'GND' && signalsOf.filter((s) => s.has(sig)).length > 1);
  return { merged: merged.map((s) => [...s]), split: [...split, ...powerProblems(r.circuit)] };
}

/** 74LS47 的腳號（依腳名）。 */
const LS47 = { A: 7, B: 1, C: 2, D: 6, LT: 3, BI: 4, RBI: 5, a: 13, b: 12, c: 11, d: 10, e: 9, f: 15, g: 14 };
/** 7seg-ca 的腳號。 */
const SEG = { a: 7, b: 6, c: 4, d: 2, e: 1, f: 9, g: 10, CA: [3, 8] };

describe('converting a 7-segment display', () => {
  it('uses a 74LS47, a common-anode display and 7 resistors', () => {
    const r = ok(toBreadboard(bcdDiagram(), { switchTo: 'vcc', board: 'auto' }));
    expect(r.bom).toMatchObject({ ics: { '74LS47': 1 }, displays: 1, resistors: 7, leds: 0, layout: 'EIC1106' });
    expect(r.displays).toEqual({ d1: 'DS1' });
    const u = r.circuit.components.find((c) => c.defId === '74LS47')!;
    const ds = r.circuit.components.find((c) => c.id === 'DS1')!;
    expect(ds.defId).toBe('7seg-ca');
    expect(ds.props.labels).toEqual(['S1']);
    const net = (pin: string) => r.netOf[pin];
    // W（i1）是最高位元 → D；Z（i4）→ A
    expect([LS47.A, LS47.B, LS47.C, LS47.D].map((p) => net(`${u.id}#${p}`))).toEqual(['i4', 'i3', 'i2', 'i1']);
    expect([LS47.LT, LS47.BI, LS47.RBI, 16].map((p) => net(`${u.id}#${p}`))).toEqual(['VCC', 'VCC', 'VCC', 'VCC']);
    expect(SEG.CA.map((p) => net(`DS1#${p}`))).toEqual(['VCC', 'VCC']);
    for (const s of ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const) {
      const out = net(`${u.id}#${LS47[s]}`);
      const into = net(`DS1#${SEG[s]}`);
      const resistor = r.circuit.components.find((c) => c.defId === 'resistor' && net(`${c.id}#1`) === out && net(`${c.id}#2`) === into);
      expect(resistor?.props.resistance, s).toBe(220);
      expect(out).not.toBe(into);
    }
    expect(wiredAsPlanned(r)).toEqual({ merged: [], split: [] });
  });

  it('allows two displays with distinct parts, but not four', () => {
    let d = emptyDiagram();
    d = must(addNode(d, 'INPUT', 0, 0));
    for (let k = 0; k < 4; k++) d = must(addNode(d, 'DISPLAY', 6 + k * 6, 0));
    for (let k = 1; k <= 4; k++) for (let p = 0; p < 4; p++) d = must(connect(d, 'i1', { node: `d${k}`, pin: p }));
    // 子專案 49：最多 3 個（共用電阻、兩塊 EIC-1106）。
    expect(convertProblem(d)).toBe('7 段顯示器最多 3 個（零件太多，佈線接不完）');
    d = { ...d, nodes: d.nodes.filter((n) => n.id !== 'd4'), wires: d.wires.filter((w) => w.to.node !== 'd4') };
    const two = { ...d, nodes: d.nodes.filter((n) => n.id !== 'd3'), wires: d.wires.filter((w) => w.to.node !== 'd3') };
    const r = ok(toBreadboard(two, { switchTo: 'gnd', board: 'auto' }));
    const ids = r.circuit.components.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(r.displays).toEqual({ d1: 'DS1', d2: 'DS2' });
    expect(r.bom.ics['74LS47']).toBe(2);
    expect(wiredAsPlanned(r)).toEqual({ merged: [], split: [] });
  });

  it('keeps signals that drive a display in NAND-only mode', () => {
    let d = emptyDiagram();
    d = must(addNode(d, 'INPUT', 0, 0)); // i1 A
    d = must(addNode(d, 'NOT', 4, 0)); // g1
    d = must(addNode(d, 'DISPLAY', 10, 0)); // d1
    d = must(connect(d, 'i1', { node: 'g1', pin: 0 }));
    d = must(connect(d, 'g1', { node: 'd1', pin: 0 }));
    for (let p = 1; p < 4; p++) d = must(connect(d, 'i1', { node: 'd1', pin: p }));
    const r = ok(toBreadboard(d, { switchTo: 'vcc', board: 'auto', gates: 'nand' }));
    const u = r.circuit.components.find((c) => c.defId === '74LS47')!;
    expect(r.netOf[`${u.id}#${LS47.A}`]).toBe('g1');
    expect(Object.entries(r.netOf).some(([pin, sig]) => pin.startsWith('U1#') && sig === 'g1')).toBe(true);
  });
});

describe('common-cathode displays when converting (sub-project 32)', () => {
  it('uses a 74LS48 and a common-cathode display and still shows every digit, before and after routing', async () => {
    const { checkAgainstDiagram } = await import('../../src/logic/diagramCheck');
    const { autoPlaceAndRoute } = await import('../../src/core/icPlacement/autoPlace');
    const { applyRouting } = await import('../../src/core/routing/apply');
    const r = ok(toBreadboard(bcdDiagram(), { switchTo: 'vcc', board: 'auto', display: 'cc' }));
    expect(r.bom.ics).toEqual({ '74LS48': 1 });
    expect(r.circuit.components.find((c) => c.id === 'DS1')!.defId).toBe('7seg-cc');
    expect(SEG.CA.map((p) => r.netOf[`DS1#${p}`])).toEqual(['GND', 'GND']);
    expect(checkAgainstDiagram(bcdDiagram(), r.circuit)).toMatchObject({ kind: 'done', result: { rows: 16, mismatches: [] } });
    const routed = autoPlaceAndRoute(r.circuit);
    expect(routed.status).toBe('success');
    expect(checkAgainstDiagram(bcdDiagram(), applyRouting(r.circuit, routed))).toMatchObject({ kind: 'done', result: { rows: 16, mismatches: [] } });
  }, 60_000);
});

describe('decimal points and per-segment displays when converting (sub-project 32)', () => {
  /** BCD 範例再加一個輸入端 P 接到 DP。 */
  const withDp = () => {
    let d = bcdDiagram();
    d = must(addNode(d, 'INPUT', 0, 12));
    const p = d.nodes.at(-1)!.id;
    const named = { ...d, nodes: d.nodes.map((n) => (n.id === p ? { ...n, name: 'P' } : n)) };
    return must(connect(named, p, { node: 'd1', pin: 4 }));
  };
  /** 兩個輸入：A 接 b、c 段（「1」），B 接 a、dp 段。 */
  const segments = async () => {
    const { setDisplayMode } = await import('../../src/logic/edit');
    let d = emptyDiagram();
    d = must(addNode(d, 'INPUT', 0, 0));
    d = must(addNode(d, 'INPUT', 0, 4));
    d = must(addNode(d, 'DISPLAY', 10, 0));
    d = must(setDisplayMode(d, 'd1', true));
    for (const [from, pin] of [['i1', 1], ['i1', 2], ['i2', 0], ['i2', 7]] as const) d = must(connect(d, from, { node: 'd1', pin }));
    return d;
  };

  it.each(['ca', 'cc'] as const)('lights the decimal point from DP (%s)', async (display) => {
    const { checkAgainstDiagram } = await import('../../src/logic/diagramCheck');
    const r = ok(toBreadboard(withDp(), { switchTo: 'vcc', board: 'auto', display }));
    // 共陽極時 DP 先經過一個反相器（74LS04）。
    expect(Object.keys(r.bom.ics).sort()).toEqual(display === 'ca' ? ['74LS04', '74LS47'] : ['74LS48']);
    expect(checkAgainstDiagram(withDp(), r.circuit)).toMatchObject({ kind: 'done', result: { rows: 32, mismatches: [] } });
  });

  it.each(['ca', 'cc'] as const)('drives each segment directly without a decoder (%s)', async (display) => {
    const { checkAgainstDiagram } = await import('../../src/logic/diagramCheck');
    const d = await segments();
    const r = ok(toBreadboard(d, { switchTo: 'vcc', board: 'auto', display }));
    expect(Object.keys(r.bom.ics)).toEqual(display === 'ca' ? ['74LS04'] : []);
    expect(r.circuit.components.filter((c) => c.defId === 'resistor')).toHaveLength(4);
    expect(checkAgainstDiagram(d, r.circuit)).toMatchObject({ kind: 'done', result: { rows: 4, mismatches: [] } });
  });
});
