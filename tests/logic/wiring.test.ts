import { describe, expect, it } from 'vitest';
import { majorityDiagram } from '../../src/logic/examples';
import type { LogicDiagram } from '../../src/logic/types';
import { junctions, wireRoute } from '../../src/logic/wiring';

describe('logic wire drawing', () => {
  it('runs out to a bus one cell right of the source, then across to the target pin', () => {
    const d = majorityDiagram();
    // i1（A）在 (0, 2)，輸出腳 (2, 2)；g1 在 (12, 1)，第 0 個輸入 (12, 1)
    const w = d.wires.find((x) => x.from === 'i1' && x.to.node === 'g1')!;
    expect(wireRoute(d, w)).toEqual([{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 1 }, { x: 12, y: 1 }]);
  });

  it('puts a dot where a source branches to more than one target', () => {
    const dots = junctions(majorityDiagram());
    // A 接 g1.0（y 1）與 g2.1（y 10）：匯流線 x = 3，從 y 2 分到 1 與 10 → 在 (3, 2) 分岔
    expect(dots).toContainEqual({ x: 3, y: 2 });
    expect(dots.every((p) => Number.isInteger(p.x) && Number.isInteger(p.y))).toBe(true);
  });
});

describe('bus columns', () => {
  it('gives sources in the same column their own bus so wires do not overlap', () => {
    const d = majorityDiagram();
    const busOf = (from: string) => {
      const w = d.wires.find((x) => x.from === from)!;
      return wireRoute(d, w)[1].x;
    };
    // A、B、C 的輸出腳都在 x = 2：匯流線依上到下排在 3、4、5。
    expect([busOf('i1'), busOf('i2'), busOf('i3')]).toEqual([3, 4, 5]);
    // 閘的輸出（g1、g2、g3 在同一欄）也分開。
    expect(new Set([busOf('g1'), busOf('g2'), busOf('g3')]).size).toBe(3);
  });
});

