import { describe, expect, it } from 'vitest';
import { checkDiagram } from '../../src/logic/check';
import { addNode, connect, setDisplayMode } from '../../src/logic/edit';
import { evaluate, truthTable } from '../../src/logic/evaluate';
import { parseLogicDiagram } from '../../src/logic/file';
import { inputPins, nodeSize } from '../../src/logic/shapes';
import { emptyDiagram, type LogicDiagram, type NodeKind } from '../../src/logic/types';

const must = (r: { ok: boolean; diagram: LogicDiagram }) => {
  if (!r.ok) throw new Error('bad edit');
  return r.diagram;
};
function build(parts: Array<[NodeKind, number, number]>, links: Array<[string, string, number]>): LogicDiagram {
  let d = emptyDiagram();
  for (const [kind, x, y] of parts) d = must(addNode(d, kind, x, y));
  for (const [from, node, pin] of links) d = must(connect(d, from, { node, pin }));
  return d;
}

describe('the decimal point of a display (sub-project 32)', () => {
  it('has a fifth input DP between B and C', () => {
    const d = build([['DISPLAY', 10, 0]], []);
    const node = d.nodes[0];
    expect(nodeSize(node)).toEqual({ w: 4, h: 5 });
    expect(inputPins(node).map((p) => p.y)).toEqual([0, 1, 3, 4, 2]);
  });

  it('adds a dot to the value when DP is 1, and leaves it out when DP is not wired', () => {
    // 四個輸入端接 A–D，第五個接 DP。
    const d = build(
      [['INPUT', 0, 0], ['INPUT', 0, 2], ['INPUT', 0, 4], ['INPUT', 0, 6], ['INPUT', 0, 8], ['DISPLAY', 10, 0]],
      [['i1', 'd1', 0], ['i2', 'd1', 1], ['i3', 'd1', 2], ['i4', 'd1', 3]],
    );
    expect(checkDiagram(d).some((i) => i.message.includes('DP'))).toBe(false);
    const plain = truthTable(d);
    expect(plain.ok && plain.rows.length).toBe(32);
    const withDp = must(connect(d, 'i5', { node: 'd1', pin: 4 }));
    const v = evaluate(withDp, { i1: 1, i2: 0, i3: 1, i4: 0, i5: 1 });
    expect([v.displays.get('d1'), v.dps.get('d1')]).toEqual([5, 1]);
    const table = truthTable(withDp);
    if (!table.ok) throw new Error('table');
    // 輸入依名稱 A B C D E 排序：A=1、C=1（值 5）、E=1（DP）是 10101。
    const row = table.rows.find((r) => r.in.join('') === '10101')!;
    expect(row.out).toEqual(['5.']);
    expect(table.rows.find((r) => r.in.join('') === '10100')!.out).toEqual([5]);
  });
});

describe('a display that lights each segment directly (sub-project 32)', () => {
  it('switches to eight inputs a–g and dp, dropping the old wires', () => {
    const bcd = build([['INPUT', 0, 0], ['DISPLAY', 10, 0]], [['i1', 'd1', 0]]);
    const r = setDisplayMode(bcd, 'd1', true);
    expect(r.ok).toBe(true);
    const node = r.diagram.nodes.find((n) => n.id === 'd1')!;
    expect(node.segments).toBe(true);
    expect(nodeSize(node)).toEqual({ w: 4, h: 8 });
    expect(inputPins(node).map((p) => p.y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(r.diagram.wires).toEqual([]);
    expect(setDisplayMode(r.diagram, 'd1', false).diagram.nodes.find((n) => n.id === 'd1')).not.toHaveProperty('segments');
  });

  it('refuses to grow into another part', () => {
    const d = build([['DISPLAY', 10, 0], ['AND', 10, 6]], []);
    expect(setDisplayMode(d, 'd1', true)).toMatchObject({ ok: false, reason: '顯示器變高後會和別的元件重疊' });
  });

  it('shows the lit segments in the truth table', () => {
    let d = build([['INPUT', 0, 0], ['INPUT', 0, 2], ['DISPLAY', 10, 0]], []);
    d = must(setDisplayMode(d, 'd1', true));
    // A 接 b 段和 c 段（「1」的字形），B 接 dp。
    for (const [from, pin] of [['i1', 1], ['i1', 2], ['i2', 7]] as const) d = must(connect(d, from, { node: 'd1', pin }));
    expect(checkDiagram(d).filter((i) => i.nodeIds.includes('d1'))).toEqual([]);
    const table = truthTable(d);
    if (!table.ok) throw new Error('table');
    expect(table.rows.map((r) => r.out[0])).toEqual(['-', '.', 'bc', 'bc.']);
  });

  it('warns when no segment is wired', () => {
    const d = must(setDisplayMode(build([['DISPLAY', 10, 0]], []), 'd1', true));
    expect(checkDiagram(d).map((i) => i.message)).toContain('顯示器 S1 的每一段都沒有接線');
  });

  it('round-trips through files, and only a display can have it', () => {
    const d = must(setDisplayMode(build([['DISPLAY', 10, 0]], []), 'd1', true));
    const back = parseLogicDiagram(JSON.parse(JSON.stringify(d)));
    expect(back.ok && back.diagram.nodes[0].segments).toBe(true);
    expect(parseLogicDiagram({ version: 1, nodes: [{ id: 'g1', kind: 'AND', x: 0, y: 0, inputs: 2, segments: true }], wires: [] })).toEqual({ ok: false, error: '元件 g1 不是顯示器，不能每段直接控制' });
  });
});
