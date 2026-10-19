import { describe, expect, it } from 'vitest';
import { autoPlaceAndRoute } from '../../src/core/icPlacement/autoPlace';
import { applyRouting } from '../../src/core/routing/apply';
import { extractNets } from '../../src/core/circuit/nets';
import { circuit, comp, straightWire } from '../../src/editor/builder';
import { checkAgainstDiagram } from '../../src/logic/diagramCheck';
import { bcdDiagram } from '../../src/logic/examples';
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

  it('keeps the rails the user joined when the option is off', () => {
    // 使用者自己用跳線把上下的 + 軌接在一起（T+10 → B+10）：一般的 AI 佈線要保留這個連接，也不會動符號。
    const c = circuit(
      [comp('U1', '74LS00', 'F10'), comp('V1', 'vcc', 'T+3'), comp('G1', 'gnd', 'B-3')],
      [straightWire('j', 'T+10', 'B+10'), straightWire('p', 'C10', 'T+12'), straightWire('g', 'H16', 'B-16')],
    );
    const routed = autoPlaceAndRoute(c, { placement: { timeBudgetMs: 4000 } });
    expect(routed.status).toBe('success');
    expect(routed.powerSymbols).toBeUndefined();
    const vcc = extractNets(applyRouting(c, routed)).find((n) => n.kind === 'power')!;
    expect(vcc.groupIds).toEqual(expect.arrayContaining(['b1:rail-T+', 'b1:rail-B+']));
  }, 120_000);
});
