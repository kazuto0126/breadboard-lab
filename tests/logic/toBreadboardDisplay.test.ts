import { describe, expect, it } from 'vitest';
import { analyzeCircuit } from '../../src/editor/analysis';
import { addNode, connect } from '../../src/logic/edit';
import { bcdDiagram } from '../../src/logic/examples';
import { convertProblem } from '../../src/logic/synth';
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

/** 每個實際的 Net 只含一個預定的訊號，每個訊號的腳都在同一個 Net。 */
function wiredAsPlanned(r: Extract<ConvertResult, { ok: true }>) {
  const nets = analyzeCircuit(r.circuit).nets;
  const signalsOf = nets.map((n) => new Set(n.pins.map((p) => r.netOf[`${p.componentId}#${p.pinNumber}`]).filter(Boolean)));
  const merged = signalsOf.filter((s) => s.size > 1);
  const split = Object.values(r.netOf).filter((sig, i, all) => all.indexOf(sig) === i).filter((sig) => signalsOf.filter((s) => s.has(sig)).length > 1);
  return { merged: merged.map((s) => [...s]), split };
}

/** 74LS47 的腳號（依腳名）。 */
const LS47 = { A: 7, B: 1, C: 2, D: 6, LT: 3, BI: 4, RBI: 5, a: 13, b: 12, c: 11, d: 10, e: 9, f: 15, g: 14 };
/** 7seg-ca 的腳號。 */
const SEG = { a: 7, b: 6, c: 4, d: 2, e: 1, f: 9, g: 10, CA: [3, 8] };

describe('converting a 7-segment display', () => {
  it('uses a 74LS47, a common-anode display and 7 resistors', () => {
    const r = ok(toBreadboard(bcdDiagram(), { switchTo: 'vcc', board: 'auto' }));
    expect(r.bom).toMatchObject({ ics: { '74LS47': 1 }, displays: 1, resistors: 4 + 7, leds: 0 });
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

  it('allows two displays with distinct parts, but not three', () => {
    let d = emptyDiagram();
    d = must(addNode(d, 'INPUT', 0, 0));
    for (let k = 0; k < 3; k++) d = must(addNode(d, 'DISPLAY', 6 + k * 6, 0));
    for (let k = 1; k <= 3; k++) for (let p = 0; p < 4; p++) d = must(connect(d, 'i1', { node: `d${k}`, pin: p }));
    expect(convertProblem(d)).toBe('7 段顯示器最多 2 個（零件太多，佈線接不完）');
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
