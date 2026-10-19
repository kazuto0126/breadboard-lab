import { describe, expect, it } from 'vitest';
import { autoPlaceAndRoute } from '../../src/core/icPlacement/autoPlace';
import { applyRouting } from '../../src/core/routing/apply';
import { circuit, comp } from '../../src/editor/builder';
import { checkAgainstDiagram } from '../../src/logic/diagramCheck';
import { bcdDiagram, majorityDiagram } from '../../src/logic/examples';
import { toBreadboard } from '../../src/logic/toBreadboard';
import type { RoutingResult } from '../../src/types/routing';
import { powerProblems } from '../fixtures/powerChecks';

/** 子專案 34：可移動 IC 的佈線打開「電源接最近的軌」時，每個候選位置先重新接電源。 */
const NEAREST = { placement: { nearestPowerRail: true, timeBudgetMs: 8000 } };

describe('applying a routing result with power symbol changes', () => {
  it('removes and adds the symbols after moving the ICs', () => {
    const c = circuit([comp('U1', '74LS00', 'F10'), comp('V1', 'vcc', 'B+3')]);
    const added = comp('V2', 'vcc', 'T+3');
    const result = { status: 'success', message: '', wires: [], failedNets: [], score: 0, stats: { iterations: 0, elapsedMs: 0 }, moves: [], powerSymbols: { added: [added], removed: ['V1'] } } as unknown as RoutingResult;
    expect(applyRouting(c, result).components.map((x) => x.id)).toEqual(['U1', 'V2']);
  });
});

describe('IC-moving routing with nearest-rail power', () => {
  it('connects every power pin to its nearest rail after the ICs move (BCD on EIC-1106)', () => {
    const r = toBreadboard(bcdDiagram(), { switchTo: 'vcc', board: 'EIC1106' });
    if (!r.ok) throw new Error(r.reason);
    const routed = autoPlaceAndRoute(r.circuit, NEAREST);
    expect(routed.status).toBe('success');
    const applied = applyRouting(r.circuit, routed);
    expect(powerProblems(applied)).toEqual([]);
    expect(checkAgainstDiagram(bcdDiagram(), applied)).toMatchObject({ kind: 'done', result: { mismatches: [] } });
  }, 120_000);

  it('changes nothing when the option is off (rail-to-rail wires stay)', () => {
    const r = toBreadboard(majorityDiagram(), { switchTo: 'vcc', board: 'MB102' });
    if (!r.ok) throw new Error(r.reason);
    const routed = autoPlaceAndRoute(r.circuit, { placement: { timeBudgetMs: 8000 } });
    expect(routed.powerSymbols).toBeUndefined();
    expect(powerProblems(applyRouting(r.circuit, routed)).some((p) => p.includes('兩端都在電源軌'))).toBe(true);
  }, 120_000);
});
