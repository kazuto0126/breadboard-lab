import { describe, expect, it } from 'vitest';
import { autoPlaceAndRoute } from '../../src/core/icPlacement/autoPlace';
import { applyRouting } from '../../src/core/routing/apply';
import { convertAndRoute, convertAndRouteParallel, type RouteJob } from '../../src/logic/convertRoute';
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
      return { layout: r.result.bom.layout, boards: r.result.bom.boards, polished: calls.filter((c) => c === 'polish').length };
    };
    // 只差 1、2 條：MB-102 上最好的那一種花時間排完。
    expect(run(1)).toEqual({ layout: 'MB102', boards: 1, polished: 1 });
    expect(run(2)).toEqual({ layout: 'MB102', boards: 1, polished: 1 });
    // 差很多（像編碼器）：直接換下一種板子，把時間留給它；子專案 48 起最後是兩塊 EIC-1106（排最好的兩種）。
    expect(run(3)).toEqual({ layout: 'EIC1106', boards: 2, polished: 2 });
  });

  // 子專案 49：顯示器多到一塊 EIC-1106 放不下時，自動選板只試兩塊板（不浪費時間在一塊板上）。
  it('only tries two EIC-1106 when the displays need them (sub-project 49)', () => {
    const nodes: LogicDiagram['nodes'] = [];
    for (let k = 0; k < 8; k++) nodes.push({ id: `i${k + 1}`, kind: 'INPUT', x: 0, y: k * 2, name: 'ABCDEFGH'[k] });
    nodes.push({ id: 'd1', kind: 'DISPLAY', x: 10, y: 0 }, { id: 'd2', kind: 'DISPLAY', x: 10, y: 10 });
    const wires = [0, 1].flatMap((k) => [0, 1, 2, 3].map((p) => ({ id: `w${k}${p}`, from: `i${k * 4 + p + 1}`, to: { node: `d${k + 1}`, pin: p } })));
    const d: LogicDiagram = { ...emptyDiagram(), nodes, wires };
    const boards: number[] = [];
    const route = (c: Parameters<typeof autoPlaceAndRoute>[0]): RoutingResult => {
      boards.push(c.boards.length);
      return { status: 'success', message: '', wires: [], failedNets: [], metrics: { wireCount: 20, totalLength: 80, bends: 0, crossings: 0, overlaps: 0, shortJogs: 0 }, score: 0, stats: { iterations: 0, elapsedMs: 0 }, moves: [] };
    };
    const r = convertAndRoute(d, { switchTo: 'vcc', board: 'auto', displayResistors: 'each' }, { totalMs: 10_000 }, route);
    if (!r.ok) throw new Error(r.reason);
    expect(r.result.bom).toMatchObject({ boards: 2, displays: 2 });
    expect(boards.length).toBeGreaterThan(0);
    expect(boards.every((n) => n === 2)).toBe(true);
  });

  // 子專案 48：一塊板排不完時自動選板最後試兩塊 EIC-1106；指定板子時只試那一塊。
  it('moves to two EIC-1106 when one board cannot be routed (sub-project 48)', () => {
    const fake = (c: Parameters<typeof autoPlaceAndRoute>[0]): RoutingResult => {
      const failed = c.boards.length === 2 ? 0 : 5;
      return {
        status: failed === 0 ? 'success' : 'partial',
        message: '',
        wires: [],
        failedNets: Array.from({ length: failed }, (_, k) => ({ netId: `n${k}`, reason: 'TIME_LIMIT' as const, detail: '' })),
        metrics: { wireCount: 20, totalLength: 80, bends: 0, crossings: 0, overlaps: 0, shortJogs: 0 },
        score: 0,
        stats: { iterations: 0, elapsedMs: 0 },
        moves: [],
      };
    };
    const auto = convertAndRoute(comparator(), { switchTo: 'vcc', board: 'auto', pulls: true }, { totalMs: 10_000 }, fake);
    if (!auto.ok) throw new Error(auto.reason);
    expect(auto.result.bom).toMatchObject({ layout: 'EIC1106', boards: 2 });
    expect(auto.result.circuit.boards).toHaveLength(2);
    expect(auto.routed.status).toBe('success');
    const chosen = convertAndRoute(comparator(), { switchTo: 'vcc', board: 'EIC1106', pulls: true }, { totalMs: 10_000 }, fake);
    if (!chosen.ok) throw new Error(chosen.reason);
    expect(chosen.result.bom).toMatchObject({ layout: 'EIC1106', boards: 1 });
    expect(chosen.routed.status).toBe('partial');
  });

  it('limits the router itself during quick tries, not only the IC moves (sub-project 38)', () => {
    // 排不完的擺法佈線器會一直重排到它自己的時間上限（預設 5 秒），快速試要連它一起限時。
    const quick: Array<number | undefined> = [];
    const route = (c: Parameters<typeof autoPlaceAndRoute>[0], config?: DeepPartial<RoutingConfig>) => {
      if (config?.placement?.maxPasses === 1) {
        expect(config.timeBudgetMs).toBe(config.placement.timeBudgetMs);
        quick.push(config.timeBudgetMs);
      }
      return autoPlaceAndRoute(c, { ...config, placement: { ...config?.placement, timeBudgetMs: 1, maxPasses: 0 } });
    };
    const r = convertAndRoute(majorityDiagram(), { switchTo: 'vcc', board: 'MB102' }, { totalMs: 4000 }, route);
    expect(r.ok).toBe(true);
    expect(quick.length).toBeGreaterThan(1);
    expect(quick.every((ms) => ms !== undefined && ms <= 4000)).toBe(true);
  }, 60_000);

  it('continues polishing from the quick result instead of starting over (sub-project 41)', () => {
    const quickResults = new Set<RoutingResult>();
    const from: Array<RoutingResult | undefined> = [];
    const route = (c: Parameters<typeof autoPlaceAndRoute>[0], config?: DeepPartial<RoutingConfig>, start?: RoutingResult) => {
      const quick = config?.placement?.maxPasses === 1;
      if (!quick) from.push(start);
      const r = autoPlaceAndRoute(c, { ...config, placement: { ...config?.placement, timeBudgetMs: 1, maxPasses: 0 } });
      if (quick) quickResults.add(r);
      return r;
    };
    const r = convertAndRoute(majorityDiagram(), { switchTo: 'vcc', board: 'MB102' }, { totalMs: 4000 }, route);
    expect(r.ok).toBe(true);
    expect(from.length).toBeGreaterThan(0);
    expect(from.every((f) => f !== undefined && quickResults.has(f))).toBe(true);
  }, 60_000);

  it('hands each batch to the parallel runner at once and ends with the same result (sub-project 41)', async () => {
    // 假的佈線：每一種擺法依它的位置給固定的結果，和時間無關，一次一件與同時跑要挑到同一種。
    const scoreOf = (c: Parameters<typeof autoPlaceAndRoute>[0]) => c.components.reduce((n, p) => n + p.anchor.x * 7 + p.anchor.y, 0) % 13;
    const fakeRoute = (c: Parameters<typeof autoPlaceAndRoute>[0], config?: DeepPartial<RoutingConfig>): RoutingResult => ({
      status: 'success',
      message: '',
      wires: [],
      failedNets: [],
      metrics: { wireCount: 20 + scoreOf(c) - (config?.placement?.maxPasses === 1 ? 0 : 1), totalLength: 80, bends: 0, crossings: 0, overlaps: 0, shortJogs: 0 },
      score: 0,
      stats: { iterations: 0, elapsedMs: 0 },
      moves: [],
    });
    const options = { switchTo: 'vcc', board: 'MB102', pulls: true } as const;
    const one = convertAndRoute(comparator(), options, { totalMs: 10_000 }, fakeRoute);
    const batches: number[] = [];
    const many = await convertAndRouteParallel(comparator(), options, async (jobs: RouteJob[]) => {
      batches.push(jobs.length);
      return jobs.map((j) => fakeRoute(j.circuit, j.config));
    }, 4, { totalMs: 10_000 });
    if (!one.ok || !many.ok) throw new Error('轉換失敗');
    expect(many.result.circuit).toEqual(one.result.circuit);
    expect(many.routed.metrics).toEqual(one.routed.metrics);
    expect(many.tried).toBe(one.tried);
    // 第一批是全部的快速試，第二批是一起排的最好兩種。
    expect(batches).toEqual([one.tried, 2]);
  });

  it('explains when no layout fits', () => {
    expect(convertAndRoute(andChain(28), { switchTo: 'vcc', board: 'MB102', pulls: true })).toEqual({ ok: false, reason: 'MB-102 放不下，請改用 EIC-1106' });
    // 子專案 48：自動選板時兩塊 EIC-1106 也放不下才失敗。
    expect(convertAndRoute(andChain(60), { switchTo: 'vcc', board: 'auto' })).toMatchObject({ ok: false, reason: expect.stringContaining('兩塊 EIC-1106 也放不下') });
    expect(convertAndRoute(emptyDiagram(), { switchTo: 'vcc', board: 'auto' })).toEqual({ ok: false, reason: '邏輯圖要有輸入端和輸出端才能轉' });
  }, 120_000);
});
