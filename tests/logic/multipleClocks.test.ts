import { describe, expect, it } from 'vitest';
import { applyRouting } from '../../src/core/routing/apply';
import { convertAndRoute } from '../../src/logic/convertRoute';
import { checkAgainstDiagram } from '../../src/logic/diagramCheck';
import { addNode } from '../../src/logic/edit';
import { allClocks, parseClockOrder, sequenceTable } from '../../src/logic/evaluate';
import { parseLogicDiagram } from '../../src/logic/file';
import { compareDiagramToStateTask } from '../../src/logic/stateCheck';
import { emptyDiagram, type LogicDiagram } from '../../src/logic/types';
import { waveText } from '../../src/logic/waveform';
import { logicTruthTable, newLabFile } from '../../src/mcp/tools';

/** 子專案 64（規格 2026-11-14 multiple-clocks）：兩個時脈各接一顆 D 型正反器（D 接 /Q，每個脈衝翻一次）。 */
function twoToggles(): LogicDiagram {
  const ff = (id: string, y: number) => ({ id, kind: 'BLOCK' as const, chip: 'DFF' as const, x: 8, y });
  return {
    ...emptyDiagram(),
    nodes: [
      { id: 'c1', kind: 'CLOCK', name: 'CLK', x: 0, y: 2, value: 0 },
      { id: 'c2', kind: 'CLOCK', name: 'CLK2', x: 0, y: 10, value: 0 },
      ff('f1', 0),
      ff('f2', 8),
      { id: 'o1', kind: 'OUTPUT', name: 'A', x: 16, y: 1 },
      { id: 'o2', kind: 'OUTPUT', name: 'B', x: 16, y: 9 },
    ],
    wires: [
      { id: 'w1', from: 'c1', to: { node: 'f1', pin: 1 } },
      { id: 'w2', from: 'c2', to: { node: 'f2', pin: 1 } },
      { id: 'w3', from: 'f1', fromPin: 1, to: { node: 'f1', pin: 0 } },
      { id: 'w4', from: 'f2', fromPin: 1, to: { node: 'f2', pin: 0 } },
      { id: 'w5', from: 'f1', to: { node: 'o1', pin: 0 } },
      { id: 'w6', from: 'f2', to: { node: 'o2', pin: 0 } },
    ],
  };
}

const rows = (t: ReturnType<typeof sequenceTable>) => (t.ok ? t.rows.map((r) => `${r.clock ?? '-'}:${r.out.join('')}`) : t);

describe('multiple clocks', () => {
  it('sends the first clock by default and follows a given order', () => {
    const d = twoToggles();
    const t = sequenceTable(d, 3);
    expect(t).toMatchObject({ ok: true, clock: 'CLK', clocks: ['CLK', 'CLK2'] });
    expect(rows(t)).toEqual(['-:00', 'CLK:10', 'CLK:00', 'CLK:10']);
    expect(rows(sequenceTable(d, 4, {}, 0, ['CLK2']))).toEqual(['-:00', 'CLK2:01', 'CLK2:00', 'CLK2:01', 'CLK2:00']);
    // 照順序一直重複：CLK、CLK、CLK2。
    expect(rows(sequenceTable(d, 6, {}, 0, ['CLK', 'CLK', 'CLK2']))).toEqual(['-:00', 'CLK:10', 'CLK:00', 'CLK2:01', 'CLK:11', 'CLK:01', 'CLK2:00']);
    expect(parseClockOrder(' CLK  CLK2,CLK、CLKs ')).toEqual(['CLK', 'CLK2', 'CLK', 'CLKs']);
    expect(sequenceTable(d, 2, {}, 0, ['CLK3'])).toEqual({ ok: false, reason: 'bad-order', unknown: ['CLK3'] });
  });

  it('draws one waveform lane per clock', () => {
    const t = sequenceTable(twoToggles(), 4, {}, 0, ['CLK', 'CLK2']);
    if (!t.ok) throw new Error();
    expect(waveText(t).split('\n')).toEqual(['CLK  .|.|.', 'CLK2 ..|.|', 'A    _‾‾__', 'B    __‾‾_']);
  });

  it('allows up to four clocks named CLK, CLK2… and reads them from files', () => {
    let d = emptyDiagram();
    for (let k = 0; k < 4; k++) {
      const r = addNode(d, 'CLOCK', 0, k * 3);
      if (!r.ok) throw new Error(r.reason);
      d = r.diagram;
    }
    expect(allClocks(d)).toEqual(['CLK', 'CLK2', 'CLK3', 'CLK4']);
    expect(addNode(d, 'CLOCK', 0, 20)).toMatchObject({ ok: false, reason: '一張圖最多 4 個時脈' });
    expect(parseLogicDiagram(twoToggles())).toMatchObject({ ok: true });
  });

  it('converts to two clock components named after the clocks and the breadboard matches', () => {
    const d = twoToggles();
    const r = convertAndRoute(d, { switchTo: 'vcc', board: 'auto' });
    if (!r.ok) throw new Error(r.reason);
    const clocks = r.result.circuit.components.filter((c) => c.defId === 'clock');
    expect(clocks.map((c) => [c.id, c.props.labels])).toEqual([
      ['CLK1', ['CLK']],
      ['CLK2', ['CLK2']],
    ]);
    const check = checkAgainstDiagram(d, applyRouting(r.result.circuit, r.routed));
    expect(check).toMatchObject({ kind: 'done', result: { mismatches: [] } });
    if (check.kind !== 'done') throw new Error();
    expect(check.mapping).toContain('CLK → CLK1、CLK2 → CLK2');
    // 時脈元件的名稱拿掉：說明要用名稱對應。
    const unnamed = { ...r.result.circuit, components: r.result.circuit.components.map((c) => (c.defId === 'clock' ? { ...c, props: { ...c.props, labels: undefined } } : c)) };
    const c2 = checkAgainstDiagram(d, unnamed);
    expect(c2.kind).toBe('incomplete');
    if (c2.kind !== 'incomplete') throw new Error();
    expect(c2.issues[0]).toContain('時脈 CLK：找不到名稱是 CLK 的時脈元件');
  }, 120_000);

  it('state tasks still need exactly one clock', () => {
    const r = compareDiagramToStateTask(twoToggles(), { states: 2, inputs: [], outputs: [], flipFlop: 'D', rows: [{ next: 1, out: [] }, { next: 0, out: [] }] });
    expect(r.kind).toBe('issues');
    if (r.kind !== 'issues') throw new Error();
    expect(r.issues.join()).toContain('好幾個時脈');
  });

  it('MCP logic_truth_table takes a clock order', () => {
    const f = { ...newLabFile('x', 'MB102'), logic: twoToggles() };
    const text = logicTruthTable(f, { pulses: 2, clocks: ['CLK2', 'CLK'] }).text;
    expect(text).toContain('第幾次 時脈 | A B\n0 - | 0 0\n1 CLK2 | 0 1\n2 CLK | 1 1');
    expect(logicTruthTable(f, { clocks: ['X'] })).toMatchObject({ error: true, text: expect.stringContaining('沒有叫 X 的時脈') });
  });
});
