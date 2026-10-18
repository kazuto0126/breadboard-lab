import { describe, expect, it } from 'vitest';
import { addNode, connect, flipNodes, moveNode, removeNodes, renameNode, rotateNodes, setFlip, setGateKind, setInputCount, setInputValue, setRotation } from '../../src/logic/edit';
import { majorityDiagram } from '../../src/logic/examples';
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

describe('turning parts (sub-project 26)', () => {
  const at = (d: LogicDiagram, id: string) => d.nodes.find((n) => n.id === id)!;

  it('turns gates 90° at a time and comes back to the same place after four turns', () => {
    let d = majorityDiagram();
    const before = at(d, 'g1');
    const once = rotateNodes(d, ['g1']);
    expect(once.ok).toBe(true);
    expect(at(once.diagram, 'g1')).toMatchObject({ rotation: 90, x: before.x, y: before.y });
    for (let k = 0; k < 4; k++) {
      const r = rotateNodes(d, ['g1']);
      if (!r.ok) throw new Error(r.reason);
      d = r.diagram;
    }
    expect(at(d, 'g1')).toEqual(before);
    // 線不變（依腳的編號接）。
    expect(d.wires).toEqual(majorityDiagram().wires);
  });

  it('keeps a tall IC block centred when it turns', () => {
    let d = emptyDiagram();
    const r = addNode(d, 'BLOCK', 10, 10, '74LS83');
    if (!r.ok) throw new Error(r.reason);
    d = r.diagram;
    // 6 × 10 → 10 × 6：往左 2 格、往下 2 格，中心不動。
    expect(at(rotateNodes(d, ['b1']).diagram, 'b1')).toMatchObject({ rotation: 90, x: 8, y: 12 });
  });

  it('refuses to turn into another part, and never turns a 7-segment display', async () => {
    let d = emptyDiagram();
    for (const [x, y] of [[0, 0], [0, 3]]) {
      const r = addNode(d, 'AND', x, y);
      if (!r.ok) throw new Error(r.reason);
      d = r.diagram;
    }
    // g1 轉 90° 後佔 y 0–3，壓到 g2。
    expect(rotateNodes(d, ['g1'])).toEqual({ ok: false, diagram: d, reason: '轉向後會和別的元件重疊' });
    // 子專案 28：輸入端、輸出端、常數也能轉；只有 7 段顯示器不轉。
    const { bcdDiagram } = await import('../../src/logic/examples');
    const b = bcdDiagram();
    expect(rotateNodes(b, ['d1'])).toEqual({ ok: false, diagram: b, reason: '7 段顯示器不能轉向' });
    const mixed = rotateNodes(b, ['d1', 'i1']);
    expect([at(mixed.diagram, 'd1').rotation, at(mixed.diagram, 'i1').rotation]).toEqual([undefined, 90]);
  });

  it('sets a direction directly, leaving 0 out of the data', () => {
    const d = majorityDiagram();
    const half = setRotation(d, 'g1', 180);
    expect(at(half.diagram, 'g1')).toMatchObject({ rotation: 180, x: at(d, 'g1').x, y: at(d, 'g1').y });
    const back = setRotation(half.diagram, 'g1', 0);
    expect(at(back.diagram, 'g1')).toEqual(at(d, 'g1'));
    expect(at(setRotation(d, 'i1', 90).diagram, 'i1').rotation).toBe(90);
  });
});

describe('mirroring and placing turned parts (sub-project 28)', () => {
  const at = (d: LogicDiagram, id: string) => d.nodes.find((n) => n.id === id)!;

  it('mirrors in place, keeps the mirror when turning, and mirrors back', () => {
    const d = majorityDiagram();
    const once = flipNodes(d, ['g1']);
    expect(at(once.diagram, 'g1')).toMatchObject({ flip: true, x: at(d, 'g1').x, y: at(d, 'g1').y });
    expect(at(rotateNodes(once.diagram, ['g1']).diagram, 'g1')).toMatchObject({ flip: true, rotation: 90 });
    expect(at(flipNodes(once.diagram, ['g1']).diagram, 'g1')).toEqual(at(d, 'g1'));
    expect(setFlip(d, 'g1', true).diagram).toEqual(once.diagram);
  });

  it('places a part already turned and mirrored', () => {
    const r = addNode(emptyDiagram(), 'AND', 4, 4, undefined, { rotation: 90, flip: true });
    expect(r.ok && r.diagram.nodes[0]).toMatchObject({ kind: 'AND', rotation: 90, flip: true });
    // 7 段顯示器不轉：放下去就是沒轉的。
    const s = addNode(emptyDiagram(), 'DISPLAY', 4, 4, undefined, { rotation: 90 });
    expect(s.ok && 'rotation' in s.diagram.nodes[0]).toBe(false);
  });
});
