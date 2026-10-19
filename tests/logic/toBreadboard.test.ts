import { describe, expect, it } from 'vitest';
import { validateCircuit } from '../../src/core/circuit/validate';
import { analyzeCircuit } from '../../src/editor/analysis';
import { addNode, connect } from '../../src/logic/edit';
import { majorityDiagram } from '../../src/logic/examples';
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

/** 每個實際的 Net 只含一個預定的訊號，每個訊號的腳都在同一個 Net（沒有短路，也沒有漏接）。 */
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
    const r = ok(toBreadboard(majorityDiagram(), { switchTo, board: 'auto', pulls: true }));
    // 5V / GND 符號由 powerProblems 檢查（子專案 34：用到的軌各一個）。
    const parts = r.circuit.components.filter((c) => c.defId !== 'vcc' && c.defId !== 'gnd').map((c) => [c.id, c.defId, c.props.resistance ?? null]);
    const pull = switchTo === 'vcc' ? 330 : 1000;
    expect(parts).toEqual([
      ['SW1', 'dipsw-4', null],
      ['R1', 'resistor', pull],
      ['R2', 'resistor', pull],
      ['R3', 'resistor', pull],
      ['U1', '74LS08', null],
      ['U2', '74LS32', null],
      ['R4', 'resistor', 220],
      ['D1', 'led', null],
    ]);
    expect(r.bom).toEqual({ ics: { '74LS08': 1, '74LS32': 1 }, switch: 'dipsw-4', buttons: 0, resistors: 4, leds: 1, displays: 0, layout: 'MB102' });
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
    const r = ok(toBreadboard(d, { switchTo: 'vcc', board: 'auto', pulls: true }));
    expect(r.bom.layout).toBe('EIC1106');
    expect(r.bom.ics).toEqual({ '74LS08': 6 });
    expect(validateCircuit(r.circuit).filter((e) => e.severity === 'error' && !e.code.startsWith('WIRE'))).toEqual([]);
    expect(wiredAsPlanned(r)).toEqual({ merged: [], split: [] });
    expect(toBreadboard(d, { switchTo: 'vcc', board: 'MB102', pulls: true })).toEqual({ ok: false, reason: 'MB-102 放不下，請改用 EIC-1106' });
    expect(toBreadboard(andChain(60), { switchTo: 'vcc', board: 'auto', pulls: true })).toMatchObject({ ok: false, reason: expect.stringContaining('EIC-1106 放不下') });
  });

  it('refuses diagrams that cannot be converted', () => {
    expect(toBreadboard(emptyDiagram(), { switchTo: 'vcc', board: 'auto' })).toEqual({ ok: false, reason: '邏輯圖要有輸入端和輸出端才能轉' });
  });
});

describe('cleaner conversions (sub-project 19)', () => {
  it.each(['vcc', 'gnd'] as const)('leaves out pull resistors and unused gate pins by default (switches to %s)', async (switchTo) => {
    const { verifyBreadboard } = await import('../../src/logic/verifyBreadboard');
    const r = ok(toBreadboard(majorityDiagram(), { switchTo, board: 'auto' }));
    expect(r.circuit.components.filter((c) => c.defId === 'resistor').map((c) => c.props.resistance)).toEqual([220]); // 只剩 LED 的
    expect(r.bom.resistors).toBe(1);
    // 74LS32 的 4 組 OR 只用 2 組：第 3、4 組的腳都沒有預定訊號（不接線）。
    const or = r.circuit.components.find((c) => c.defId === '74LS32')!;
    expect([8, 9, 10, 11, 12, 13].map((p) => r.netOf[`${or.id}#${p}`])).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
    expect(validateCircuit(r.circuit).filter((e) => e.code === 'INPUT_FLOATING')).toEqual([]);
    expect(validateCircuit(r.circuit).filter((e) => e.code === 'SWITCH_NO_PULL')).toHaveLength(3);
    expect(wiredAsPlanned(r)).toEqual({ merged: [], split: [] });
    expect(verifyBreadboard(majorityDiagram(), r.circuit, switchTo, r).mismatches).toEqual([]);
  });
});

describe('LEDs next to their resistors', () => {
  it('puts each LED anode in the same column group as its resistor, so they need no wire', async () => {
    const { resolveFootprint } = await import('../../src/core/circuit/footprint');
    const { getComponentDefinition } = await import('../../src/core/circuit/library');
    const { groupIdAt } = await import('../../src/editor/analysis');
    // 兩個輸出：一個在上半（A、B 列），一個在下半（J、I 列）。
    let d = majorityDiagram();
    d = must(addNode(d, 'OUTPUT', 30, 14));
    d = must(connect(d, 'g1', { node: 'o2', pin: 0 }));
    const r = ok(toBreadboard(d, { switchTo: 'vcc', board: 'auto' }));
    const pinAt = (id: string, n: number) => {
      const c = r.circuit.components.find((x) => x.id === id)!;
      return resolveFootprint(c, getComponentDefinition(c.defId)!).pins.find((p) => p.pinNumber === n)!.point;
    };
    for (const [res, led] of [['R1', 'D1'], ['R2', 'D2']]) {
      expect(groupIdAt(r.circuit, pinAt(res, 2))).toBe(groupIdAt(r.circuit, pinAt(led, 1)));
      const touching = r.circuit.wires.filter((w) => [w.start, w.end].some((p) => groupIdAt(r.circuit, p) === groupIdAt(r.circuit, pinAt(led, 1))));
      expect(touching).toEqual([]);
    }
    expect(wiredAsPlanned(r)).toEqual({ merged: [], split: [] });
    const { verifyBreadboard } = await import('../../src/logic/verifyBreadboard');
    expect(verifyBreadboard(d, r.circuit, 'vcc', r).mismatches).toEqual([]);
  });
});
