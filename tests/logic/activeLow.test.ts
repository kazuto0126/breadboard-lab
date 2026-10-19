import { describe, expect, it } from 'vitest';
import { indexCircuit, pinPoint } from '../../src/core/circuit/circuitIndex';
import { compileSimulation } from '../../src/core/simulation/simulate';
import { validateCircuit } from '../../src/core/circuit/validate';
import { holeLabel } from '../../src/editor/analysis';
import { checkAgainstDiagram } from '../../src/logic/diagramCheck';
import { setActiveLow } from '../../src/logic/edit';
import { lampLit } from '../../src/logic/evaluate';
import { parseLogicDiagram } from '../../src/logic/file';
import { DEFAULT_LAYOUT, toBreadboard, type LayoutVariant } from '../../src/logic/toBreadboard';
import type { LogicDiagram, LogicNode } from '../../src/logic/types';
import type { Circuit } from '../../src/types/circuit';
import { comp, wire } from '../fixtures/build';
import { gateDiagram, handWired } from '../fixtures/handWired';
import { decoder } from '../fixtures/labCircuits';
import { powerProblems } from '../fixtures/powerChecks';

/** 子專案 37（規格 2026-10-20 conversion-placement）：低態致動的輸出端（0 時亮）。 */
const must = (r: { ok: true; diagram: LogicDiagram } | { ok: false; reason: string }) => {
  if (!r.ok) throw new Error(r.reason);
  return r.diagram;
};
const node = (d: LogicDiagram, id: string) => d.nodes.find((n) => n.id === id)!;
const at = (c: Circuit, id: string, pin: number) => holeLabel(c, pinPoint(indexCircuit(c), { componentId: id, pinNumber: pin })!);
const col = (label: string) => Number(/(\d+)$/.exec(label)![1]);

/** 每顆 LED 的陽極是不是直接接在 +5 V。 */
function anodesOnVcc(c: Circuit): Record<string, boolean> {
  const sim = compileSimulation(c);
  const vcc = new Set(sim.sources.filter((s) => s.level === 1).map((s) => s.node));
  return Object.fromEntries(sim.leds.map((l) => [l.componentId, l.anode !== null && vcc.has(l.anode)]));
}

const andLow = () => must(setActiveLow(gateDiagram('AND'), 'o1', true));
const convert = (d: LogicDiagram, layout: Partial<LayoutVariant>) => {
  const r = toBreadboard(d, { switchTo: 'vcc', board: 'MB102' }, { ...DEFAULT_LAYOUT, ...layout });
  if (!r.ok) throw new Error(r.reason);
  return r.circuit;
};
const sound = (d: LogicDiagram, c: Circuit) => {
  expect(checkAgainstDiagram(d, c)).toMatchObject({ kind: 'done', result: { mismatches: [] } });
  expect(powerProblems(c)).toEqual([]);
  // 陽極接 +5 V 不算接反，陰極那一側有電阻。
  expect(validateCircuit(c).filter((e) => e.code.startsWith('LED'))).toEqual([]);
};

