import { describe, expect, it } from 'vitest';
import { getBoard } from '../../src/core/breadboard/registry';
import { holeName } from '../../src/core/breadboard/naming';
import { resolveFootprint } from '../../src/core/circuit/footprint';
import { getComponentDefinition } from '../../src/core/circuit/library';
import { validateCircuit } from '../../src/core/circuit/validate';
import { applyRouting } from '../../src/core/routing/apply';
import { convertAndRoute } from '../../src/logic/convertRoute';
import { sortedIo } from '../../src/logic/evaluate';
import { majorityDiagram } from '../../src/logic/examples';
import { packFlipFlops } from '../../src/logic/flipFlops';
import { assignIcs, decompose, drivers } from '../../src/logic/synth';
import { independentParts, switchText, toBreadboard, type ConvertResult } from '../../src/logic/toBreadboard';
import type { LogicDiagram } from '../../src/logic/types';
import type { LayoutId } from '../../src/types/board';
import { fourCircuits } from '../fixtures/fourCircuits';
import { decoder } from '../fixtures/labCircuits';

/** 子專案 60（規格 2026-11-11 guide-layout-rules）：照「麵包板接線 AI 工作指南」做進轉換的擺法規則。 */
type Converted = Extract<ConvertResult, { ok: true }>;
const must = (r: ConvertResult): Converted => {
  if (!r.ok) throw new Error(r.reason);
  return r;
};
/** 元件每隻腳所在的孔（名稱）。 */
function pins(r: Converted, id: string, layout: LayoutId): string[] {
  const c = r.circuit.components.find((x) => x.id === id)!;
  const board = getBoard(layout, c.boardId);
  return resolveFootprint(c, getComponentDefinition(c.defId)!).pins.map((p) => holeName(board, p.point) ?? '?');
}
const labels = (r: Converted, id: string) => r.circuit.components.find((c) => c.id === id)?.props.labels;

function partsOf(diagram: LogicDiagram) {
  const d = packFlipFlops(diagram);
  const { inputs, outputs } = sortedIo(d);
  const plans = assignIcs(decompose(d));
  const chips = d.nodes.filter((n) => n.kind === 'BLOCK' && n.chip).map((node, k) => ({ node, ic: `U${plans.length + k + 1}` }));
  const parts = independentParts(inputs, outputs.filter((n) => n.kind === 'OUTPUT'), plans, chips, drivers(d));
  const name = (id: string) => d.nodes.find((n) => n.id === id)?.name ?? id;
  return { count: parts.count, of: (wanted: string) => [...parts.of].find(([id]) => name(id) === wanted)?.[1] };
}

