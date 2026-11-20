import { describe, expect, it } from 'vitest';
import { analyzeCircuit } from '../../src/editor/analysis';
import { validateCircuit } from '../../src/core/circuit/validate';
import { applyRouting } from '../../src/core/routing/apply';
import { convertAndRoute } from '../../src/logic/convertRoute';
import { checkAgainstDiagram } from '../../src/logic/diagramCheck';
import { addNode, connect } from '../../src/logic/edit';
import { bcdDiagram } from '../../src/logic/examples';
import { MB102_DISPLAY_PROBLEM, convertProblem } from '../../src/logic/synth';
import { boardText, toBreadboard, type ConvertResult } from '../../src/logic/toBreadboard';
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

/** 子專案 49：三個顯示器共用 8 個輸入（第 3 個接 i1、i3、i5、i7）。 */
function threeDisplays(): LogicDiagram {
  let d = must(addNode(displays(2), 'DISPLAY', 10, 16));
  [1, 3, 5, 7].forEach((i, p) => (d = must(connect(d, `i${i}`, { node: 'd3', pin: p }))));
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

  it('shares the resistor by default with two displays; more displays use two EIC-1106 (sub-project 49)', () => {
    expect(convertProblem(displays(2))).toBeNull();
    const r = ok(toBreadboard(displays(2), { switchTo: 'vcc', board: 'auto' }));
    expect(resistorsOf(r)).toHaveLength(2);
    expect(r.bom.boards).toBe(1);
    // 子專案 49：每段一顆電阻的 2 個顯示器、共用電阻的 3 個顯示器用兩塊 EIC-1106，每個顯示器和它的解碼 IC 在同一塊板。
    for (const [n, displayResistors] of [[2, 'each'], [3, 'shared']] as const) {
      const d = n === 3 ? threeDisplays() : displays(2);
      expect(convertProblem(d, { displayResistors })).toBeNull();
      const two = ok(toBreadboard(d, { switchTo: 'vcc', board: 'auto', displayResistors }));
      expect(two.bom).toMatchObject({ layout: 'EIC1106', boards: 2, displays: n });
      const boardOf = (id: string) => two.circuit.components.find((c) => c.id === id)!.boardId;
      expect(boardOf(`DS${n}`)).toBe('b2');
      expect(boardOf('DS1')).toBe('b1');
      // 指定板子時不能用兩塊。
      expect(convertProblem(d, { displayResistors, board: 'EIC1106' })).toMatch(/要用兩塊 EIC-1106，請把麵包板選「自動」/);
    }
  });

  it('puts three displays with a resistor per segment on three EIC-1106, one display per board (sub-project 68)', () => {
    const d = threeDisplays();
    expect(convertProblem(d, { displayResistors: 'each' })).toBeNull();
    expect(convertProblem(d, { displayResistors: 'each', board: 'EIC1106' })).toMatch(/要用三塊 EIC-1106，請把麵包板選「自動」/);
    const three = ok(toBreadboard(d, { switchTo: 'vcc', board: 'auto', displayResistors: 'each' }));
    expect(three.bom).toMatchObject({ layout: 'EIC1106', boards: 3, displays: 3 });
    expect(boardText(three.bom)).toBe('EIC-1106 × 3（左右貼在一起）');
    expect(three.circuit.boards.map((b) => b.id)).toEqual(['b1', 'b2', 'b3']);
    const boardOf = (id: string) => three.circuit.components.find((c) => c.id === id)!.boardId;
    expect(['DS1', 'DS2', 'DS3'].map(boardOf)).toEqual(['b1', 'b2', 'b3']);
    // 每塊板一顆解碼 IC（和它的顯示器在同一塊板）。
    expect(three.circuit.components.filter((c) => c.defId === '74LS47').map((c) => c.boardId).sort()).toEqual(['b1', 'b2', 'b3']);
  });

  it('refuses an MB-102 for displays with a decoder and explains why (sub-project 69)', () => {
    expect(convertProblem(bcdDiagram(), { board: 'MB102' })).toBe(MB102_DISPLAY_PROBLEM);
    expect(toBreadboard(bcdDiagram(), { switchTo: 'vcc', board: 'MB102' })).toEqual({ ok: false, reason: MB102_DISPLAY_PROBLEM });
    expect(convertProblem(bcdDiagram(), { board: 'EIC1106' })).toBeNull();
    expect(convertProblem(bcdDiagram(), { board: 'auto' })).toBeNull();
  });

  it('still allows at most three displays (four do not route even on three or four boards)', () => {
    let d = must(addNode(threeDisplays(), 'DISPLAY', 10, 24));
    [2, 4, 6, 8].forEach((i, p) => (d = must(connect(d, `i${i}`, { node: 'd4', pin: p }))));
    expect(convertProblem(d)).toBe('7 段顯示器最多 3 個（零件太多，佈線接不完）');
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
