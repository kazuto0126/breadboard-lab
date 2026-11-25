import { describe, expect, it } from 'vitest';
import { applyRouting } from '../../src/core/routing/apply';
import { compileSimulation, initialSimState, settle } from '../../src/core/simulation/simulate';
import { convertAndRoute } from '../../src/logic/convertRoute';
import { decadeCounter } from '../fixtures/decadeCounter';

describe('feedback counters on the breadboard', () => {
  // 使用者 2026-11-25 回報：十進位計數器（74LS76 × 2 + 74LS00）模擬時 45 個導通群組都是 X、LED 全暗。
  // 上電時 NAND 的輸出還是 X，接到 /CLR 讓正反器也變成 X，X 在回授迴圈裡永遠解不開。
  it('counts 0–9 with a NAND clearing two 74LS76, without unknown (X) levels', () => {
    const r = convertAndRoute(decadeCounter(), { switchTo: 'vcc', board: 'auto', pulls: true });
    if (!r.ok) throw new Error(r.reason);
    expect(r.routed.status).toBe('success');
    const circuit = applyRouting(r.result.circuit, r.routed);
    const sim = compileSimulation(circuit);
    const clock = sim.clocks[0].componentId;
    const bitOf = new Map(circuit.components.filter((c) => c.defId === 'led').map((c) => [c.id, ['QA', 'QB', 'QC', 'QD'].indexOf(String((c.props as { labels?: string[] }).labels?.[0]))]));
    let state = initialSimState(sim);
    const seen: number[] = [];
    for (let t = 0; t < 24; t++) {
      const out = settle(sim, state, { pressed: {}, clocks: { [clock]: (t % 2) as 0 | 1 } });
      state = out.state;
      expect(out.result.conflicts).toEqual([]);
      if (t % 2 === 0) seen.push(out.result.litLeds.reduce((n, id) => n + (1 << bitOf.get(id)!), 0));
    }
    // 時脈從 LOW 開始，每一次 1 → 0（下降緣）加 1；數到 10 時 NAND 立刻清除成 0。
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1]);
  }, 120_000);
});
