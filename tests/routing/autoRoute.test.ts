import { describe, expect, it } from 'vitest';
import { nodeIdOf } from '../../src/core/breadboard/naming';
import { validateCircuit } from '../../src/core/circuit/validate';
import { applyRouting } from '../../src/core/routing/apply';
import { autoRoute } from '../../src/core/routing/autoRoute';
import { GROUND_COLOR, POWER_COLOR } from '../../src/core/routing/colors';
import { checkRoutingLegality } from '../../src/core/routing/legality';
import type { RoutingResult } from '../../src/types/routing';
import { circuit, comp, wire } from '../fixtures/build';
import { acceptanceCircuit } from '../fixtures/circuits';
import { bcdDiagram } from '../../src/logic/examples';
import { toBreadboard } from '../../src/logic/toBreadboard';

const withoutTiming = (r: RoutingResult) => ({ ...r, stats: { ...r.stats, elapsedMs: 0 } });

/** 第 20 欄上半五個孔都插滿了腳，接不出任何線。 */
const fullColumn = () => [
  comp('R1', 'resistor', 'A20', { rotation: 90, span: 1 }),
  comp('R2', 'resistor', 'C20', { rotation: 90, span: 1 }),
  comp('D1', 'led', 'E20'),
  comp('D2', 'led', 'C40'),
];

describe('autoRoute', () => {
  it('routes the acceptance circuit legally and deterministically', () => {
    const c = acceptanceCircuit();
    const r = autoRoute(c);
    expect(r.status).toBe('success');
    expect(r.message).toBe('Standard Routing Complete');
    expect(r.failedNets).toEqual([]);
    expect(checkRoutingLegality(c, r.wires)).toEqual([]);
    expect(r.metrics.overlaps).toBe(0);
    expect(r.wires.every((w) => w.source === 'auto' && w.netId !== undefined)).toBe(true);
    expect(r.wires.filter((w) => w.netId === 'VCC').every((w) => w.color === POWER_COLOR)).toBe(true);
    expect(r.wires.filter((w) => w.netId === 'GND').every((w) => w.color === GROUND_COLOR)).toBe(true);
    expect(withoutTiming(autoRoute(c))).toEqual(withoutTiming(r));
  });

  it('routes with straight horizontal or vertical wires only, one wire end per hole', () => {
    const r = autoRoute(acceptanceCircuit());
    expect(r.metrics.wireCount).toBeGreaterThanOrEqual(7);
    for (const w of r.wires) {
      expect(w.straight).toBe(true);
      expect(w.start.x === w.end.x || w.start.y === w.end.y).toBe(true);
    }
    const ends = r.wires.flatMap((w) => [nodeIdOf(w.start), nodeIdOf(w.end)]);
    expect(new Set(ends).size).toBe(ends.length);
  });

  it('reports "No valid routing solution." when a group has no free hole', () => {
    const r = autoRoute(circuit(fullColumn(), [wire('w1', 'A20', 'A40')]));
    expect(r.status).toBe('failed');
    expect(r.message).toBe('No valid routing solution.');
    expect(r.failedNets).toEqual([expect.objectContaining({ reason: 'NO_FREE_HOLE' })]);
    expect(r.wires).toEqual([]);
    expect(r.score).toBe(0);
  });

  it('reports partial results and keeps only the successful nets', () => {
    const c = circuit(
      [...fullColumn(), comp('D3', 'led', 'H10'), comp('D4', 'led', 'H50')],
      [wire('w1', 'A20', 'A40'), wire('w2', 'J10', 'J50')],
    );
    const r = autoRoute(c);
    expect(r.status).toBe('partial');
    expect(r.failedNets.map((f) => f.reason)).toEqual(['NO_FREE_HOLE']);
    expect(r.wires).toHaveLength(1);
    expect(r.score).toBe(0);
  });

  it('returns success with no wires for an empty circuit', () => {
    expect(autoRoute(circuit([]))).toMatchObject({ status: 'success', wires: [], failedNets: [], score: 100 });
    expect(validateCircuit(circuit([])).map((e) => e.code)).toEqual(['CIRCUIT_VALID']);
  });

  it('still routes when the user plugged wires into pin holes', () => {
    const c = circuit([comp('D1', 'led', 'C10'), comp('D2', 'led', 'C30')], [wire('u1', 'C10', 'C30')]);
    const r = autoRoute(c);
    expect(r.status).toBe('success');
    expect(r.wires).toHaveLength(1);
    expect(checkRoutingLegality(c, r.wires)).toEqual([]);
  });

  it('never shares an endpoint hole, even when a group has a single free hole', () => {
    // 第 20 欄上半只剩 E20 一個空孔，而且它在 3 群組 Net 的中間。
    const c = circuit(
      [
        comp('R1', 'resistor', 'A20', { rotation: 90, span: 1 }),
        comp('R2', 'resistor', 'C20', { rotation: 90, span: 1 }),
        comp('D1', 'led', 'C10'),
        comp('D2', 'led', 'C30'),
      ],
      [wire('u1', 'A10', 'B20'), wire('u2', 'D20', 'A30')],
    );
    const r = autoRoute(c);
    expect(r.status).toBe('success');
    const ends = r.wires.flatMap((w) => [nodeIdOf(w.start), nodeIdOf(w.end)]);
    expect(new Set(ends).size).toBe(ends.length);
    expect(checkRoutingLegality(c, r.wires)).toEqual([]);
  });

  it('produces a result that applyRouting accepts', () => {
    const c = acceptanceCircuit();
    expect(applyRouting(c, autoRoute(c)).wires.every((w) => w.source === 'auto')).toBe(true);
  });
});

// 子專案 48：協商放棄的 Net 拆掉擋路的幾個 Net 再重接。
describe('ripping up and rerouting after the negotiation gives up', () => {
  it('reconnects most of the nets one negotiation round leaves behind (BCD on EIC-1106: 6 → at most 2)', () => {
    const r = toBreadboard(bcdDiagram(), { switchTo: 'vcc', board: 'auto', pulls: true });
    if (!r.ok) throw new Error(r.reason);
    const routed = autoRoute(r.circuit, { negotiation: { maxIterations: 1 } });
    expect(routed.failedNets.length).toBeLessThanOrEqual(2);
    // 接上的線一樣通過合法性檢查（不重疊、不交叉）；只有還沒接的 Net 連接關係不同。
    const failed = new Set(routed.failedNets.map((n) => n.netId));
    expect(checkRoutingLegality(r.circuit, routed.wires).filter((v) => v.code !== 'NET_MISMATCH' || v.netIds.some((id) => !failed.has(id)))).toEqual([]);
  }, 60_000);
});
