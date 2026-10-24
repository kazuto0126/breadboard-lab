import { afterAll, describe, expect, it } from 'vitest';
import { autoPlaceAndRoute } from '../../src/core/icPlacement/autoPlace';
import type { RoutingResult } from '../../src/types/routing';
import { createRoutingPool, poolSize } from '../../scripts/mcp-pool';
import { farIcCircuit } from '../fixtures/circuits';

/** 子專案 42（規格 2026-10-24 mcp-parallel）：MCP 的佈線執行緒。原始碼版的執行緒要 --import tsx 才能載入 .ts。 */
const pool = createRoutingPool(2, { url: new URL('../../scripts/mcp-pool.ts', import.meta.url), execArgv: ['--import', 'tsx'] });
afterAll(() => pool.close());
const timeless = (r: RoutingResult) => ({ ...r, stats: { ...r.stats, elapsedMs: 0 } });

describe('the routing pool', () => {
  it('keeps one core for the server and uses at most 4 threads', () => {
    expect(poolSize(1)).toBe(1);
    expect(poolSize(2)).toBe(1);
    expect(poolSize(3)).toBe(2);
    expect(poolSize(16)).toBe(4);
    // 環境變數指定（測試時減少負擔）；不是 1 以上的整數就照核心數。
    expect(poolSize(16, '1')).toBe(1);
    expect(poolSize(16, '2')).toBe(2);
    expect(poolSize(16, '9')).toBe(4);
    expect(poolSize(16, 'x')).toBe(4);
    expect(poolSize(16, '0')).toBe(4);
  });

  it('routes a batch on several threads with the same results as the main thread', async () => {
    const c = farIcCircuit();
    const jobs = [
      { circuit: c, config: {} },
      { circuit: c, config: { placement: { maxPasses: 1 } } },
      { circuit: c, config: { placement: { maxPasses: 0 } } },
    ];
    const results = await pool.routeMany(jobs);
    expect(results.map(timeless)).toEqual(jobs.map((j) => timeless(autoPlaceAndRoute(j.circuit, j.config))));
    expect(new Set(pool.lastThreads()).size).toBe(2);
  }, 120_000);

  it('continues from an earlier result in a thread too', async () => {
    const c = farIcCircuit();
    const earlier = autoPlaceAndRoute(c, { placement: { maxPasses: 0 } });
    const [r] = await pool.routeMany([{ circuit: c, config: { placement: { maxPasses: 0 } }, from: earlier }]);
    expect(timeless(r)).toEqual(timeless(autoPlaceAndRoute(c, { placement: { maxPasses: 0 } }, earlier)));
  }, 120_000);
});
