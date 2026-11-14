import { describe, expect, it } from 'vitest';
import { addCustomNode, applyBlockEdit, blockDiagram, canUseInside, deleteBlock, renameBlock, wrapAsBlock } from '../../src/logic/customBlocks';
import { connect, removeNodes } from '../../src/logic/edit';
import { evaluate, truthTable } from '../../src/logic/evaluate';
import { blockPins, flattenDiagram } from '../../src/logic/flatten';
import { emptyDiagram, type LogicDiagram } from '../../src/logic/types';

/** 子專案 65（規格 2026-11-14 custom-blocks）：自訂方塊。 */
function halfAdder(): LogicDiagram {
  return {
    ...emptyDiagram(),
    nodes: [
      { id: 'i1', kind: 'INPUT', name: 'A', x: 0, y: 0, value: 0 },
      { id: 'i2', kind: 'INPUT', name: 'B', x: 0, y: 4, value: 0 },
      { id: 'g1', kind: 'XOR', x: 6, y: 0, inputs: 2 },
      { id: 'g2', kind: 'AND', x: 6, y: 4, inputs: 2 },
      { id: 'o1', kind: 'OUTPUT', name: 'S', x: 14, y: 1 },
      { id: 'o2', kind: 'OUTPUT', name: 'C', x: 14, y: 5 },
    ],
    wires: [
      { id: 'w1', from: 'i1', to: { node: 'g1', pin: 0 } },
      { id: 'w2', from: 'i2', to: { node: 'g1', pin: 1 } },
      { id: 'w3', from: 'i1', to: { node: 'g2', pin: 0 } },
      { id: 'w4', from: 'i2', to: { node: 'g2', pin: 1 } },
      { id: 'w5', from: 'g1', to: { node: 'o1', pin: 0 } },
      { id: 'w6', from: 'g2', to: { node: 'o2', pin: 0 } },
    ],
  };
}

const rows = (d: LogicDiagram) => {
  const t = truthTable(d);
  return t.ok ? t.rows.map((r) => r.out.join('')) : t.reason;
};
const ok = (r: { ok: boolean; diagram: LogicDiagram; reason?: string }) => {
  if (!r.ok) throw new Error(r.reason);
  return r.diagram;
};

describe('wrapAsBlock', () => {
  it('wraps two gates into a block with pins named after the inputs and outputs, and the truth table stays', () => {
    const d = halfAdder();
    const before = rows(d);
    const r = wrapAsBlock(d, ['g1', 'g2'], 'HA');
    const w = ok(r);
    expect(w.blocks).toHaveLength(1);
    const def = w.blocks![0];
    expect(def.name).toBe('HA');
    const pins = blockPins(def);
    expect(pins.inputs.map((n) => n.name)).toEqual(['A', 'B']);
    expect(pins.outputs.map((n) => n.name)).toEqual(['S', 'C']);
    const node = w.nodes.find((n) => n.kind === 'CUSTOM')!;
    expect(node).toMatchObject({ block: def.id, inputs: 2, outputs: 2 });
    expect(w.nodes.some((n) => n.id === 'g1')).toBe(false);
    expect(rows(w)).toEqual(before);
    // 輸出依名稱排序：C S。
    expect(rows(w)).toEqual(['00', '01', '01', '10']);
  });

  it('names pins I1, O1 when the outside is not an input or output terminal, and refuses terminals', () => {
    const d = halfAdder();
    expect(wrapAsBlock(d, ['i1', 'g1'])).toMatchObject({ ok: false, reason: expect.stringContaining('輸入端、輸出端留在外面') });
    expect(wrapAsBlock(d, [])).toMatchObject({ ok: false });
    expect(wrapAsBlock(d, ['g1'], '1x')).toMatchObject({ ok: false, reason: expect.stringContaining('英文字母開頭') });
    const chain: LogicDiagram = { ...d, nodes: [...d.nodes, { id: 'g3', kind: 'NOT', x: 20, y: 10 }, { id: 'g4', kind: 'NOT', x: 26, y: 10 }], wires: [...d.wires, { id: 'w7', from: 'g2', to: { node: 'g3', pin: 0 } }, { id: 'w8', from: 'g3', to: { node: 'g4', pin: 0 } }] };
    const w = ok(wrapAsBlock(chain, ['g3'], 'INV'));
    const pins = blockPins(w.blocks![0]);
    expect(pins.inputs.map((n) => n.name)).toEqual(['I1']);
    expect(pins.outputs.map((n) => n.name)).toEqual(['O1']);
    expect(wrapAsBlock(w, ['g1'], 'INV')).toMatchObject({ ok: false, reason: '已經有叫 INV 的方塊了' });
  });
});