describe('active-low outputs (sub-project 37)', () => {
  it('reads and keeps activeLow on outputs only', () => {
    const raw = { version: 1, nodes: [{ id: 'o1', kind: 'OUTPUT', x: 0, y: 0, name: 'X', activeLow: true }], wires: [] };
    const r = parseLogicDiagram(raw);
    if (!r.ok) throw new Error(r.error);
    expect(r.diagram.nodes[0]).toMatchObject({ activeLow: true });
    expect(parseLogicDiagram(JSON.parse(JSON.stringify(r.diagram)))).toEqual(r);
    const off = parseLogicDiagram({ ...raw, nodes: [{ ...raw.nodes[0], activeLow: false }] });
    expect(off.ok && off.diagram.nodes[0]).not.toHaveProperty('activeLow');
    expect(parseLogicDiagram({ ...raw, nodes: [{ id: 'i1', kind: 'INPUT', x: 0, y: 0, name: 'A', activeLow: true }] })).toEqual({
      ok: false,
      error: '元件 i1 不是輸出端，不能設成低態致動',
    });
  });

  it('switches an output to active-low and back', () => {
    const d = gateDiagram('AND');
    const low = must(setActiveLow(d, 'o1', true));
    expect(node(low, 'o1').activeLow).toBe(true);
    expect(low.wires).toBe(d.wires);
    expect(setActiveLow(low, 'o1', true)).toEqual({ ok: true, diagram: low });
    expect(node(must(setActiveLow(low, 'o1', false)), 'o1')).not.toHaveProperty('activeLow');
    expect(setActiveLow(d, 'g1', true)).toMatchObject({ ok: false, reason: '找不到輸出端' });
  });

  it('lights the lamp at 0 when the output is active-low', () => {
    const plain = { id: 'o1', kind: 'OUTPUT', x: 0, y: 0, name: 'X' } as LogicNode;
    const low: LogicNode = { ...plain, activeLow: true };
    expect([lampLit(plain, 1), lampLit(plain, 0), lampLit(plain, 'X'), lampLit(plain, undefined)]).toEqual([true, false, false, false]);
    expect([lampLit(low, 1), lampLit(low, 0), lampLit(low, 'X'), lampLit(low, undefined)]).toEqual([false, true, false, false]);
  });

  it('wires an active-low LED from +5 V through its resistor to the output (two per block)', () => {
    const d = andLow();
    const c = convert(d, { leds: 'pair' });
    expect(anodesOnVcc(c)).toEqual({ D1: true });
    // 電阻在 A 列；LED 轉 180° 在 B 列：陰極和電阻的另一腳同一排（不用接線）、陽極在右邊一排。
    const r = c.components.find((x) => x.defId === 'resistor' && /^A/.test(at(c, x.id, 1)))!;
    expect(at(c, 'D1', 2)).toBe(`B${col(at(c, r.id, 2))}`);
    expect(at(c, 'D1', 1)).toBe(`B${col(at(c, r.id, 2)) + 1}`);
    sound(d, c);
    // 一般的輸出不變：陽極接電阻、陰極接 GND。
    expect(anodesOnVcc(convert(gateDiagram('AND'), { leds: 'pair' }))).toEqual({ D1: false });
  });

  it('wires an active-low LED below a resistor that straddles the gap', () => {
    const d = andLow();
    const c = convert(d, { leds: 'straddle' });
    expect(anodesOnVcc(c)).toEqual({ D1: true });
    const r = c.components.find((x) => x.defId === 'resistor' && /^E/.test(at(c, x.id, 1)))!;
    expect(at(c, 'D1', 2)).toBe(`I${col(at(c, r.id, 2))}`);
    expect(at(c, 'D1', 1)).toBe(`I${col(at(c, r.id, 2)) + 1}`);
    sound(d, c);
  });

  it('converts the 3-to-8 decoder with active-low outputs so every LED checks out', () => {
    const d = decoder(true);
    for (const layout of [{ leds: 'pair' as const, split: true, gap: 2 }, { leds: 'straddle' as const, split: true, gap: 3 }]) {
      const c = convert(d, layout);
      const anodes = anodesOnVcc(c);
      expect(Object.keys(anodes)).toHaveLength(8);
      expect(Object.values(anodes).every(Boolean)).toBe(true);
      // 期望值仍然是訊號的 0 / 1（/Y 是 0 的那一顆亮）。
      sound(d, c);
    }
  });

  it('reads an LED whose anode is on +5 V as lit = 0 when checking a hand-wired board by name', () => {
    // 手接的 AND（74LS08）：D1 轉 180°，陽極（G21）接 +5 V，陰極（G20）接 1Y（圖 B 的接法，省略電阻）。
    const base = handWired({ chip: '74LS08', labels: { sw1: ['A'], sw2: ['', '', 'B'], led: ['X'] } });
    const board: Circuit = {
      ...base,
      components: [...base.components.filter((x) => x.id !== 'D1'), comp('V2', 'vcc', 'B+3'), comp('D1', 'led', 'G21', { rotation: 180, props: { color: 'red', labels: ['X'] } })],
      wires: [...base.wires.filter((w) => w.id !== 'k' && w.id !== 'en'), wire('anode', 'B+21', 'J21')],
    };
    expect(anodesOnVcc(board)).toEqual({ D1: true });
    // 期望值是訊號的值；邏輯圖有沒有設低態致動都一樣（讀法看麵包板怎麼接）。
    expect(checkAgainstDiagram(gateDiagram('AND'), board)).toMatchObject({ kind: 'done', result: { rows: 4, mismatches: [] } });
    expect(checkAgainstDiagram(andLow(), board)).toMatchObject({ kind: 'done', result: { rows: 4, mismatches: [] } });
    expect(checkAgainstDiagram(gateDiagram('OR'), board)).toMatchObject({ kind: 'done', result: { mismatches: [{ inputs: '01' }, { inputs: '10' }] } });
  });
});
