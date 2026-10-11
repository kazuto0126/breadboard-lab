import { describe, expect, it } from 'vitest';
import { addNode, connect, moveNode, removeNodes, renameNode, setGateKind, setInputCount, setInputValue } from '../../src/logic/edit';
import { emptyDiagram, type LogicDiagram } from '../../src/logic/types';

const ok = (r: { ok: boolean; diagram: LogicDiagram }) => {
  expect(r.ok).toBe(true);
  return r.diagram;
};

function build() {
  let d = emptyDiagram();
  d = ok(addNode(d, 'INPUT', 0, 0)); // i1 A
  d = ok(addNode(d, 'INPUT', 0, 4)); // i2 B
  d = ok(addNode(d, 'AND', 6, 0)); // g1
  d = ok(addNode(d, 'OUTPUT', 14, 1)); // o1 X
  return d;
}

describe('editing a logic diagram', () => {
  it('names inputs A, B… and outputs X, Y…, and numbers ids', () => {
    const d = build();
    expect(d.nodes.map((n) => [n.id, n.name ?? n.kind])).toEqual([['i1', 'A'], ['i2', 'B'], ['g1', 'AND'], ['o1', 'X']]);
    expect(d.nodes.find((n) => n.id === 'g1')!.inputs).toBe(2);
    expect(d.nodes.find((n) => n.id === 'i1')!.value).toBe(0);
  });

  it('refuses overlapping parts and moves', () => {
    const d = build();
    expect(addNode(d, 'OR', 7, 1)).toMatchObject({ ok: false, reason: '這裡已經有元件了' });
    expect(moveNode(d, 'g1', 1, 0).ok).toBe(false);
    expect(ok(moveNode(d, 'g1', 6, 6)).nodes.find((n) => n.id === 'g1')).toMatchObject({ x: 6, y: 6 });
  });

  it('connects outputs to inputs, replaces an input’s old wire and refuses wrong directions', () => {
    let d = build();
    d = ok(connect(d, 'i1', { node: 'g1', pin: 0 }));
    d = ok(connect(d, 'i2', { node: 'g1', pin: 1 }));
    d = ok(connect(d, 'g1', { node: 'o1', pin: 0 }));
    d = ok(connect(d, 'i1', { node: 'g1', pin: 1 })); // 取代 i2 → g1.1
    expect(d.wires.map((w) => `${w.from}->${w.to.node}.${w.to.pin}`)).toEqual(['i1->g1.0', 'g1->o1.0', 'i1->g1.1']);
    expect(connect(d, 'o1', { node: 'g1', pin: 0 }).ok).toBe(false); // 輸出端沒有輸出
    expect(connect(d, 'i1', { node: 'i2', pin: 0 }).ok).toBe(false); // 輸入端沒有輸入
    expect(connect(d, 'g1', { node: 'g1', pin: 0 }).ok).toBe(false); // 自己接自己
    expect(connect(d, 'i1', { node: 'g1', pin: 5 }).ok).toBe(false); // 沒有這個腳
  });

  it('changes gate kind and input count, dropping wires on removed pins', () => {
    let d = build();
    d = ok(setInputCount(d, 'g1', 4));
    d = ok(connect(d, 'i1', { node: 'g1', pin: 0 }));
    d = ok(connect(d, 'i2', { node: 'g1', pin: 3 }));
    d = ok(setInputCount(d, 'g1', 2));
    expect(d.wires.map((w) => w.to.pin)).toEqual([0]);
    d = ok(setGateKind(d, 'g1', 'NOT'));
    expect(d.nodes.find((n) => n.id === 'g1')).toMatchObject({ kind: 'NOT', inputs: 1 });
    expect(d.wires.map((w) => w.to.pin)).toEqual([0]);
    d = ok(setGateKind(d, 'g1', 'OR'));
    expect(d.nodes.find((n) => n.id === 'g1')).toMatchObject({ kind: 'OR', inputs: 2 });
    expect(setInputCount(d, 'g1', 5).ok).toBe(false);
    expect(setGateKind(d, 'g1', 'XOR').ok).toBe(true);
    expect(setInputCount(ok(setGateKind(d, 'g1', 'XOR')), 'g1', 3).ok).toBe(false);
  });

  it('refuses a gate change that would overlap its neighbour', () => {
    let d = build();
    d = ok(addNode(d, 'OR', 6, 3)); // 緊貼在 g1 下面
    expect(setInputCount(d, 'g1', 4)).toMatchObject({ ok: false, reason: '改成 4 個輸入會和旁邊的元件重疊' });
  });

  it('checks names and keeps switch values', () => {
    const d = build();
    expect(renameNode(d, 'i1', 'B')).toMatchObject({ ok: false, reason: '名稱 B 已經用過了' });
    expect(renameNode(d, 'i1', '1A').ok).toBe(false);
    expect(renameNode(d, 'i1', '').ok).toBe(false);
    expect(renameNode(d, 'i1', 'ABCDEFGHI').ok).toBe(false);
    expect(ok(renameNode(d, 'i1', ' Cin ')).nodes[0].name).toBe('Cin');
    expect(renameNode(d, 'g1', 'Q').ok).toBe(false);
    expect(setInputValue(d, 'i1', 1).nodes[0].value).toBe(1);
  });

  it('removes nodes with their wires', () => {
    let d = build();
    d = ok(connect(d, 'i1', { node: 'g1', pin: 0 }));
    d = ok(connect(d, 'g1', { node: 'o1', pin: 0 }));
    d = removeNodes(d, ['g1']);
    expect(d.nodes.map((n) => n.id)).toEqual(['i1', 'i2', 'o1']);
    expect(d.wires).toEqual([]);
    expect(ok(addNode(d, 'AND', 6, 0)).nodes.at(-1)!.id).toBe('g1');
  });
});
