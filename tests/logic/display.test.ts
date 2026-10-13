import { describe, expect, it } from 'vitest';
import { addNode, connect, renameNode } from '../../src/logic/edit';
import { parseLogicDiagram } from '../../src/logic/file';
import { inputCountOf, inputPins, nodeSize, outputPin } from '../../src/logic/shapes';
import { emptyDiagram, isGate, isSink, type LogicDiagram } from '../../src/logic/types';

const ok = (r: { ok: boolean; diagram: LogicDiagram }) => {
  expect(r.ok).toBe(true);
  return r.diagram;
};

describe('7-segment display node', () => {
  it('has 4 inputs placed like a 4-input gate and no output', () => {
    const node = { id: 'd1', kind: 'DISPLAY' as const, x: 10, y: 2, name: 'S1' };
    expect(isGate('DISPLAY')).toBe(false);
    expect(isSink('DISPLAY')).toBe(true);
    expect(isSink('OUTPUT')).toBe(true);
    expect(isSink('AND')).toBe(false);
    expect(inputCountOf(node)).toBe(4);
    expect(nodeSize(node)).toEqual({ w: 4, h: 5 });
    expect(inputPins(node).map((p) => p.y)).toEqual([2, 3, 5, 6]);
    expect(outputPin(node)).toBeNull();
  });

  it('is named S1, S2… and cannot drive anything', () => {
    let d = emptyDiagram();
    d = ok(addNode(d, 'INPUT', 0, 0));
    d = ok(addNode(d, 'DISPLAY', 6, 0));
    d = ok(addNode(d, 'DISPLAY', 12, 0));
    expect(d.nodes.slice(1).map((n) => [n.id, n.name])).toEqual([['d1', 'S1'], ['d2', 'S2']]);
    d = ok(connect(d, 'i1', { node: 'd1', pin: 3 }));
    expect(connect(d, 'd1', { node: 'd2', pin: 0 })).toMatchObject({ ok: false, reason: '顯示器沒有可以接出去的腳' });
    expect(connect(d, 'i1', { node: 'd1', pin: 4 }).ok).toBe(false);
    expect(renameNode(d, 'd1', 'HEX').ok).toBe(true);
  });

  it('round-trips through the file format and rejects wires from a display', () => {
    const raw = {
      version: 1,
      nodes: [
        { id: 'i1', kind: 'INPUT', x: 0, y: 0, name: 'A', value: 1 },
        { id: 'd1', kind: 'DISPLAY', x: 6, y: 0, name: 'S1' },
        { id: 'o1', kind: 'OUTPUT', x: 14, y: 0, name: 'X' },
      ],
      wires: [{ id: 'w1', from: 'i1', to: { node: 'd1', pin: 0 } }],
    };
    const r = parseLogicDiagram(raw);
    expect(r.ok && r.diagram.nodes[1]).toEqual({ id: 'd1', kind: 'DISPLAY', x: 6, y: 0, name: 'S1' });
    const bad = parseLogicDiagram({ ...raw, wires: [{ id: 'w1', from: 'd1', to: { node: 'o1', pin: 0 } }] });
    expect(bad).toEqual({ ok: false, error: '線 w1 的方向不對' });
    expect(parseLogicDiagram({ ...raw, nodes: [{ id: 'd1', kind: 'DISPLAY', x: 6, y: 0, name: '1x' }], wires: [] }).ok).toBe(false);
  });
});