describe('flattenDiagram', () => {
  it('expands nested blocks: a full adder from two half adders', () => {
    // 半加器方塊。
    let d = ok(wrapAsBlock(halfAdder(), ['g1', 'g2'], 'HA'));
    const ha = d.blocks![0].id;
    // 全加器：A、B、Cin；HA1(A, B)，HA2(S1, Cin)，Cout = C1 + C2。
    const fa: LogicDiagram = {
      version: 1,
      blocks: d.blocks,
      nodes: [
        { id: 'i1', kind: 'INPUT', name: 'A', x: 0, y: 0, value: 0 },
        { id: 'i2', kind: 'INPUT', name: 'B', x: 0, y: 2, value: 0 },
        { id: 'i3', kind: 'INPUT', name: 'Cin', x: 0, y: 8, value: 0 },
        { id: 'm1', kind: 'CUSTOM', block: ha, inputs: 2, outputs: 2, x: 4, y: 0 },
        { id: 'm2', kind: 'CUSTOM', block: ha, inputs: 2, outputs: 2, x: 14, y: 4 },
        { id: 'g1', kind: 'OR', inputs: 2, x: 24, y: 6 },
        { id: 'o1', kind: 'OUTPUT', name: 'S', x: 30, y: 0 },
        { id: 'o2', kind: 'OUTPUT', name: 'Cout', x: 30, y: 6 },
      ],
      wires: [
        { id: 'w1', from: 'i1', to: { node: 'm1', pin: 0 } },
        { id: 'w2', from: 'i2', to: { node: 'm1', pin: 1 } },
        { id: 'w3', from: 'm1', to: { node: 'm2', pin: 0 } },
        { id: 'w4', from: 'i3', to: { node: 'm2', pin: 1 } },
        { id: 'w5', from: 'm2', to: { node: 'o1', pin: 0 } },
        { id: 'w6', from: 'm1', fromPin: 1, to: { node: 'g1', pin: 0 } },
        { id: 'w7', from: 'm2', fromPin: 1, to: { node: 'g1', pin: 1 } },
        { id: 'w8', from: 'g1', to: { node: 'o2', pin: 0 } },
      ],
    };
    // 輸入依名稱排序：A B Cin；輸出 Cout S。
    expect(rows(fa)).toEqual(['00', '01', '01', '10', '01', '10', '10', '11']);
    // 包成全加器方塊（巢狀），再用一次。
    d = ok(wrapAsBlock(fa, ['m1', 'm2', 'g1'], 'FA'));
    expect(d.blocks!.map((b) => b.name)).toEqual(['HA', 'FA']);
    expect(rows(d)).toEqual(['00', '01', '01', '10', '01', '10', '10', '11']);
    const flat = flattenDiagram(d).diagram;
    expect(flat.nodes.filter((n) => n.kind === 'XOR')).toHaveLength(2);
    expect(flat.nodes.some((n) => n.kind === 'CUSTOM')).toBe(false);
  });

  it('leaves unconnected pins unconnected and passes an input straight to an output', () => {
    const d: LogicDiagram = {
      version: 1,
      blocks: [
        {
          id: 'p',
          name: 'PASS',
          nodes: [
            { id: 'a', kind: 'INPUT', name: 'A', x: 0, y: 0 },
            { id: 'b', kind: 'INPUT', name: 'B', x: 0, y: 2 },
            { id: 'n', kind: 'NOT', x: 4, y: 2 },
            { id: 'x', kind: 'OUTPUT', name: 'X', x: 10, y: 0 },
            { id: 'y', kind: 'OUTPUT', name: 'Y', x: 10, y: 2 },
          ],
          wires: [
            { id: 'w1', from: 'a', to: { node: 'x', pin: 0 } },
            { id: 'w2', from: 'b', to: { node: 'n', pin: 0 } },
            { id: 'w3', from: 'n', to: { node: 'y', pin: 0 } },
          ],
        },
      ],
      nodes: [
        { id: 'i1', kind: 'INPUT', name: 'A', x: 0, y: 0, value: 1 },
        { id: 'm1', kind: 'CUSTOM', block: 'p', inputs: 2, outputs: 2, x: 4, y: 0 },
        { id: 'o1', kind: 'OUTPUT', name: 'X', x: 14, y: 0 },
        { id: 'o2', kind: 'OUTPUT', name: 'Y', x: 14, y: 2 },
      ],
      wires: [
        { id: 'w1', from: 'i1', to: { node: 'm1', pin: 0 } },
        { id: 'w2', from: 'm1', to: { node: 'o1', pin: 0 } },
        { id: 'w3', from: 'm1', fromPin: 1, to: { node: 'o2', pin: 0 } },
      ],
    };
    const f = flattenDiagram(d);
    expect(f.diagram.wires.find((w) => w.to.node === 'o1')).toMatchObject({ from: 'i1' });
    expect(f.diagram.wires.some((w) => w.to.node === 'm1/n')).toBe(false);
    const v = evaluate(d);
    expect(v.nodes.get('o1')).toBe(1);
    expect(v.nodes.get('m1')).toBe(1);
    expect(v.nodes.get('m1.1')).toBe('X');
  });
});

