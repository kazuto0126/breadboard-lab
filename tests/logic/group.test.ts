import { describe, expect, it } from 'vitest';
import { copyNodes, moveNodes, nodesInRect, pasteNodes } from '../../src/logic/edit';
import { majorityDiagram } from '../../src/logic/examples';

describe('moving several parts', () => {
  it('moves the whole group, or nothing when one would overlap', () => {
    const d = majorityDiagram();
    const moved = moveNodes(d, ['i1', 'i2'], 0, -2);
    expect(moved.ok).toBe(true);
    expect(moved.diagram.nodes.filter((n) => n.id === 'i1' || n.id === 'i2').map((n) => [n.x, n.y])).toEqual([[0, 0], [0, 2]]);
    // i2 往下 6 格會壓到 i3（在 y 10）。
    expect(moveNodes(d, ['i1', 'i2'], 0, 6)).toMatchObject({ ok: false, diagram: d });
    // 一起移動的元件互相重疊不算（i1、i2 一起往下移 2 格，i1 落在 i2 原本的位置）。
    expect(moveNodes(d, ['i1', 'i2'], 0, 2).ok).toBe(true);
  });

  it('finds parts inside a box', () => {
    const d = majorityDiagram();
    expect(nodesInRect(d, { x: -1, y: 0, w: 4, h: 6 })).toEqual(['i1', 'i2']);
    expect(nodesInRect(d, { x: 11, y: 0, w: 6, h: 20 })).toEqual(['g1', 'g2', 'g3']);
  });

  it('uses the turned box of a rotated part (sub-project 26)', () => {
    // g1 在 (12, 1)；轉 90° 後佔 x 12–14、y 1–4（沒轉時只到 y 3）。
    const d = majorityDiagram();
    const turned = { ...d, nodes: d.nodes.map((n) => (n.id === 'g1' ? { ...n, rotation: 90 as const } : n)) };
    expect(nodesInRect(turned, { x: 12, y: 4, w: 1, h: 1 })).toEqual(['g1']);
    expect(nodesInRect(d, { x: 12, y: 4, w: 1, h: 1 })).toEqual([]);
  });
});

describe('copy and paste', () => {
  it('copies parts and the wires between them, with new ids and free names', () => {
    const d = majorityDiagram();
    const clip = copyNodes(d, ['i1', 'i2', 'g1']);
    expect(clip.nodes.map((n) => n.id)).toEqual(['i1', 'i2', 'g1']);
    expect(clip.wires.map((w) => `${w.from}->${w.to.node}`)).toEqual(['i1->g1', 'i2->g1']); // 接到 g2 / g4 的線不帶
    const r = pasteNodes(d, clip);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const added = r.diagram.nodes.filter((n) => r.ids.includes(n.id));
    expect(added.map((n) => [n.id, n.kind, n.name ?? null])).toEqual([
      ['i4', 'INPUT', 'D'],
      ['i5', 'INPUT', 'E'],
      ['g5', 'AND', null],
    ]);
    const g5 = added.find((n) => n.id === 'g5')!;
    expect([g5.x, g5.y]).not.toEqual([12, 1]);
    expect(r.diagram.wires.length).toBe(d.wires.length + 2);
    expect(r.diagram.wires.slice(-2).map((w) => `${w.from}->${w.to.node}.${w.to.pin}`)).toEqual(['i4->g5.0', 'i5->g5.1']);
  });

  it('keeps names that are still free and finds a free spot', () => {
    const d = majorityDiagram();
    const out = copyNodes(d, ['o1']);
    const renamed = { ...out, nodes: out.nodes.map((n) => ({ ...n, name: 'Q' })) };
    const r = pasteNodes(d, renamed);
    expect(r.ok && r.diagram.nodes.at(-1)!.name).toBe('Q');
    const twice = pasteNodes(r.ok ? r.diagram : d, renamed);
    expect(twice.ok && twice.diagram.nodes.at(-1)!.name).not.toBe('Q');
  });
});
