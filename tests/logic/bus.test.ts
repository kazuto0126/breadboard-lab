import { describe, expect, it } from 'vitest';
import { applyBlockEdit, blockDiagram, wrapAsBlock } from '../../src/logic/customBlocks';
import { addNode, connect, setBusWidth } from '../../src/logic/edit';
import { evaluate, truthTable } from '../../src/logic/evaluate';
import { blockPins } from '../../src/logic/flatten';
import { blockPinGroups } from '../../src/logic/pins';
import { emptyDiagram, type CustomBlock, type LogicDiagram, type LogicNode, type LogicWire } from '../../src/logic/types';

/** 子專案 66（規格 2026-11-14 bus）：匯流排。 */
const ok = (r: { ok: boolean; diagram: LogicDiagram; reason?: string }) => {
  if (!r.ok) throw new Error(r.reason);
  return r.diagram;
};
const rows = (d: LogicDiagram) => {
  const t = truthTable(d);
  return t.ok ? t.rows.map((r) => r.out.join('')) : t.reason;
};
const input = (id: string, name: string, y: number, x = 0): LogicNode => ({ id, kind: 'INPUT', name, x, y, value: 0 });
const output = (id: string, name: string, y: number, x = 30): LogicNode => ({ id, kind: 'OUTPUT', name, x, y });
const wire = (id: string, from: string, node: string, pin = 0, fromPin = 0): LogicWire => ({ id, from, ...(fromPin ? { fromPin } : {}), to: { node, pin } });

describe('pin groups', () => {
  const pins = (names: string[], busPins = true) =>
    blockPinGroups({ busPins: busPins ? true : undefined, nodes: names.map((n, k) => input(`i${k}`, n, k * 2)) }).inputs.map((g) => g.label);
  it('joins A0–A3 into A[3:0] only when the numbers are 0…n−1 and the block allows it', () => {
    expect(pins(['A0', 'A1', 'A2', 'A3', 'Cin'])).toEqual(['A[3:0]', 'Cin']);
    expect(pins(['A1', 'A2'])).toEqual(['A1', 'A2']);
    expect(pins(['A0', 'A1'], false)).toEqual(['A0', 'A1']);
    expect(pins(['A', 'A0', 'A1'])).toEqual(['A', 'A0', 'A1']);
    expect(pins(['B0'])).toEqual(['B0']);
  });
});

/** A、B、C、D → 合起來 → 拆開 → W、X、Y、Z（直通）。 */
function passThrough(): LogicDiagram {
  return {
    version: 1,
    nodes: [
      input('a', 'A', 0),
      input('b', 'B', 1),
      input('c', 'C', 2),
      input('d', 'D', 3),
      { id: 'm', kind: 'MERGE', width: 4, x: 6, y: 0 },
      { id: 's', kind: 'SPLIT', width: 4, x: 14, y: 0 },
      output('w', 'W', 0),
      output('x', 'X', 1),
      output('y', 'Y', 2),
      output('z', 'Z', 3),
    ],
    wires: [wire('w1', 'a', 'm', 0), wire('w2', 'b', 'm', 1), wire('w3', 'c', 'm', 2), wire('w4', 'd', 'm', 3), wire('w5', 'm', 's'), wire('w6', 's', 'w', 0, 0), wire('w7', 's', 'x', 0, 1), wire('w8', 's', 'y', 0, 2), wire('w9', 's', 'z', 0, 3)],
  };
}

describe('merge and split', () => {
  it('passes each bit through and shows the bus value', () => {
    const d = passThrough();
    const t = rows(d) as string[];
    expect(t).toHaveLength(16);
    t.forEach((r, i) => expect(r).toBe(i.toString(2).padStart(4, '0')));
    const v = evaluate({ ...d, nodes: d.nodes.map((n) => (n.id === 'a' || n.id === 'c' ? { ...n, value: 1 as const } : n)) });
    expect([0, 1, 2, 3].map((k) => v.nodes.get(`m[${k}]`))).toEqual([1, 0, 1, 0]);
  });

  it('refuses a bus to a one-bit pin and drops wires that no longer fit when the width changes', () => {
    const d = passThrough();
    expect(connect(d, 'm', { node: 'w', pin: 0 })).toMatchObject({ ok: false, reason: '4 位元的匯流排只能接到 4 位元的腳' });
    expect(connect(d, 'a', { node: 's', pin: 0 })).toMatchObject({ ok: false, reason: expect.stringContaining('合起來') });
    const narrow = ok(setBusWidth(d, 's', 2));
    // 4 位元的匯流排接不到 2 位元的拆開；拆開的第 3、4 個輸出也不見了。
    expect(narrow.wires.some((w) => w.to.node === 's')).toBe(false);
    expect(narrow.wires.filter((w) => w.from === 's')).toHaveLength(2);
    expect(addNode(emptyDiagram(), 'MERGE', 0, 0)).toMatchObject({ ok: true, diagram: { nodes: [{ kind: 'MERGE', width: 4 }] } });
  });

  it('reads merge and split from files and rejects mismatched widths', async () => {
    const { parseLogicDiagram } = await import('../../src/logic/file');
    expect(parseLogicDiagram(passThrough())).toMatchObject({ ok: true });
    // 合起來改成 3 位元（拿掉第 4 位的線）：3 位元的匯流排接到 4 位元的拆開。
    const bad = { ...passThrough(), nodes: passThrough().nodes.map((n) => (n.id === 'm' ? { ...n, width: 3 } : n)), wires: passThrough().wires.filter((w) => w.id !== 'w4') };
    expect(parseLogicDiagram(bad)).toMatchObject({ ok: false, error: expect.stringContaining('位元數不一樣') });
    expect(parseLogicDiagram({ ...passThrough(), nodes: passThrough().nodes.map((n) => (n.id === 's' ? { ...n, width: 9 } : n)) })).toMatchObject({ ok: false, error: expect.stringContaining('位元數') });
  });
});