describe('editing a block', () => {
  it('updates every use when pins change, keeping wires by pin name', () => {
    let d = ok(wrapAsBlock(halfAdder(), ['g1', 'g2'], 'HA'));
    const ha = d.blocks![0].id;
    d = ok(addCustomNode(d, ha, 0, 20));
    expect(d.nodes.filter((n) => n.kind === 'CUSTOM')).toHaveLength(2);
    // 在方塊裡：刪掉 C（輸出）和 AND，加一個輸入 Z。
    let inner = blockDiagram(d, ha)!;
    const c = inner.nodes.find((n) => n.name === 'C')!.id;
    const and = inner.nodes.find((n) => n.kind === 'AND')!.id;
    inner = removeNodes(inner, [c, and]);
    inner = { ...inner, nodes: [...inner.nodes, { id: 'pz', kind: 'INPUT', name: 'Z', x: 0, y: 20, value: 0 }] };
    const next = applyBlockEdit(d, ha, inner);
    const uses = next.nodes.filter((n) => n.kind === 'CUSTOM');
    expect(uses.map((n) => [n.inputs, n.outputs])).toEqual([
      [3, 1],
      [3, 1],
    ]);
    const first = uses.find((n) => n.y < 20)!;
    // A、B 的線還在；接到 C 的那條拿掉了。
    expect(next.wires.filter((w) => w.to.node === first.id).map((w) => w.to.pin).sort()).toEqual([0, 1]);
    expect(next.wires.filter((w) => w.from === first.id).map((w) => w.fromPin ?? 0)).toEqual([0]);
    // 外面的輸出端 C 沒接了（X），S 照舊。
    expect(rows(next)).toEqual(['X0', 'X1', 'X1', 'X0']);
  });

  it('cannot use a block inside itself, deletes unused blocks, renames', () => {
    let d = ok(wrapAsBlock(halfAdder(), ['g1', 'g2'], 'HA'));
    const ha = d.blocks![0].id;
    expect(canUseInside(d.blocks!, ha, ha)).toBe(false);
    expect(deleteBlock(d, ha)).toMatchObject({ ok: false, reason: expect.stringContaining('還有地方在用') });
    d = ok(renameBlock(d, ha, 'HALF'));
    expect(d.blocks![0].name).toBe('HALF');
    const m = d.nodes.find((n) => n.kind === 'CUSTOM')!.id;
    d = ok(deleteBlock(removeNodes(d, [m]), ha));
    expect(d.blocks).toBeUndefined();
  });

  it('can wire a block output back to its own input', () => {
    const d = ok(wrapAsBlock(halfAdder(), ['g1', 'g2'], 'HA'));
    const m = d.nodes.find((n) => n.kind === 'CUSTOM')!.id;
    expect(connect(d, m, { node: m, pin: 1 }, 1).ok).toBe(true);
  });
});