describe('going around other parts', () => {
  const node = (id: string, kind: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({ id, kind, name: id, x, y, ...extra });
  const wire = (id: string, from: string, to: string, pin: number) => ({ id, from, to: { node: to, pin } });

  /** A、B 接 G1，G1 和 C 接 G2；G2 和 G1 排在同一排（C 的線原本會水平穿過 G1）。 */
  const cascade = () =>
    ({
      nodes: [node('A', 'INPUT', 0, 0), node('B', 'INPUT', 0, 2), node('C', 'INPUT', 0, 4), node('G1', 'AND', 6, 0), node('G2', 'AND', 12, 0), node('X', 'OUTPUT', 18, 2)],
      wires: [wire('w1', 'A', 'G1', 0), wire('w2', 'B', 'G1', 1), wire('w3', 'G1', 'G2', 0), wire('w4', 'C', 'G2', 1), wire('w5', 'G2', 'X', 0)],
    }) as unknown as LogicDiagram;

  it('goes around a gate in the way instead of running through it', () => {
    const d = cascade();
    // C 的匯流線 x = 5；往上一列（y 3）走到 G2 左邊一格（x 11），再轉進 G2 的第 1 個輸入 (12, 2)。
    expect(wireRoute(d, d.wires[3])).toEqual([{ x: 2, y: 4 }, { x: 5, y: 4 }, { x: 5, y: 3 }, { x: 11, y: 3 }, { x: 11, y: 2 }, { x: 12, y: 2 }]);
    // 沒有被擋到的線照原本的走法。
    expect(wireRoute(d, d.wires[1])).toEqual([{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 6, y: 2 }]);
  });

  it('draws a wire back to the left around the parts, not through them', () => {
    const d = { nodes: [node('G1', 'AND', 6, 0), node('G2', 'AND', 12, 0)], wires: [wire('w1', 'G2', 'G1', 0)] } as unknown as LogicDiagram;
    expect(wireRoute(d, d.wires[0])).toEqual([{ x: 16, y: 1 }, { x: 17, y: 1 }, { x: 17, y: -1 }, { x: 5, y: -1 }, { x: 5, y: 0 }, { x: 6, y: 0 }]);
  });

  it('keeps the old drawing when there is no way around', () => {
    // 目的腳四周都被擋住（上下各一排很寬的方塊）時，照原本的畫法。
    const d = {
      nodes: [node('A', 'INPUT', 0, 0), node('N', 'NOT', 6, 0), node('Y', 'OUTPUT', 14, 0)],
      wires: [wire('w1', 'A', 'Y', 0)],
    } as unknown as LogicDiagram;
    const walls = Array.from({ length: 24 }, (_, k) => [node(`U${k}`, 'NOT', 4, -1 - k), node(`V${k}`, 'NOT', 4, 1 + k), node(`P${k}`, 'NOT', 8, -1 - k), node(`Q${k}`, 'NOT', 8, 1 + k)]).flat();
    d.nodes.push(...(walls as unknown as LogicDiagram['nodes']));
    expect(wireRoute(d, d.wires[0])).toEqual([{ x: 2, y: 0 }, { x: 3, y: 0 }, { x: 14, y: 0 }]);
  });

  it('puts branch dots where the wires really leave the bus', () => {
    // C 接 Y1（y 8，直接走）與 Y2（y 6，被 NOT 擋住，改從 y 5 走）。
    const d = {
      nodes: [node('C', 'INPUT', 0, 4), node('N', 'NOT', 8, 6), node('Y1', 'OUTPUT', 14, 8), node('Y2', 'OUTPUT', 14, 6)],
      wires: [wire('w1', 'C', 'Y1', 0), wire('w2', 'C', 'Y2', 0)],
    } as unknown as LogicDiagram;
    expect(wireRoute(d, d.wires[1])).toEqual([{ x: 2, y: 4 }, { x: 3, y: 4 }, { x: 3, y: 5 }, { x: 13, y: 5 }, { x: 13, y: 6 }, { x: 14, y: 6 }]);
    const dots = junctions(d);
    expect(dots).toContainEqual({ x: 3, y: 5 });
    expect(dots).not.toContainEqual({ x: 3, y: 6 });
    // 匯流線在 C 那一列只是轉角，沒有分岔。
    expect(dots).not.toContainEqual({ x: 3, y: 4 });
  });

  /** 兩個 NOT 在同一欄：N1 的線要接到 G 那一列，剛好是 N2 輸出的那一列（會沿著 N2 的輸出短線走）。 */
  const stubRow = () =>
    ({
      nodes: [node('N1', 'NOT', 9, 0, { inputs: 1 }), node('N2', 'NOT', 9, 4, { inputs: 1 }), node('G', 'AND', 18, 4, { inputs: 2 })],
      wires: [wire('w1', 'N1', 'G', 0), wire('w2', 'N2', 'G', 1)],
    }) as unknown as LogicDiagram;

  it('does not run along the short line from another output to its bus', () => {
    const d = stubRow();
    // N1 的匯流線 x = 13、N2 的是 14；N2 的輸出短線是 (12, 4)–(14, 4)。N1 的線改從 y 3 走到 G 左邊再轉進去。
    expect(wireRoute(d, d.wires[0])).toEqual([{ x: 12, y: 0 }, { x: 13, y: 0 }, { x: 13, y: 3 }, { x: 17, y: 3 }, { x: 17, y: 4 }, { x: 18, y: 4 }]);
  });

  it('never lets two different signals share a stretch of line in the examples', () => {
    for (const d of [majorityDiagram(), cascade(), stubRow()]) {
      const segs = d.wires.flatMap((w) => {
        const pts = wireRoute(d, w);
        return pts.slice(1).map((q, i) => ({ from: w.from, p: pts[i], q }));
      });
      for (const s of segs)
        for (const t of segs) {
          if (s.from === t.from) continue;
          const sameRow = s.p.y === s.q.y && t.p.y === t.q.y && s.p.y === t.p.y;
          const sameCol = s.p.x === s.q.x && t.p.x === t.q.x && s.p.x === t.p.x;
          const [a1, a2, b1, b2] = sameRow ? [s.p.x, s.q.x, t.p.x, t.q.x] : [s.p.y, s.q.y, t.p.y, t.q.y];
          const shared = Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2));
          expect(sameRow || sameCol ? shared : 0).toBeLessThanOrEqual(0);
        }
    }
  });
});