/** 全加器方塊（A、B、Cin → S、Cout），單位元腳。 */
const fullAdder: CustomBlock = {
  id: 'fa',
  name: 'FA',
  busPins: true,
  nodes: [
    input('a', 'A', 0),
    input('b', 'B', 2),
    input('c', 'Cin', 4),
    { id: 'x1', kind: 'XOR', inputs: 2, x: 4, y: 0 },
    { id: 'x2', kind: 'XOR', inputs: 2, x: 10, y: 0 },
    { id: 'n1', kind: 'AND', inputs: 2, x: 4, y: 6 },
    { id: 'n2', kind: 'AND', inputs: 2, x: 10, y: 6 },
    { id: 'o', kind: 'OR', inputs: 2, x: 16, y: 6 },
    output('s', 'S', 0, 22),
    output('co', 'Cout', 7, 22),
  ],
  wires: [
    wire('w1', 'a', 'x1', 0),
    wire('w2', 'b', 'x1', 1),
    wire('w3', 'x1', 'x2', 0),
    wire('w4', 'c', 'x2', 1),
    wire('w5', 'x2', 's'),
    wire('w6', 'a', 'n1', 0),
    wire('w7', 'b', 'n1', 1),
    wire('w8', 'x1', 'n2', 0),
    wire('w9', 'c', 'n2', 1),
    wire('w10', 'n1', 'o', 0),
    wire('w11', 'n2', 'o', 1),
    wire('w12', 'o', 'co'),
  ],
};

/** 4 位元加法器方塊：A0–A3、B0–B3 → S0–S3、Cout（裡面 4 個全加器串起來）。 */
const adder4: CustomBlock = {
  id: 'add4',
  name: 'ADD4',
  busPins: true,
  nodes: [
    ...[0, 1, 2, 3].map((k) => input(`a${k}`, `A${k}`, k * 8)),
    ...[0, 1, 2, 3].map((k) => input(`b${k}`, `B${k}`, k * 8 + 2)),
    { id: 'zero', kind: 'LOW', x: 0, y: 40 },
    ...[0, 1, 2, 3].map((k): LogicNode => ({ id: `f${k}`, kind: 'CUSTOM', block: 'fa', inputs: 3, outputs: 2, x: 8, y: k * 8 })),
    ...[0, 1, 2, 3].map((k) => output(`s${k}`, `S${k}`, k * 8, 20)),
    output('co', 'Cout', 34, 20),
  ],
  wires: [
    ...[0, 1, 2, 3].flatMap((k) => [
      wire(`wa${k}`, `a${k}`, `f${k}`, 0),
      wire(`wb${k}`, `b${k}`, `f${k}`, 1),
      wire(`wc${k}`, k === 0 ? 'zero' : `f${k - 1}`, `f${k}`, 2, k === 0 ? 0 : 1),
      wire(`ws${k}`, `f${k}`, `s${k}`),
    ]),
    wire('wco', 'f3', 'co', 0, 1),
  ],
};