describe('reading custom blocks from files', () => {
  it('reads blocks, takes pin counts from the definition, and rejects bad ones', async () => {
    const { parseLogicDiagram } = await import('../../src/logic/file');
    const d = ok(wrapAsBlock(halfAdder(), ['g1', 'g2'], 'HA'));
    const json = JSON.parse(JSON.stringify(d));
    const r = parseLogicDiagram(json);
    if (!r.ok) throw new Error(r.error);
    expect(r.diagram.blocks).toHaveLength(1);
    expect(rows(r.diagram)).toEqual(rows(halfAdder()));
    // 腳數照定義。
    json.nodes.find((n: { kind: string }) => n.kind === 'CUSTOM').inputs = 7;
    const fixed = parseLogicDiagram(json);
    expect(fixed.ok && fixed.diagram.nodes.find((n) => n.kind === 'CUSTOM')?.inputs).toBe(2);
    const missing = { ...json, nodes: json.nodes.map((n: { kind: string }) => (n.kind === 'CUSTOM' ? { ...n, block: 'nope' } : n)) };
    expect(parseLogicDiagram(missing)).toMatchObject({ ok: false, error: expect.stringContaining('不存在的自訂方塊 nope') });
    const selfUse = JSON.parse(JSON.stringify(json));
    selfUse.blocks[0].nodes.push({ id: 'me', kind: 'CUSTOM', block: selfUse.blocks[0].id, x: 40, y: 40 });
    expect(parseLogicDiagram(selfUse)).toMatchObject({ ok: false, error: expect.stringContaining('用到自己') });
    const clock = JSON.parse(JSON.stringify(json));
    clock.blocks[0].nodes.push({ id: 'c', kind: 'CLOCK', name: 'CLK', x: 40, y: 40 });
    expect(parseLogicDiagram(clock)).toMatchObject({ ok: false, error: '方塊 HA：裡面不能放時脈或 7 段顯示器' });
    const badName = JSON.parse(JSON.stringify(json));
    badName.blocks[0].name = '半加器';
    expect(parseLogicDiagram(badName)).toMatchObject({ ok: false, error: expect.stringContaining('名稱') });
  });
});

describe('custom blocks in formulas, checks and conversion', () => {
  it('writes formulas through the block, warns about open block pins, and converts to a matching breadboard', async () => {
    const { diagramFormulas } = await import('../../src/logic/formula');
    const { checkDiagram } = await import('../../src/logic/check');
    const { convertAndRoute } = await import('../../src/logic/convertRoute');
    const { applyRouting } = await import('../../src/core/routing/apply');
    const { checkAgainstDiagram } = await import('../../src/logic/diagramCheck');
    const d = ok(wrapAsBlock(halfAdder(), ['g1', 'g2'], 'HA'));
    expect(diagramFormulas(d).outputs.map((f) => f.simplified)).toEqual(diagramFormulas(halfAdder()).outputs.map((f) => f.simplified));
    expect(checkDiagram(d)).toEqual([]);
    const m = d.nodes.find((n) => n.kind === 'CUSTOM')!.id;
    const open = { ...d, wires: d.wires.filter((w) => !(w.to.node === m && w.to.pin === 1)) };
    expect(checkDiagram(open).map((i) => i.message)).toContain(`方塊 HA（${m}）第 2 個輸入沒有接線，值不確定`);
    const r = convertAndRoute(d, { switchTo: 'vcc', board: 'auto' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.result.bom.ics).toEqual({ '74LS86': 1, '74LS08': 1 });
    expect(checkAgainstDiagram(d, applyRouting(r.result.circuit, r.routed))).toMatchObject({ kind: 'done', result: { mismatches: [] } });
  }, 120_000);
});