describe('independent sub-circuits (guide 3.2)', () => {
  it('finds four parts; a shared clock does not join them; parts follow the first input name', () => {
    const p = partsOf(fourCircuits());
    expect(p.count).toBe(4);
    // 依第一個輸入的名稱：D_、JK_、LS_、T_。JK 與 D 共用時脈，還是兩組。
    expect(['D_D', 'D_Q', 'JK_J', 'JK_Q', 'LS_S', 'LS_QB', 'T_T', 'T_QN'].map(p.of)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it('keeps a circuit whose gates share inputs as one part', () => {
    expect(partsOf(majorityDiagram()).count).toBe(1);
  });

  it('gives every part its own switch in name order, one part after another on an EIC-1106', () => {
    const r = must(toBreadboard(fourCircuits(), { switchTo: 'vcc', board: 'EIC1106', pulls: true }, { gap: 3, leds: 'rail', split: false, parts: true }));
    expect(r.bom.switchList).toEqual(['dipsw-4', 'dipsw-4', 'dipsw-4', 'dipsw-4']);
    expect(switchText(r.bom)).toBe('4 位元指撥開關 × 4');
    expect([1, 2, 3, 4].map((k) => labels(r, `SW${k}`))).toEqual([
      ['D_CLR', 'D_D', 'D_PRE', ''],
      ['JK_CLR', 'JK_J', 'JK_K', 'JK_PRE'],
      ['LS_CP', 'LS_R', 'LS_S', ''],
      ['T_CP', 'T_T', '', ''],
    ]);
    // 每一組的開關、IC、LED 在同一區；前兩組在第 1 區，放不下的排到第 2 區。
    const area = (id: string) => pins(r, id, 'EIC1106')[0].split('-')[0];
    expect(['SW1', 'SW2', 'SW3', 'SW4'].map(area)).toEqual(['1', '1', '2', '2']);
    // 下拉電阻插進那一區下面的 − 軌。
    expect(pins(r, 'R1', 'EIC1106')[1]).toMatch(/^P3-/);
    expect(pins(r, `R${1 + 3 + 4}`, 'EIC1106')[1]).toMatch(/^P4-/);
    expect(validateCircuit(r.circuit).filter((e) => e.severity === 'error' && !e.code.startsWith('WIRE'))).toEqual([]);
  });

  it('does nothing for a single part: same layout with or without parts', () => {
    const at = (parts: boolean) => must(toBreadboard(majorityDiagram(), { switchTo: 'vcc', board: 'MB102' }, { gap: 2, leds: 'rail', split: false, ...(parts ? { parts: true as const } : {}) })).circuit.components;
    expect(at(true)).toEqual(at(false));
  });

  it('routes the four circuits on one EIC-1106 (was 2 nets short after 300 s)', () => {
    const r = convertAndRoute(fourCircuits(), { switchTo: 'vcc', board: 'EIC1106', pulls: true });
    if (!r.ok) throw new Error(r.reason);
    expect(r.routed.status).toBe('success');
    expect(r.result.bom.boards).toBe(1);
    expect(r.result.bom.switchList).toEqual(['dipsw-4', 'dipsw-4', 'dipsw-4', 'dipsw-4']);
    expect(validateCircuit(applyRouting(r.result.circuit, r.routed)).filter((e) => e.severity === 'error')).toEqual([]);
  }, 120_000);
});

describe('LEDs straight into the power rail (guide 3.7)', () => {
  it('puts the anode in row J and the cathode in the − rail, one column each', () => {
    const r = must(toBreadboard(majorityDiagram(), { switchTo: 'vcc', board: 'MB102' }, { gap: 2, leds: 'rail', split: false }));
    const [anode, cathode] = pins(r, 'D1', 'MB102');
    expect(anode).toMatch(/^J\d+$/);
    expect(cathode).toBe(`B-${anode.slice(1)}`);
    // 電阻跨過凹槽，下端和 LED 的陽極同一排。
    expect(pins(r, 'R1', 'MB102')).toEqual([`E${anode.slice(1)}`, `F${anode.slice(1)}`]);
    // LED 的陰極不用再拉線接 GND。
    expect(r.netOf['D1#2']).toBe('GND');
    expect(validateCircuit(r.circuit).filter((e) => e.severity === 'error' && !e.code.startsWith('WIRE'))).toEqual([]);
  });

  it('puts the anode of an active-low LED in the + rail', () => {
    const r = must(toBreadboard(decoder(true), { switchTo: 'vcc', board: 'MB102' }, { gap: 2, leds: 'rail', split: false }));
    const [anode, cathode] = pins(r, 'D1', 'MB102');
    expect(anode).toMatch(/^B\+\d+$/);
    expect(cathode).toBe(`J${anode.slice(2)}`);
  });

  it('skips the columns where the rail has no hole', () => {
    const r = must(toBreadboard(decoder(), { switchTo: 'vcc', board: 'EIC1106' }, { gap: 3, leds: 'rail', split: false }));
    const leds = r.circuit.components.filter((c) => c.defId === 'led');
    expect(leds.length).toBeGreaterThan(5);
    for (const led of leds) expect(pins(r, led.id, 'EIC1106').every((p) => p !== '?')).toBe(true);
  });
});