describe('turned parts (sub-project 26)', () => {
  const node = (id: string, kind: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({ id, kind, name: id, x, y, ...extra });
  const wire = (id: string, from: string, to: string, pin: number) => ({ id, from, to: { node: to, pin } });

  it('comes down into a gate turned 90° (inputs on top)', () => {
    // 轉 90° 的 AND 在 (10, 5)：第 0 個輸入在 (12, 5)，朝上。
    const d = { nodes: [node('A', 'INPUT', 0, 0), node('G', 'AND', 10, 5, { inputs: 2, rotation: 90 })], wires: [wire('w1', 'A', 'G', 0)] } as unknown as LogicDiagram;
    expect(wireRoute(d, d.wires[0])).toEqual([{ x: 2, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }, { x: 12, y: 4 }, { x: 12, y: 5 }]);
  });

  it('leaves a gate turned 180° to the left and goes round the target to reach its input from the left', () => {
    // 轉 180° 的 AND 在 (10, 0)：輸出 (10, 1) 朝左；X 的輸入 (2, 1) 朝左，本體在 x 2–4，所以要從左邊繞進去。
    const d = { nodes: [node('G', 'AND', 10, 0, { inputs: 2, rotation: 180 }), node('X', 'OUTPUT', 2, 1)], wires: [wire('w1', 'G', 'X', 0)] } as unknown as LogicDiagram;
    expect(wireRoute(d, d.wires[0])).toEqual([{ x: 10, y: 1 }, { x: 9, y: 1 }, { x: 9, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 1 }, { x: 2, y: 1 }]);
  });

  it('runs a horizontal bus under a gate turned 90° (output facing down)', () => {
    // 轉 90° 的 AND 在 (0, 0)：輸出 (1, 4) 朝下，匯流線是 y = 5 的橫線。
    const d = { nodes: [node('G', 'AND', 0, 0, { inputs: 2, rotation: 90 }), node('X', 'OUTPUT', 8, 8)], wires: [wire('w1', 'G', 'X', 0)] } as unknown as LogicDiagram;
    expect(wireRoute(d, d.wires[0])).toEqual([{ x: 1, y: 4 }, { x: 1, y: 5 }, { x: 7, y: 5 }, { x: 7, y: 8 }, { x: 8, y: 8 }]);
  });

  it('always starts at the output pin, ends at the input pin from the side it faces, and only uses straight segments', async () => {
    const { inputDir, inputPins, outputPin } = await import('../../src/logic/shapes');
    let seed = 26;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const step: Record<string, [number, number]> = { E: [1, 0], S: [0, 1], W: [-1, 0], N: [0, -1] };
    for (let trial = 0; trial < 60; trial++) {
      const nodes = Array.from({ length: 4 }, (_, k) => node(`G${k}`, ['AND', 'OR', 'NAND'][k % 3], 2 + (k % 2) * 14, 2 + Math.floor(k / 2) * 12, { inputs: 2, rotation: [0, 90, 180, 270][Math.floor(rand() * 4)] || undefined }));
      const wires = Array.from({ length: 4 }, (_, k) => wire(`w${k}`, `G${k}`, `G${(k + 1 + Math.floor(rand() * 3)) % 4}`, Math.floor(rand() * 2)));
      const used = new Set<string>();
      const d = { nodes, wires: wires.filter((w) => !used.has(`${w.to.node}#${w.to.pin}`) && used.add(`${w.to.node}#${w.to.pin}`)) } as unknown as LogicDiagram;
      for (const w of d.wires) {
        const pts = wireRoute(d, w);
        const source = d.nodes.find((n) => n.id === w.from)!;
        const target = d.nodes.find((n) => n.id === w.to.node)!;
        expect(pts[0]).toEqual(outputPin(source));
        expect(pts.at(-1)).toEqual(inputPins(target)[w.to.pin]);
        for (let i = 1; i < pts.length; i++) expect(pts[i].x === pts[i - 1].x || pts[i].y === pts[i - 1].y).toBe(true);
        // 最後一段從輸入腳朝外的那一側接進來。
        const [dx, dy] = step[inputDir(target)];
        const last = pts.at(-1)!;
        const prev = pts.at(-2)!;
        expect(Math.sign(prev.x - last.x) === dx && Math.sign(prev.y - last.y) === dy, `第 ${trial} 次 ${w.id}`).toBe(true);
      }
    }
  });
});
