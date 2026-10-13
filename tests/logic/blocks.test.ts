import { describe, expect, it } from 'vitest';
import { BLOCK_CHIPS, BLOCK_PINS } from '../../src/logic/blocks';
import { addNode, connect, copyNodes, pasteNodes } from '../../src/logic/edit';
import { parseLogicDiagram } from '../../src/logic/file';
import { inputCountOf, inputPins, nodeSize, outputCountOf, outputPin, outputPins } from '../../src/logic/shapes';
import { emptyDiagram, isGate, isSink, isSource, signalOf, type LogicDiagram } from '../../src/logic/types';

const ok = (r: { ok: boolean; diagram: LogicDiagram }) => {
  expect(r.ok).toBe(true);
  return r.diagram;
};

describe('IC blocks and constants: data and shapes', () => {
  it('lists the pins of every chip in a tidy order', () => {
    expect(BLOCK_CHIPS).toEqual(['74LS83', '74LS151', '74LS153', '74LS138', '74LS85']);
    expect(BLOCK_PINS['74LS83']).toEqual({ inputs: ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'C0'], outputs: ['S1', 'S2', 'S3', 'S4', 'C4'] });
    expect(BLOCK_PINS['74LS138'].outputs).toEqual(['/Y0', '/Y1', '/Y2', '/Y3', '/Y4', '/Y5', '/Y6', '/Y7']);
  });

  it('places block pins on both sides, and constants have one output', () => {
    const block = { id: 'b1', kind: 'BLOCK' as const, x: 10, y: 2, chip: '74LS83' as const };
    expect(inputCountOf(block)).toBe(9);
    expect(outputCountOf(block)).toBe(5);
    expect(nodeSize(block)).toEqual({ w: 6, h: 10 });
    expect(inputPins(block)[0]).toEqual({ x: 10, y: 2 });
    expect(inputPins(block)[8]).toEqual({ x: 10, y: 10 });
    expect(outputPins(block)[4]).toEqual({ x: 16, y: 6 });
    expect(outputPin(block)).toEqual({ x: 16, y: 2 });
    const high = { id: 'k1', kind: 'HIGH' as const, x: 0, y: 0 };
    expect([inputCountOf(high), outputCountOf(high), nodeSize(high)]).toEqual([0, 1, { w: 2, h: 1 }]);
    expect(outputPin(high)).toEqual({ x: 2, y: 0 });
    expect([isGate('BLOCK'), isGate('HIGH'), isSink('BLOCK'), isSource('LOW'), isSource('INPUT'), isSource('BLOCK')]).toEqual([false, false, false, true, true, false]);
    expect([signalOf('g1', 0), signalOf('b1', undefined), signalOf('b1', 3)]).toEqual(['g1', 'b1', 'b1.3']);
  });
});

describe('editing blocks and constants', () => {
  it('adds them with their own ids and connects from any block output', () => {
    let d = emptyDiagram();
    d = ok(addNode(d, 'HIGH', 0, 0));
    d = ok(addNode(d, 'LOW', 0, 2));
    d = ok(addNode(d, 'BLOCK', 6, 0, '74LS83'));
    d = ok(addNode(d, 'OUTPUT', 16, 0));
    expect(d.nodes.map((n) => [n.id, n.kind, n.chip ?? n.name ?? null])).toEqual([
      ['k1', 'HIGH', null],
      ['k2', 'LOW', null],
      ['b1', 'BLOCK', '74LS83'],
      ['o1', 'OUTPUT', 'X'],
    ]);
    expect(addNode(d, 'BLOCK', 30, 0).ok).toBe(false); // 沒有指定 IC
    d = ok(connect(d, 'k1', { node: 'b1', pin: 8 }));
    d = ok(connect(d, 'b1', { node: 'o1', pin: 0 }, 4));
    expect(d.wires.at(-1)).toMatchObject({ from: 'b1', fromPin: 4 });
    expect(d.wires[0]).not.toHaveProperty('fromPin');
    expect(connect(d, 'b1', { node: 'o1', pin: 0 }, 5).ok).toBe(false); // 74LS83 只有 5 個輸出
    expect(connect(d, 'k2', { node: 'k1', pin: 0 }).ok).toBe(false); // 常數沒有輸入腳
    const clip = copyNodes(d, ['b1', 'o1']);
    const pasted = pasteNodes(d, clip);
    expect(pasted.ok && pasted.diagram.wires.at(-1)).toMatchObject({ from: 'b2', fromPin: 4 });
  });

  it('reads blocks, constants and fromPin from files, and rejects bad ones', () => {
    const raw = {
      version: 1,
      nodes: [
        { id: 'k1', kind: 'HIGH', x: 0, y: 0 },
        { id: 'b1', kind: 'BLOCK', x: 6, y: 0, chip: '74LS151' },
        { id: 'o1', kind: 'OUTPUT', x: 16, y: 0, name: 'Y' },
      ],
      wires: [
        { id: 'w1', from: 'k1', to: { node: 'b1', pin: 0 } },
        { id: 'w2', from: 'b1', fromPin: 1, to: { node: 'o1', pin: 0 } },
      ],
    };
    const r = parseLogicDiagram(raw);
    expect(r.ok && r.diagram.nodes.map((n) => n.chip ?? n.kind)).toEqual(['HIGH', '74LS151', 'OUTPUT']);
    expect(r.ok && r.diagram.wires[1]).toEqual({ id: 'w2', from: 'b1', fromPin: 1, to: { node: 'o1', pin: 0 } });
    expect(parseLogicDiagram({ ...raw, nodes: [{ ...raw.nodes[0] }, { ...raw.nodes[1], chip: '74LS999' }, raw.nodes[2]] })).toMatchObject({ ok: false, error: expect.stringContaining('IC') });
    expect(parseLogicDiagram({ ...raw, wires: [raw.wires[0], { ...raw.wires[1], fromPin: 2 }] })).toMatchObject({ ok: false, error: expect.stringContaining('輸出腳') });
  });
});
