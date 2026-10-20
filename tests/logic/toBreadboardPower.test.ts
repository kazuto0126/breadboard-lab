import { describe, expect, it } from 'vitest';
import { autoPlaceAndRoute } from '../../src/core/icPlacement/autoPlace';
import { applyRouting } from '../../src/core/routing/apply';
import { checkAgainstDiagram } from '../../src/logic/diagramCheck';
import { bcdDiagram, majorityDiagram } from '../../src/logic/examples';
import { toBreadboard, type ConvertOptions } from '../../src/logic/toBreadboard';
import type { LogicDiagram } from '../../src/logic/types';
import { powerProblems } from '../fixtures/powerChecks';

/** 子專案 34（規格 2026-10-19 nearest-power-rails）：轉成麵包板時電源接最近的軌、軌和軌之間不拉線。 */
const convert = (d: LogicDiagram, options: Partial<ConvertOptions>) => {
  const r = toBreadboard(d, { switchTo: 'vcc', board: 'auto', ...options });
  if (!r.ok) throw new Error(r.reason);
  return r;
};

describe('power in converted breadboards', () => {
  const cases: Array<[string, LogicDiagram, Partial<ConvertOptions>]> = [
    ['majority on MB-102', majorityDiagram(), { board: 'MB102' }],
    ['majority on EIC-1106', majorityDiagram(), { board: 'EIC1106' }],
    ['BCD, common anode', bcdDiagram(), {}],
    ['BCD, common cathode', bcdDiagram(), { display: 'cc' }],
    // 只用 NAND 在 MB-102 排不完（網頁會自動改用 EIC-1106 再轉一次），所以直接用 EIC-1106。
    ['majority, NAND only', majorityDiagram(), { gates: 'nand', board: 'EIC1106' }],
    ['majority with buttons', majorityDiagram(), { inputs: 'button', board: 'MB102' }],
    ['majority with pull resistors, switches to GND', majorityDiagram(), { pulls: true, switchTo: 'gnd', board: 'MB102' }],
  ];
  for (const [name, d, options] of cases) {
    it(`${name}: every power pin goes to its nearest rail, no rail-to-rail wires, still matches the diagram`, () => {
      const r = convert(d, options);
      expect(powerProblems(r.circuit)).toEqual([]);
      expect(checkAgainstDiagram(d, r.circuit)).toMatchObject({ kind: 'done', result: { mismatches: [] } });
    });
  }

  for (const [name, d, options] of [cases[0], cases[2], cases[4]]) {
    it(`${name}: still holds after IC-moving routing`, () => {
      const r = convert(d, options);
      // 子專案 39：不准交叉後佈線比較難，整套平行跑時 6 秒不夠（單獨跑約 3 秒）。這裡測的是電源接法，不是速度。
      const routed = autoPlaceAndRoute(r.circuit, { placement: { nearestPowerRail: true, timeBudgetMs: 20_000 } });
      expect(routed.status).toBe('success');
      const applied = applyRouting(r.circuit, routed);
      expect(powerProblems(applied)).toEqual([]);
      expect(checkAgainstDiagram(d, applied)).toMatchObject({ kind: 'done', result: { mismatches: [] } });
    }, 120_000);
  }
});
