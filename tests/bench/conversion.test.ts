import { describe, expect, it } from 'vitest';
import { applyRouting } from '../../src/core/routing/apply';
import { convertAndRoute } from '../../src/logic/convertRoute';
import { checkAgainstDiagram } from '../../src/logic/diagramCheck';
import { bcdDiagram, majorityDiagram } from '../../src/logic/examples';
import type { ConvertOptions } from '../../src/logic/toBreadboard';
import { emptyDiagram, type LogicDiagram } from '../../src/logic/types';
import { comparator, decoder, encoder } from '../fixtures/labCircuits';

/** 子專案 44：兩個 7 段顯示器，各自接 4 個開關（BCD）。 */
function twoDisplays(): LogicDiagram {
  const nodes: LogicDiagram['nodes'] = [];
  for (let k = 0; k < 8; k++) nodes.push({ id: `i${k + 1}`, kind: 'INPUT', x: 0, y: k * 2, name: 'ABCDEFGH'[k] });
  nodes.push({ id: 'd1', kind: 'DISPLAY', x: 10, y: 0, name: 'S1' }, { id: 'd2', kind: 'DISPLAY', x: 10, y: 10, name: 'S2' });
  const wires = [0, 1].flatMap((k) => [0, 1, 2, 3].map((p) => ({ id: `w${k}${p}`, from: `i${k * 4 + p + 1}`, to: { node: `d${k + 1}`, pin: p } })));
  return { ...emptyDiagram(), nodes, wires };
}

/**
 * 子專案 36（規格 2026-10-20 conversion-placement 第 3 節）：「轉成麵包板」的量測。比較慢，不在一般的 npm test 與 CI 跑；
 * 用 npm run bench:convert 執行，結果印出來並檢查目標。
 */
const cases: Array<{ name: string; d: () => LogicDiagram; options: Partial<ConvertOptions>; board?: 'MB102' | 'EIC1106'; maxWires?: number; ics?: Record<string, number> }> = [
  { name: 'A 比較器（下拉電阻）', d: comparator, options: { pulls: true }, board: 'MB102', maxWires: 27 },
  { name: '多數決（下拉電阻）', d: majorityDiagram, options: { pulls: true }, board: 'MB102', maxWires: 28 },
  { name: 'B 解碼器', d: () => decoder(), options: {}, board: 'MB102' },
  // 子專案 37：輸出端設成低態致動（LED 正極接 +5 V）。
  { name: 'B 解碼器（低態致動 LED）', d: () => decoder(true), options: {}, board: 'MB102' },
  // 子專案 38（實習七 C）：共用 2 輸入 OR（2 片 74LS32）、EIC-1106 一排擺法、加上下拉電阻時兩個 4 位元開關。
  { name: 'C 編碼器', d: encoder, options: {}, maxWires: 62, ics: { '74LS32': 2 } },
  { name: 'C 編碼器（下拉電阻）', d: encoder, options: { pulls: true }, maxWires: 62, ics: { '74LS32': 2 } },
  { name: 'BCD 範例', d: bcdDiagram, options: {}, maxWires: 60 },
  // 子專案 44：共用一顆電阻（兩個顯示器時的預設）；每段一顆時 10 條排不完。
  { name: '兩個 7 段顯示器（共用電阻）', d: twoDisplays, options: {}, board: 'EIC1106' },
];

describe('logic-to-breadboard measurements', () => {
  for (const c of cases)
    it(c.name, () => {
      const d = c.d();
      const started = performance.now();
      const r = convertAndRoute(d, { switchTo: 'vcc', board: 'auto', ...c.options });
      const ms = Math.round(performance.now() - started);
      if (!r.ok) throw new Error(r.reason);
      const { metrics } = r.routed;
      console.log(`MEASURE ${c.name}: ${r.result.bom.layout} ${r.routed.status} ${metrics.wireCount} 條線、總長 ${metrics.totalLength}、交叉 ${metrics.crossings}、試了 ${r.tried} 種擺法、${ms} ms`);
      expect(r.routed.status).toBe('success');
      // 子專案 39：不能有交叉。
      expect(metrics.crossings).toBe(0);
      if (c.board) expect(r.result.bom.layout).toBe(c.board);
      if (c.maxWires) expect(metrics.wireCount).toBeLessThanOrEqual(c.maxWires);
      if (c.ics) expect(r.result.bom.ics).toEqual(c.ics);
      expect(ms).toBeLessThan(45_000);
      expect(checkAgainstDiagram(d, applyRouting(r.result.circuit, r.routed))).toMatchObject({ kind: 'done', result: { mismatches: [] } });
    }, 120_000);
});
