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

/** 一個方塊，每個輸入腳接 5V（1）或 GND（0）；bits 依 BLOCK_PINS 的輸入順序，null 表示不接。 */
function wired(chip: Parameters<typeof addNode>[4], bits: Array<0 | 1 | null>) {
  let d = emptyDiagram();
  d = ok(addNode(d, 'HIGH', 0, 0)); // k1
  d = ok(addNode(d, 'LOW', 0, 2)); // k2
  d = ok(addNode(d, 'BLOCK', 6, 0, chip)); // b1
  bits.forEach((b, pin) => {
    if (b !== null) d = ok(connect(d, b === 1 ? 'k1' : 'k2', { node: 'b1', pin }));
  });
  return d;
}

describe('evaluating blocks', () => {
  const outs = async (d: LogicDiagram, n: number) => {
    const { evaluate } = await import('../../src/logic/evaluate');
    const v = evaluate(d).nodes;
    return Array.from({ length: n }, (_, k) => v.get(signalOf('b1', k)));
  };

  it('adds with the 74LS83', async () => {
    // A = 3（A1 A2 = 1）、B = 1（B1 = 1）、C0 = 0 → S = 4（S3 = 1）、C4 = 0
    expect(await outs(wired('74LS83', [1, 1, 0, 0, 1, 0, 0, 0, 0]), 5)).toEqual([0, 0, 1, 0, 0]);
    // 15 + 1 + 1 = 17 → S = 0001、C4 = 1
    expect(await outs(wired('74LS83', [1, 1, 1, 1, 1, 0, 0, 0, 1]), 5)).toEqual([1, 0, 0, 0, 1]);
  });

  it('selects with the 74LS151 and decodes with the 74LS138', async () => {
    // C B A = 1 0 1 → D5；D5 = 1，其他 0，/G = 0 → Y = 1、W = 0
    expect(await outs(wired('74LS151', [0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0]), 2)).toEqual([1, 0]);
    // /G = 1：Y = 0
    expect(await outs(wired('74LS151', [0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 1]), 2)).toEqual([0, 1]);
    // A = 1、B = 1、C = 0，G1 = 1、/G2A = /G2B = 0 → 只有 /Y3 = 0
    expect(await outs(wired('74LS138', [1, 1, 0, 1, 0, 0]), 8)).toEqual([1, 1, 1, 0, 1, 1, 1, 1]);
  });

  it('compares with the 74LS85 and gives X when an input is open', async () => {
    // A = 5（A0 A2）、B = 3（B0 B1），IA=B = 1 → OA>B
    expect(await outs(wired('74LS85', [1, 0, 1, 0, 1, 1, 0, 0, 0, 1, 0]), 3)).toEqual([0, 0, 1]);
    expect(await outs(wired('74LS83', [1, 1, 0, 0, 1, 0, 0, 0, null]), 5)).toEqual(['X', 'X', 'X', 'X', 'X']);
  });

  it('checks open block pins and unused constants and blocks', async () => {
    const { checkDiagram } = await import('../../src/logic/check');
    const msgs = checkDiagram(wired('74LS83', [1, 1, 0, 0, 1, 0, 0, 0, null])).map((i) => i.message);
    expect(msgs).toContain('方塊 b1（74LS83）的 C0 腳沒有接線，值不確定');
    expect(msgs).toContain('方塊 b1（74LS83）的輸出沒有接到任何地方');
    let d = emptyDiagram();
    d = ok(addNode(d, 'HIGH', 0, 0));
    expect(checkDiagram(d).map((i) => i.message)).toEqual(['5V k1 沒有接到任何地方']);
  });
});

