import { describe, expect, it } from 'vitest';
import { applyRouting } from '../../src/core/routing/apply';
import { convertAndRoute } from '../../src/logic/convertRoute';
import { checkAgainstDiagram } from '../../src/logic/diagramCheck';
import { addNode, connect } from '../../src/logic/edit';
import { majorityDiagram } from '../../src/logic/examples';
import { emptyDiagram, type LogicDiagram } from '../../src/logic/types';
import type { DeepPartial, RoutingConfig, RoutingResult } from '../../src/types/routing';
import { comparator } from '../fixtures/labCircuits';
import { powerProblems } from '../fixtures/powerChecks';

/** 子專案 36（規格 2026-10-20 conversion-placement）：試好幾種擺法，挑佈線最好的。 */
const must = (r: { ok: true; diagram: LogicDiagram } | { ok: false; reason: string }) => {
  if (!r.ok) throw new Error(r.reason);
  return r.diagram;
};
function andChain(n: number): LogicDiagram {
  let d = emptyDiagram();
  d = must(addNode(d, 'INPUT', 0, 0));
  d = must(addNode(d, 'INPUT', 0, 2));
  for (let i = 0; i < n; i++) d = must(addNode(d, 'AND', 6 + i * 6, 0));
  d = must(addNode(d, 'OUTPUT', 6 + n * 6 + 2, 1));
  d = must(connect(d, 'i1', { node: 'g1', pin: 0 }));
  for (let i = 1; i <= n; i++) {
    if (i > 1) d = must(connect(d, `g${i - 1}`, { node: `g${i}`, pin: 0 }));
    d = must(connect(d, 'i2', { node: `g${i}`, pin: 1 }));
  }
  return must(connect(d, `g${n}`, { node: 'o1', pin: 0 }));
}

/** 轉換 + 佈線後：成功、線數不超過 max、和邏輯圖比對全部一致、電源接法沒問題。 */
function expectGood(d: LogicDiagram, pulls: boolean, maxWires: number) {
  const r = convertAndRoute(d, { switchTo: 'vcc', board: 'auto', pulls });
  if (!r.ok) throw new Error(r.reason);
  expect(r.result.bom.layout).toBe('MB102');
  expect(r.routed.status).toBe('success');
  expect(r.routed.metrics.wireCount).toBeLessThanOrEqual(maxWires);
  expect(r.tried).toBeGreaterThan(1);
  const applied = applyRouting(r.result.circuit, r.routed);
  expect(checkAgainstDiagram(d, applied)).toMatchObject({ kind: 'done', result: { mismatches: [] } });
  expect(powerProblems(applied)).toEqual([]);
}

describe('converting with a layout search (sub-project 36)', () => {
  it('fits the 1-bit comparator with pull-downs on an MB-102 in at most 27 wires (was 37)', () => expectGood(comparator(), true, 27), 120_000);

  it('fits the majority circuit with pull-downs in at most 28 wires (was 41)', () => expectGood(majorityDiagram(), true, 28), 120_000);

  it('only tries the board that was chosen', () => {
    const r = convertAndRoute(majorityDiagram(), { switchTo: 'vcc', board: 'EIC1106' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.result.bom.layout).toBe('EIC1106');
  }, 120_000);

  it('still finishes a nearly routed MB-102 layout before moving to the EIC-1106 (slow computers)', () => {
    // 假的佈線：快速試（maxPasses 1）時差 missing 條排不完，花時間排的那一次排得完。慢的電腦上小電路常常這樣。
    const fake = (failed: number): RoutingResult => ({
      status: failed === 0 ? 'success' : 'partial',
      message: '',
      wires: [],
      failedNets: Array.from({ length: failed }, (_, k) => ({ netId: `n${k}`, reason: 'TIME_LIMIT' as const, detail: '' })),
      metrics: { wireCount: 20, totalLength: 80, bends: 0, crossings: 0, overlaps: 0, shortJogs: 0 },
      score: 0,
      stats: { iterations: 0, elapsedMs: 0 },
      moves: [],
    });
    const run = (missing: number) => {
      const calls: string[] = [];
      const route = (_c: unknown, config?: DeepPartial<RoutingConfig>) => {
        const quick = config?.placement?.maxPasses === 1;
        calls.push(quick ? 'quick' : 'polish');
        return fake(quick ? missing : 0);
      };
      const r = convertAndRoute(comparator(), { switchTo: 'vcc', board: 'auto', pulls: true }, { totalMs: 10_000 }, route);
      if (!r.ok) throw new Error(r.reason);
      return { layout: r.result.bom.layout, polished: calls.filter((c) => c === 'polish').length };
    };
    // 只差 1、2 條：MB-102 上最好的那一種花時間排完。
    expect(run(1)).toEqual({ layout: 'MB102', polished: 1 });
    expect(run(2)).toEqual({ layout: 'MB102', polished: 1 });
    // 差很多（像編碼器）：直接換 EIC-1106，把時間留給它（在 EIC-1106 上排最好的兩種）。
    expect(run(3)).toEqual({ layout: 'EIC1106', polished: 2 });
  });

  it('explains when no layout fits', () => {
    expect(convertAndRoute(andChain(28), { switchTo: 'vcc', board: 'MB102', pulls: true })).toEqual({ ok: false, reason: 'MB-102 放不下，請改用 EIC-1106' });
    expect(convertAndRoute(andChain(60), { switchTo: 'vcc', board: 'auto' })).toMatchObject({ ok: false, reason: expect.stringContaining('EIC-1106 放不下') });
    expect(convertAndRoute(emptyDiagram(), { switchTo: 'vcc', board: 'auto' })).toEqual({ ok: false, reason: '邏輯圖要有輸入端和輸出端才能轉' });
  }, 120_000);
});
