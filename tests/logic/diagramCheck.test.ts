import { describe, expect, it } from 'vitest';
import { checkAgainstDiagram } from '../../src/logic/diagramCheck';
import { bcdDiagram, majorityDiagram } from '../../src/logic/examples';
import { toBreadboard } from '../../src/logic/toBreadboard';
import { emptyDiagram } from '../../src/logic/types';
import type { Circuit } from '../../src/types/circuit';
import { comp, wire } from '../fixtures/build';
import { gateDiagram, handWired } from '../fixtures/handWired';

/** A = SW1 第 1 個開關、B = SW2 第 3 個開關、X = D1。 */
const named = { sw1: ['A'], sw2: ['', '', 'B'], led: ['X'] };

const issues = (d: Parameters<typeof checkAgainstDiagram>[0], c: Circuit) => {
  const r = checkAgainstDiagram(d, c);
  if (r.kind !== 'incomplete') throw new Error(`expected incomplete, got ${r.kind}`);
  return r.issues;
};

describe('checking a hand-wired breadboard against the logic diagram by name', () => {
  it('matches a hand-wired XOR and explains the mapping', () => {
    const r = checkAgainstDiagram(gateDiagram('XOR'), handWired({ chip: '74LS86', labels: named }));
    expect(r).toMatchObject({ kind: 'done', result: { rows: 4, mismatches: [] }, inputs: ['A', 'B'], outputs: ['X'] });
    expect(r.kind === 'done' && r.mapping).toBe('A → SW1 第 1 個開關（ON = 1）、B → SW2 第 3 個開關（ON = 1）、X → D1');
  });

  it('lists the rows that differ when the board does something else', () => {
    // 邏輯圖是 AND，麵包板接的是 XOR（74LS86）。
    const r = checkAgainstDiagram(gateDiagram('AND'), handWired({ chip: '74LS86', labels: named }));
    expect(r.kind === 'done' && r.result.mismatches).toEqual([
      { inputs: '01', expected: ['0'], actual: ['1'] },
      { inputs: '10', expected: ['0'], actual: ['1'] },
      { inputs: '11', expected: ['1'], actual: ['0'] },
    ]);
  });

  it('works out that ON means 0 when the switches go to GND', () => {
    const r = checkAgainstDiagram(gateDiagram('XOR'), handWired({ chip: '74LS86', toGnd: true, labels: named }));
    expect(r).toMatchObject({ kind: 'done', result: { mismatches: [] } });
    expect(r.kind === 'done' && r.bindings.inputs.map((b) => b.onIs)).toEqual([0, 0]);
    expect(r.kind === 'done' && r.mapping).toContain('A → SW1 第 1 個開關（ON = 0）');
  });

  it('says which names are missing', () => {
    const d = gateDiagram('XOR');
    expect(issues(d, handWired({ chip: '74LS86', labels: { ...named, sw2: [] } }))).toEqual(['輸入 B：找不到名稱是 B 的開關']);
    expect(issues(d, handWired({ chip: '74LS86', labels: { ...named, led: [] } }))).toEqual(['輸出 X：找不到名稱是 X 的 LED']);
  });

  it('reports names used twice', () => {
    const d = gateDiagram('XOR');
    // SW1 第 2 個開關（致能）也標成 A。
    expect(issues(d, handWired({ chip: '74LS86', labels: { ...named, sw1: ['A', 'A'] } }))).toEqual(['名稱 A 用在好幾個開關：SW1 第 1 個、SW1 第 2 個']);
    const base = handWired({ chip: '74LS86', labels: named });
    const twoLeds = { ...base, components: [...base.components, comp('D2', 'led', 'A55', { props: { color: 'red', labels: ['X'] } })] };
    expect(issues(d, twoLeds)).toEqual(['名稱 X 用在好幾顆 LED：D1、D2']);
  });

  it('reports a switch that is not on a power rail, or is on both', () => {
    const d = gateDiagram('XOR');
    const base = handWired({ chip: '74LS86', labels: named });
    const floating = { ...base, wires: base.wires.filter((w) => w.id !== 'b-rail') };
    expect(issues(d, floating)).toEqual(['SW2 第 3 個開關（B）沒有接到 +5 V 或 GND']);
    const both = { ...base, wires: [...base.wires, wire('b-gnd', 'J42', 'B-42')] };
    expect(issues(d, both)).toEqual(['SW2 第 3 個開關（B）兩邊都接到電源']);
  });

  it('only gives a hint when nothing carries a diagram name, and stays quiet when there is nothing to compare', () => {
    const d = gateDiagram('XOR');
    expect(checkAgainstDiagram(d, handWired({ chip: '74LS86' }))).toEqual({ kind: 'hint' });
    expect(checkAgainstDiagram(emptyDiagram(), handWired({ chip: '74LS86', labels: named }))).toEqual({ kind: 'none' });
    expect(checkAgainstDiagram(d, { ...handWired({}), components: [], wires: [] })).toEqual({ kind: 'none' });
    const noOutput = { ...d, nodes: d.nodes.filter((n) => n.kind !== 'OUTPUT'), wires: d.wires.filter((w) => w.to.node !== 'o1') };
    expect(checkAgainstDiagram(noOutput, handWired({ chip: '74LS86', labels: named }))).toEqual({ kind: 'none' });
  });

  it('asks to finish the diagram first when some outputs are unknown', () => {
    const d = gateDiagram('XOR');
    const open = { ...d, wires: d.wires.filter((w) => !(w.to.node === 'g1' && w.to.pin === 1)) };
    expect(issues(open, handWired({ chip: '74LS86', labels: named }))).toEqual(['邏輯圖有些輸出不確定（還有沒接好的腳），先把邏輯圖接好']);
  });
});

describe('checking converted breadboards by name', () => {
  it.each([
    ['vcc', 'direct'],
    ['gnd', 'direct'],
    ['vcc', 'nand'],
  ] as const)('matches figure 2-5 converted with switches to %s (%s)', (switchTo, gates) => {
    const r = toBreadboard(majorityDiagram(), { switchTo, board: 'auto', gates });
    if (!r.ok) throw new Error(r.reason);
    expect(checkAgainstDiagram(majorityDiagram(), r.circuit)).toMatchObject({ kind: 'done', result: { rows: 8, mismatches: [] } });
  });

  it('matches the BCD display example', () => {
    const r = toBreadboard(bcdDiagram(), { switchTo: 'gnd', board: 'auto' });
    if (!r.ok) throw new Error(r.reason);
    const check = checkAgainstDiagram(bcdDiagram(), r.circuit);
    expect(check).toMatchObject({ kind: 'done', result: { rows: 16, mismatches: [] } });
    expect(check.kind === 'done' && check.mapping).toContain('S1 → DS1');
  });
});
