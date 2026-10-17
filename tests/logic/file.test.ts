import { describe, expect, it } from 'vitest';
import { emptyCircuit, parseCircuitData, parseCircuitText, serializeCircuitFile, toCircuitFile } from '../../src/editor/fileFormat';
import { majorityDiagram } from '../../src/logic/examples';
import { parseLogicDiagram } from '../../src/logic/file';

describe('logic diagram files', () => {
  it('round-trips through the circuit file', () => {
    const logic = majorityDiagram();
    const text = serializeCircuitFile(emptyCircuit(), 'm', new Date(0), logic);
    const r = parseCircuitText(text);
    expect(r.ok && r.logic).toEqual(logic);
  });

  it('keeps old files and empty diagrams without a logic field', () => {
    const file = toCircuitFile(emptyCircuit(), 'x', new Date(0));
    expect('logic' in file).toBe(false);
    expect('logic' in toCircuitFile(emptyCircuit(), 'x', new Date(0), undefined, { version: 1, nodes: [], wires: [] })).toBe(false);
    const r = parseCircuitData(file);
    expect(r.ok && r.logic).toBeUndefined();
  });

  it('rejects broken diagrams with a reason', () => {
    const good = majorityDiagram();
    const bad = (patch: object) => parseLogicDiagram({ ...good, ...patch });
    expect(parseLogicDiagram(good)).toEqual({ ok: true, diagram: good });
    expect(bad({ version: 2 })).toMatchObject({ ok: false });
    expect(bad({ nodes: [...good.nodes, { id: 'g9', kind: 'MUX', x: 0, y: 0 }] })).toMatchObject({ ok: false, error: expect.stringContaining('MUX') });
    expect(bad({ nodes: good.nodes.map((n) => (n.id === 'g4' ? { ...n, inputs: 5 } : n)) })).toMatchObject({ ok: false });
    expect(bad({ nodes: good.nodes.map((n) => (n.id === 'i2' ? { ...n, name: 'A' } : n)) })).toMatchObject({ ok: false, error: expect.stringContaining('A') });
    expect(bad({ wires: [...good.wires, { id: 'w99', from: 'zz', to: { node: 'g1', pin: 0 } }] })).toMatchObject({ ok: false });
    expect(bad({ wires: [...good.wires, { id: 'w99', from: 'i3', to: { node: 'g1', pin: 0 } }] })).toMatchObject({ ok: false });
    expect(bad({ wires: [...good.wires, { id: 'w99', from: 'i3', to: { node: 'g1', pin: 7 } }] })).toMatchObject({ ok: false });
    expect(bad({ wires: [...good.wires, { id: 'w99', from: 'o1', to: { node: 'g1', pin: 0 } }] })).toMatchObject({ ok: false });
    const r = parseCircuitData({ ...toCircuitFile(emptyCircuit(), 'x', new Date(0)), logic: { version: 1, nodes: 'no', wires: [] } });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('邏輯圖') });
  });
});

describe('turned parts in files (sub-project 26)', () => {
  const base = (node: Record<string, unknown>) => parseLogicDiagram({ version: 1, nodes: [node], wires: [] });

  it('keeps the rotation of gates and IC blocks, and leaves 0 out', () => {
    expect(base({ id: 'g1', kind: 'AND', x: 0, y: 0, inputs: 2, rotation: 90 })).toMatchObject({ ok: true, diagram: { nodes: [{ rotation: 90 }] } });
    expect(base({ id: 'b1', kind: 'BLOCK', chip: '74LS83', x: 0, y: 0, rotation: 270 })).toMatchObject({ ok: true, diagram: { nodes: [{ rotation: 270 }] } });
    const zero = base({ id: 'g1', kind: 'AND', x: 0, y: 0, inputs: 2, rotation: 0 });
    expect(zero.ok && 'rotation' in zero.diagram.nodes[0]).toBe(false);
  });

  it('rejects other angles and parts that cannot turn', () => {
    expect(base({ id: 'g1', kind: 'AND', x: 0, y: 0, inputs: 2, rotation: 45 })).toEqual({ ok: false, error: '元件 g1 的方向 45 不合法（只能是 0、90、180、270）' });
    expect(base({ id: 'i1', kind: 'INPUT', x: 0, y: 0, name: 'A', rotation: 90 })).toEqual({ ok: false, error: '元件 i1（INPUT）不能轉向' });
  });

  it('checks overlaps with the turned box', () => {
    const d = parseLogicDiagram({
      version: 1,
      nodes: [
        { id: 'g1', kind: 'AND', x: 10, y: 20, inputs: 2, rotation: 90 },
        { id: 'g2', kind: 'AND', x: 12, y: 23, inputs: 2 },
      ],
      wires: [],
    });
    expect(d).toEqual({ ok: false, error: '元件 g1 和 g2 重疊' });
  });
});