describe('drawing wires from block outputs', () => {
  it('starts each wire at its own output pin with its own bus column', async () => {
    const { busColumns, wireRoute } = await import('../../src/logic/wiring');
    let d = wired('74LS83', [1, 1, 0, 0, 1, 0, 0, 0, 0]);
    d = ok(addNode(d, 'OUTPUT', 20, 0)); // o1
    d = ok(addNode(d, 'OUTPUT', 20, 6)); // o2
    d = ok(connect(d, 'b1', { node: 'o1', pin: 0 }, 0));
    d = ok(connect(d, 'b1', { node: 'o2', pin: 0 }, 4));
    const cols = busColumns(d);
    expect(cols.get('b1')).toBe(13);
    expect(cols.get('b1.4')).toBe(14);
    const w2 = d.wires.find((w) => w.to.node === 'o2')!;
    expect(wireRoute(d, w2, cols)[0]).toEqual({ x: 12, y: 4 });
  });
});

describe('converting blocks and constants to the breadboard', () => {
  /** 2 位元加法：A1 A2、B1 B2 是輸入端，A3 A4 B3 B4 C0 接 GND，S1 S2 S3 接 LED。 */
  async function adder() {
    let d = emptyDiagram();
    for (const [k, y] of [0, 2, 4, 6].entries()) d = ok(addNode(d, 'INPUT', 0, y + k * 0)); // i1–i4：A B C D
    d = ok(addNode(d, 'LOW', 0, 10)); // k1
    d = ok(addNode(d, 'BLOCK', 8, 0, '74LS83')); // b1
    for (let k = 0; k < 3; k++) d = ok(addNode(d, 'OUTPUT', 20, k * 2)); // o1–o3
    const links: Array<[string, number]> = [['i1', 0], ['i2', 1], ['k1', 2], ['k1', 3], ['i3', 4], ['i4', 5], ['k1', 6], ['k1', 7], ['k1', 8]];
    for (const [from, pin] of links) d = ok(connect(d, from, { node: 'b1', pin }));
    for (let k = 0; k < 3; k++) d = ok(connect(d, 'b1', { node: `o${k + 1}`, pin: 0 }, k));
    return d;
  }

  it('places the chip, ties constants to the rails and leaves unused outputs open', async () => {
    const { toBreadboard } = await import('../../src/logic/toBreadboard');
    const r = toBreadboard(await adder(), { switchTo: 'vcc', board: 'auto' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.bom.ics).toEqual({ '74LS83': 1 });
    const u = r.circuit.components.find((c) => c.defId === '74LS83')!;
    const pin = (name: string) => [`${u.id}#${{ A1: 10, A2: 8, A3: 3, A4: 1, B1: 11, B2: 7, B3: 4, B4: 16, C0: 13, S1: 9, S2: 6, S3: 2, S4: 15, C4: 14 }[name]}`];
    const net = (name: string) => r.netOf[pin(name)[0]];
    expect(['A1', 'A2', 'B1', 'B2'].map(net)).toEqual(['i1', 'i2', 'i3', 'i4']);
    expect(['A3', 'A4', 'B3', 'B4', 'C0'].map(net)).toEqual(['GND', 'GND', 'GND', 'GND', 'GND']);
    expect(['S1', 'S2', 'S3'].map(net)).toEqual(['b1', 'b1.1', 'b1.2']);
    expect(r.netOf[`${u.id}#5`]).toBe('VCC');
    expect(r.netOf[`${u.id}#12`]).toBe('GND');
  });

  it('matches the truth table on the breadboard, also in NAND-only mode', async () => {
    const { toBreadboard } = await import('../../src/logic/toBreadboard');
    const { verifyBreadboard } = await import('../../src/logic/verifyBreadboard');
    const d = await adder();
    for (const gates of ['direct', 'nand'] as const) {
      const r = toBreadboard(d, { switchTo: 'gnd', board: 'auto', gates });
      if (!r.ok) throw new Error(r.reason);
      expect(r.bom.ics).toEqual({ '74LS83': 1 });
      expect(verifyBreadboard(d, r.circuit, 'gnd', r)).toEqual({ rows: 16, mismatches: [] });
    }
  });

  it('refuses a block with an open input', async () => {
    const { convertProblem } = await import('../../src/logic/synth');
    const d = await adder();
    const open = { ...d, wires: d.wires.filter((w) => !(w.to.node === 'b1' && w.to.pin === 8)) };
    expect(convertProblem(open)).toMatch(/還有沒接好的腳/);
  });
});
