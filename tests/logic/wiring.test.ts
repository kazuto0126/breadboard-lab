import { describe, expect, it } from 'vitest';
import { majorityDiagram } from '../../src/logic/examples';
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
