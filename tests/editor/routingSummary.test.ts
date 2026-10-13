import { describe, expect, it } from 'vitest';
import { autoRoute } from '../../src/core/routing/autoRoute';
import { applyRouting } from '../../src/core/routing/apply';
import { FAILURE_NAMES as FROM_DESCRIBE } from '../../src/components/common/describe';
import { analyzeCircuit } from '../../src/editor/analysis';
import { FAILURE_NAMES, routingSummaryText, summarizeRouting } from '../../src/editor/explain/routing';
import type { RoutingResult } from '../../src/types/routing';
import { circuit, comp, holeOn, straightWire } from '../fixtures/build';

/** R1（A10–A14）接 R2（H20–H24）要轉彎；R3（A30–A34）接 R4（A40–A44）可以一條直線。 */
function routed() {
  const before = circuit(
    [comp('R1', 'resistor', 'A10'), comp('R2', 'resistor', 'H20'), comp('R3', 'resistor', 'A30'), comp('R4', 'resistor', 'A40')],
    [straightWire('w1', 'B14', 'I20'), straightWire('w2', 'B34', 'B40')],
  );
  const result = autoRoute(before);
  expect(result.status).toBe('success');
  return { before, result, after: applyRouting(before, result), beforeScore: analyzeCircuit(before).routing };
}

describe('summarizeRouting', () => {
  it('compares before and after and ranks nets by extra wires', () => {
    const { after, result, beforeScore } = routed();
    const s = summarizeRouting(after, { beforeScore, result });
    expect(s.status).toBe('success');
    expect(s.before.wireCount).toBe(2);
    expect(s.after).toEqual(result.metrics);
    expect(s.moves).toEqual([]);
    expect(s.failed).toEqual([]);
    expect(s.nets).toHaveLength(2);
    const [bent, direct] = s.nets;
    expect(bent.minimum).toBe(1);
    expect(bent.wires).toBeGreaterThan(1);
    expect(direct).toMatchObject({ wires: 1, minimum: 1 });
    expect(bent.points).toHaveLength(bent.wires * 2);
    expect(s.nets.reduce((n, x) => n + x.wires, 0)).toBe(result.wires.length);
  });

  it('writes plain sentences, listing only nets that needed extra wires', () => {
    const { after, result, beforeScore } = routed();
    const s = summarizeRouting(after, { beforeScore, result });
    const text = routingSummaryText(s);
    expect(text[0]).toBe(
      `佈線成功：${result.metrics.wireCount} 條線，總長 ${result.metrics.totalLength} 格，交叉 ${result.metrics.crossings} 處（佈線前：2 條、${beforeScore.metrics.totalLength} 格、${beforeScore.metrics.crossings} 處）`,
    );
    const bent = s.nets[0];
    expect(text[1]).toBe(`最繞的訊號：${bent.name} 用了 ${bent.wires} 條線（直接接最少 ${bent.minimum} 條）`);
    expect(text).toHaveLength(2);
  });

  it('names moved ICs by hole and explains failures', () => {
    const before = circuit([comp('U1', '74LS00', 'F10')]);
    const result: RoutingResult = {
      status: 'partial',
      message: '部分完成',
      wires: [],
      failedNets: [{ netId: 'n1', reason: 'NO_FREE_HOLE', detail: '' }],
      metrics: { wireCount: 0, totalLength: 0, bends: 0, crossings: 0, overlaps: 0, shortJogs: 0 },
      score: 0,
      stats: { iterations: 1, elapsedMs: 1 },
      moves: [{ componentId: 'U1', from: { boardId: 'b1', anchor: holeOn('b1', 'F10'), rotation: 0 }, to: { boardId: 'b1', anchor: holeOn('b1', 'F30'), rotation: 0 } }],
    };
    const s = summarizeRouting(before, { beforeScore: analyzeCircuit(before).routing, result });
    expect(s.moves).toEqual([{ componentId: 'U1', from: 'F10', to: 'F30' }]);
    expect(s.failed).toEqual([{ netId: 'n1', reason: '沒有空孔可以接線', hint: '腳旁邊的孔都滿了：把元件往旁邊移幾格，或換 EIC-1106 大型麵包板' }]);
    const text = routingSummaryText(s);
    expect(text[0]).toMatch(/^佈線只完成一部分：0 條線/);
    expect(text).toContain('搬動了 U1（F10 → F30）');
    expect(text.some((t) => t.startsWith('每個訊號'))).toBe(false); // 沒有任何 AI 導線時不寫
    expect(text).toContain('n1 接不通：沒有空孔可以接線。腳旁邊的孔都滿了：把元件往旁邊移幾格，或換 EIC-1106 大型麵包板');
    expect(FROM_DESCRIBE).toBe(FAILURE_NAMES);
  });
});
