import { describe, expect, it } from 'vitest';
import { validateCircuit } from '../../src/core/circuit/validate';
import { applyRouting } from '../../src/core/routing/apply';
import { BLOCK_PINS } from '../../src/logic/blocks';
import { convertAndRoute } from '../../src/logic/convertRoute';
import { checkAgainstDiagram } from '../../src/logic/diagramCheck';
import { convertProblem } from '../../src/logic/synth';
import { toBreadboard } from '../../src/logic/toBreadboard';
import type { LogicDiagram, LogicNode, LogicWire } from '../../src/logic/types';
import { sequenceCombos, verifyText } from '../../src/logic/verifyBreadboard';

/** 子專案 46（規格 2026-10-24 sequential-logic 第 5 節）：時序電路轉成麵包板與比對。 */
const IN = BLOCK_PINS['74LS93'].inputs;
const OUT = BLOCK_PINS['74LS93'].outputs;
let wid = 0;
const w = (from: string, node: string, pin = 0, fromPin?: number): LogicWire => ({ id: `w${++wid}`, from, ...(fromPin ? { fromPin } : {}), to: { node, pin } });

/** 74LS93：時脈接 CKA、QA 接 CKB，QA–QD 接四個輸出端（A 最低位元）。 */
function counter(): LogicDiagram {
  const names = ['QA', 'QB', 'QC', 'QD'];
  const nodes: LogicNode[] = [
    { id: 'c1', kind: 'CLOCK', x: 0, y: 4, name: 'CLK' },
    { id: 'b1', kind: 'BLOCK', x: 6, y: 2, chip: '74LS93' },
    ...names.map((name, k): LogicNode => ({ id: `o${k + 1}`, kind: 'OUTPUT', x: 16, y: 2 + k * 2, name })),
  ];
  const wires = [w('c1', 'b1', IN.indexOf('CKA')), w('b1', 'b1', IN.indexOf('CKB'), OUT.indexOf('QA')), ...names.map((name, k) => w('b1', `o${k + 1}`, 0, OUT.indexOf(name)))];
  return { version: 1, nodes, wires };
}

describe('converting a sequential circuit', () => {
  it('converts a counter with only a clock: the IC, a clock source, unused reset pins tied to GND', () => {
    const d = counter();
    expect(convertProblem(d)).toBeNull();
    const r = toBreadboard(d, { switchTo: 'vcc', board: 'auto' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.circuit.components.filter((c) => c.defId === 'clock').map((c) => c.id)).toEqual(['CLK1']);
    const ic = r.circuit.components.find((c) => c.defId === '74LS93')!.id;
    // R0(1)、R0(2) 沒接：接 GND（第 2、3 腳）。
    expect(r.netOf[`${ic}#2`]).toBe('GND');
    expect(r.netOf[`${ic}#3`]).toBe('GND');
    expect(r.bom.ics['74LS93']).toBe(1);
  });

  it('routes it and the breadboard counts like the sequence table', () => {
    const d = counter();
    const r = convertAndRoute(d, { switchTo: 'vcc', board: 'auto' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.routed.status).toBe('success');
    const applied = applyRouting(r.result.circuit, r.routed);
    expect(validateCircuit(applied).filter((e) => e.severity === 'error')).toEqual([]);
    const check = checkAgainstDiagram(d, applied);
    if (check.kind !== 'done') throw new Error(JSON.stringify(check));
    expect(check.result).toMatchObject({ rows: 1, pulses: 16, mismatches: [] });
    expect(verifyText(check.result, check.outputs)).toBe('1 種輸入組合各送 16 個脈衝，麵包板的模擬結果和時序表全部一致');
  }, 120_000);

  it('finds a breadboard that counts wrong', () => {
    const d = counter();
    const r = convertAndRoute(d, { switchTo: 'vcc', board: 'auto' });
    if (!r.ok) throw new Error(r.reason);
    const applied = applyRouting(r.result.circuit, r.routed);
    // 邏輯圖拿掉 QA → CKB：時序表裡 QB–QD 不會變，麵包板（照原本的圖接）會數到 QB，第 2 次脈衝就不一樣。
    const d2: LogicDiagram = { ...d, wires: d.wires.filter((x) => !(x.to.node === 'b1' && x.to.pin === IN.indexOf('CKB'))) };
    const check = checkAgainstDiagram(d2, applied);
    if (check.kind !== 'done') throw new Error(JSON.stringify(check));
    expect(check.result.mismatches.length).toBeGreaterThan(0);
    expect(check.result.mismatches[0].inputs).toContain('第 2 次脈衝');
  }, 120_000);

  it('asks for a clock source on a hand-built breadboard', () => {
    const d = counter();
    const r = toBreadboard(d, { switchTo: 'vcc', board: 'auto' });
    if (!r.ok) throw new Error(r.reason);
    const noClock = { ...r.circuit, components: r.circuit.components.filter((c) => c.defId !== 'clock') };
    expect(checkAgainstDiagram(d, noClock)).toMatchObject({ kind: 'incomplete', issues: [expect.stringContaining('沒有時脈元件')] });
  });

  it('tries every combination of up to 4 other inputs, and 16 fixed ones beyond that', () => {
    expect(sequenceCombos(0)).toEqual([[]]);
    expect(sequenceCombos(2)).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]]);
    const many = sequenceCombos(6);
    expect(many).toHaveLength(16);
    expect(new Set(many.map((b) => b.join(''))).size).toBe(16);
    expect(many.map((b) => b.join(''))).toEqual(expect.arrayContaining(['000000', '111111']));
  });
});
