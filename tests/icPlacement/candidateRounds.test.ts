import { describe, expect, it, vi } from 'vitest';
import type { DeepPartial, RoutingConfig, RoutingResult } from '../../src/types/routing';
import { farIcCircuit } from '../fixtures/circuits';

/**
 * 子專案 41（規格 2026-10-24 faster-conversion）：可移動 IC 的佈線。用假的 autoRoute 記下每次的協商輪數上限，
 * 不用真的佈線：第一次（IC 都不動）要 100 輪、後面每個位置都排得更好、只要 3 輪。
 */
const calls: Array<number | undefined> = [];
let n = 0;
vi.mock('../../src/core/routing/autoRoute', () => ({
  autoRoute: (_c: unknown, options?: DeepPartial<RoutingConfig>): RoutingResult => {
    calls.push(options?.negotiation?.maxIterations);
    const k = n++;
    return {
      status: 'success',
      message: '',
      wires: [],
      failedNets: [],
      metrics: { wireCount: 100 - k, totalLength: 100, bends: 0, crossings: 0, overlaps: 0, shortJogs: 0 },
      score: 0,
      stats: { iterations: k === 0 ? 100 : 3, elapsedMs: 0 },
    };
  },
}));

const { autoPlaceAndRoute } = await import('../../src/core/icPlacement/autoPlace');

describe('candidate negotiation rounds', () => {
  it('follow the best result found so far', () => {
    calls.length = 0;
    n = 0;
    autoPlaceAndRoute(farIcCircuit(), { placement: { maxPasses: 1, candidatesPerIc: 3 } });
    // 第一次沒有上限；第一個候選位置照「IC 都不動」的 100 輪給 150（上限）；之後最好的只要 3 輪，給預設的 30 輪。
    expect(calls[0]).toBeUndefined();
    expect(calls[1]).toBe(150);
    expect(calls.slice(2).every((m) => m === 30)).toBe(true);
    expect(calls.length).toBeGreaterThan(2);
  });

  it('start from an earlier result without routing it again', () => {
    calls.length = 0;
    n = 1;
    const earlier: RoutingResult = {
      status: 'success',
      message: '',
      wires: [],
      failedNets: [],
      metrics: { wireCount: 200, totalLength: 100, bends: 0, crossings: 0, overlaps: 0, shortJogs: 0 },
      score: 0,
      stats: { iterations: 3, elapsedMs: 0 },
      moves: [],
    };
    const r = autoPlaceAndRoute(farIcCircuit(), { placement: { maxPasses: 0 } }, earlier);
    expect(calls).toEqual([]);
    expect(r.metrics.wireCount).toBe(200);
    autoPlaceAndRoute(farIcCircuit(), { placement: { maxPasses: 1 } }, earlier);
    // 從 3 輪的結果開始：每個候選位置都是 30 輪。
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((m) => m === 30)).toBe(true);
  });
});
