import { describe, expect, it } from 'vitest';
import { analyzeCircuit } from '../../src/editor/analysis';
import { validateCircuit } from '../../src/core/circuit/validate';
import { applyRouting } from '../../src/core/routing/apply';
import { convertAndRoute } from '../../src/logic/convertRoute';
import { checkAgainstDiagram } from '../../src/logic/diagramCheck';
import { addNode, connect } from '../../src/logic/edit';
import { bcdDiagram } from '../../src/logic/examples';
import { convertProblem } from '../../src/logic/synth';
import { toBreadboard, type ConvertResult } from '../../src/logic/toBreadboard';
import { emptyDiagram, type LogicDiagram } from '../../src/logic/types';

/** 子專案 44（規格 2026-10-24 display-resistors）：7 段顯示器每段一顆電阻或共用一顆電阻。 */
const must = (r: { ok: boolean; diagram: LogicDiagram }) => {
  if (!r.ok) throw new Error('bad edit');
  return r.diagram;
};
const ok = (r: ConvertResult) => {
  if (!r.ok) throw new Error(r.reason);
  return r;
};
/** n 個顯示器，每個接自己的 4 個輸入（BCD）。 */
function displays(n: number): LogicDiagram {
  let d = emptyDiagram();
  for (let k = 0; k < n; k++) {
    for (let p = 0; p < 4; p++) d = must(addNode(d, 'INPUT', 0, k * 6 + p));
    d = must(addNode(d, 'DISPLAY', 10, k * 8));
  }
  for (let k = 0; k < n; k++) for (let p = 0; p < 4; p++) d = must(connect(d, `i${k * 4 + p + 1}`, { node: `d${k + 1}`, pin: p }));
  return d;
}
/** 顯示器某一隻腳接到的元件（同一個 Net 裡的其他腳）。 */
const partnersOf = (r: Extract<ConvertResult, { ok: true }>, ds: string, pin: number) => {
  const net = analyzeCircuit(r.circuit).nets.find((n) => n.pins.some((p) => p.componentId === ds && p.pinNumber === pin))!;
  return net.pins.filter((p) => p.componentId !== ds).map((p) => p.componentId);
};
const resistorsOf = (r: Extract<ConvertResult, { ok: true }>) => r.circuit.components.filter((c) => c.defId === 'resistor');

describe('display resistors', () => {
  it('uses one resistor per segment by default with one display', () => {
    const r = ok(toBreadboard(bcdDiagram(), { switchTo: 'vcc', board: 'auto' }));
    expect(resistorsOf(r)).toHaveLength(7);
    expect(r.bom.resistors).toBe(7);
  });

  it('wires the segments straight to the decoder and puts one 100 Ω resistor on the common anode when shared', () => {
    const r = ok(toBreadboard(bcdDiagram(), { switchTo: 'vcc', board: 'auto', displayResistors: 'shared' }));
    expect(resistorsOf(r)).toHaveLength(1);
    expect(resistorsOf(r)[0].props.resistance).toBe(100);
    // 第 7 腳是 a 段：直接接 74LS47 的 /a（第 13 腳），中間沒有電阻。
    const decoder = r.circuit.components.find((c) => c.defId === '74LS47')!.id;
    expect(partnersOf(r, 'DS1', 7)).toEqual([decoder]);
    // 共陽極（第 3、8 腳）經過電阻接 +5 V。
    expect(partnersOf(r, 'DS1', 3)).toContain(resistorsOf(r)[0].id);
  });

  it('puts the shared resistor between the common cathode and GND for common-cathode displays', () => {
    const r = ok(toBreadboard(bcdDiagram(), { switchTo: 'vcc', board: 'auto', display: 'cc', displayResistors: 'shared' }));
    expect(resistorsOf(r)).toHaveLength(1);
    const cc = r.circuit.components.find((c) => c.defId === '7seg-cc')!.id;
    expect(partnersOf(r, cc, 3)).toEqual([resistorsOf(r)[0].id]);
  });

  it('shares the resistor by default with two displays, and allows one per segment only with one display', () => {
    expect(convertProblem(displays(2))).toBeNull();
    const r = ok(toBreadboard(displays(2), { switchTo: 'vcc', board: 'auto' }));
    expect(resistorsOf(r)).toHaveLength(2);
    expect(convertProblem(displays(2), { displayResistors: 'each' })).toBe('每段一顆電阻時 7 段顯示器最多 1 個；兩個請選「共用一顆電阻」');
    expect(toBreadboard(displays(2), { switchTo: 'vcc', board: 'auto', displayResistors: 'each' })).toMatchObject({ ok: false });
    expect(convertProblem(displays(3))).toBe('7 段顯示器最多 2 個（零件太多，佈線接不完）');
  });

  it('simulates the same as the diagram with a shared resistor, and Check Circuit finds no errors', () => {
    const d = bcdDiagram();
    const r = convertAndRoute(d, { switchTo: 'vcc', board: 'auto', displayResistors: 'shared' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.routed.status).toBe('success');
    const applied = applyRouting(r.result.circuit, r.routed);
    expect(checkAgainstDiagram(d, applied)).toMatchObject({ kind: 'done', result: { mismatches: [] } });
    expect(validateCircuit(applied).filter((e) => e.severity === 'error')).toEqual([]);
  }, 120_000);
});