describe('a 4-bit adder with buses', () => {
  it('adds two 4-bit buses through nested blocks', () => {
    expect(blockPins(adder4).inputs.map((p) => p.name)).toEqual(['A[3:0]', 'B[3:0]']);
    expect(blockPins(adder4).outputs.map((p) => p.name)).toEqual(['S[3:0]', 'Cout']);
    // 主圖：8 個一位元輸入 → 兩個合起來 → ADD4 → 拆開 → 5 個輸出。
    const names = ['X0', 'X1', 'X2', 'X3', 'Y0', 'Y1', 'Y2', 'Y3'];
    const d: LogicDiagram = {
      version: 1,
      blocks: [fullAdder, adder4],
      nodes: [
        ...names.map((n, k) => input(`i${k}`, n, k * 2)),
        { id: 'ma', kind: 'MERGE', width: 4, x: 6, y: 0 },
        { id: 'mb', kind: 'MERGE', width: 4, x: 6, y: 8 },
        { id: 'add', kind: 'CUSTOM', block: 'add4', inputs: 2, outputs: 2, x: 12, y: 0 },
        { id: 'sp', kind: 'SPLIT', width: 4, x: 22, y: 0 },
        ...[0, 1, 2, 3].map((k) => output(`o${k}`, `Z${k}`, k * 2)),
        output('oc', 'Z4', 10),
      ],
      wires: [
        ...[0, 1, 2, 3].map((k) => wire(`wx${k}`, `i${k}`, 'ma', k)),
        ...[0, 1, 2, 3].map((k) => wire(`wy${k}`, `i${k + 4}`, 'mb', k)),
        wire('w1', 'ma', 'add', 0),
        wire('w2', 'mb', 'add', 1),
        wire('w3', 'add', 'sp'),
        ...[0, 1, 2, 3].map((k) => wire(`wz${k}`, 'sp', `o${k}`, 0, k)),
        wire('wc', 'add', 'oc', 0, 1),
      ],
    };
    const t = truthTable(d);
    if (!t.ok) throw new Error(t.reason);
    expect(t.rows).toHaveLength(256);
    // 輸入依名稱排序：X0 X1 X2 X3 Y0…（X0 是最高位元）；輸出 Z0…Z4。
    for (const r of t.rows) {
      const x = r.in[0] + 2 * r.in[1] + 4 * r.in[2] + 8 * r.in[3];
      const y = r.in[4] + 2 * r.in[5] + 4 * r.in[6] + 8 * r.in[7];
      const z = (r.out as number[]).reduce((sum, b, k) => sum + b * 2 ** k, 0);
      expect(z).toBe(x + y);
    }
  });
});

describe('wrapping with bus pins', () => {
  it('adds a merge for A0, A1 and a split for S0, S1, and the truth table stays', () => {
    const d: LogicDiagram = {
      version: 1,
      nodes: [input('a0', 'A0', 0), input('a1', 'A1', 2), input('b0', 'B0', 4), input('b1', 'B1', 6), { id: 'g1', kind: 'XOR', inputs: 2, x: 6, y: 0 }, { id: 'g2', kind: 'XOR', inputs: 2, x: 6, y: 4 }, output('s0', 'S0', 0, 14), output('s1', 'S1', 4, 14)],
      wires: [wire('w1', 'a0', 'g1', 0), wire('w2', 'b0', 'g1', 1), wire('w3', 'a1', 'g2', 0), wire('w4', 'b1', 'g2', 1), wire('w5', 'g1', 's0'), wire('w6', 'g2', 's1')],
    };
    const w = ok(wrapAsBlock(d, ['g1', 'g2'], 'XOR2'));
    expect(blockPins(w.blocks![0]).inputs.map((p) => p.name)).toEqual(['A[1:0]', 'B[1:0]']);
    expect(blockPins(w.blocks![0]).outputs.map((p) => p.name)).toEqual(['S[1:0]']);
    expect(w.nodes.filter((n) => n.kind === 'MERGE')).toHaveLength(2);
    expect(w.nodes.filter((n) => n.kind === 'SPLIT')).toHaveLength(1);
    expect(rows(w)).toEqual(rows(d));
    // 在方塊裡加一個 A2：A[1:0] 變 A[2:0]，位元數變了的線拿掉。
    const m = w.nodes.find((n) => n.kind === 'CUSTOM')!;
    const inner = blockDiagram(w, m.block!)!;
    const next = applyBlockEdit(w, m.block!, { ...inner, nodes: [...inner.nodes, input('pa2', 'A2', 40)] });
    expect(next.wires.some((x) => x.to.node === m.id && x.to.pin === 0)).toBe(false);
    expect(next.wires.some((x) => x.to.node === m.id && x.to.pin === 1)).toBe(true);
  });

  it('converts a bus circuit to a matching breadboard', async () => {
    const { convertAndRoute } = await import('../../src/logic/convertRoute');
    const { applyRouting } = await import('../../src/core/routing/apply');
    const { checkAgainstDiagram } = await import('../../src/logic/diagramCheck');
    const d = passThrough();
    const withNot: LogicDiagram = { ...d, nodes: [...d.nodes, { id: 'n', kind: 'NOT', x: 22, y: 6 }, output('v', 'V', 6)], wires: [...d.wires, wire('w10', 's', 'n', 0, 2), wire('w11', 'n', 'v')] };
    const r = convertAndRoute(withNot, { switchTo: 'vcc', board: 'auto' });
    if (!r.ok) throw new Error(r.reason);
    expect(checkAgainstDiagram(withNot, applyRouting(r.result.circuit, r.routed))).toMatchObject({ kind: 'done', result: { mismatches: [] } });
  }, 120_000);
});
