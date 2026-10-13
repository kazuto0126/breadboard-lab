import { describe, expect, it } from 'vitest';
import { validateCircuit } from '../../src/core/circuit/validate';
import { AI_SYSTEM_INSTRUCTION, circuitBrief, firstMessage, holeRule, issueBrief, sameTopic, wireBrief } from '../../src/editor/explain/brief';
import { board, circuit, comp, straightWire, wire } from '../fixtures/build';

/** 和 explain.test.ts 一樣：74LS00 第 1 腳在 F10，VCC 在 T+3、GND 在 B-3，第 7 腳已接 GND，第 14 腳還沒接。 */
const icCircuit = () => circuit([comp('U1', '74LS00', 'F10'), comp('V1', 'vcc', 'T+3'), comp('G1', 'gnd', 'B-3')], [wire('g1', 'J16', 'B-16')]);
const vccIssue = (c: ReturnType<typeof icCircuit>) => validateCircuit(c).find((e) => e.code === 'IC_POWER_MISSING')!;

describe('circuit brief for Gemini', () => {
  it('lists every component pin with its hole, the wires and the nets', () => {
    const text = circuitBrief(icCircuit());
    expect(text).toContain('【電路摘要】');
    expect(text).toContain('麵包板：b1');
    expect(text).toContain('- U1 74LS00 — 四組 2 輸入 NAND 閘');
    expect(text).toContain('第 1 腳 1A @ F10');
    expect(text).toContain('第 7 腳 GND @ F16');
    expect(text).toContain('第 14 腳 VCC @ E10');
    expect(text).toContain('- V1 VCC 5 V');
    expect(text).toContain('- g1：J16 → B-16');
    expect(text).toMatch(/- GND（地）：.*U1 第 7 腳（GND）/);
    expect(text).toMatch(/- GND（地）：.*G1 第 1 腳（GND）/);
    expect(text).toMatch(/沒有和其他腳相連的腳：.*U1 第 14 腳（VCC）/);
  });

  it('adds resistor values, LED colours, wire colours and board ids', () => {
    const c = circuit(
      [comp('R1', 'resistor', 'A20', { props: { resistance: 220 } }), comp('D1', 'led', 'A30', { props: { color: 'green' } }), comp('R2', 'resistor', 'A20', { board: 'b2' })],
      [{ ...wire('w1', 'B20', 'B30'), color: '#d32f2f' }],
      [board('b1'), board('b2', 0, 20)],
    );
    const text = circuitBrief(c);
    expect(text).toContain('麵包板：b1、b2');
    expect(text).toContain('- R1 Resistor 220Ω');
    expect(text).toContain('第 1 腳 @ b1:A20');
    expect(text).toContain('- D1 LED 綠色');
    expect(text).toContain('b2:A20');
    expect(text).toContain('- w1（紅色）：b1:B20 → b1:B30');
  });

  it('says so when there is nothing yet', () => {
    const text = circuitBrief(circuit([]));
    expect(text).toContain('元件：（沒有）');
    expect(text).toContain('導線：（沒有）');
    expect(text).toContain('連在一起的腳（Net）：（沒有）');
  });

  it('describes the issue with the offline steps written as hole names', () => {
    const c = icCircuit();
    const text = issueBrief(c, vccIssue(c));
    expect(text).toContain('【學生正在看的錯誤】');
    expect(text).toContain(vccIssue(c).message);
    expect(text).toContain('為什麼：74LS 晶片要從 VCC 腳拿 +5 V');
    expect(text).toMatch(/1\. .*A10.*T\+10/);
    expect(text).not.toMatch(/\{\d\}/);
  });

  it('puts the brief, the issue and the trimmed question in that order', () => {
    const c = icCircuit();
    const m = firstMessage(c, { kind: 'issue', issue: vccIssue(c) }, '  為什麼會這樣？ \n');
    expect(m.indexOf('【電路摘要】')).toBe(0);
    expect(m.indexOf('【學生正在看的錯誤】')).toBeGreaterThan(0);
    expect(m.endsWith('【學生的問題】\n為什麼會這樣？')).toBe(true);
    expect(AI_SYSTEM_INSTRUCTION).toContain('繁體中文');
  });
});

describe('wire brief for Gemini', () => {
  const routed = () =>
    circuit([comp('R1', 'resistor', 'A10'), comp('R2', 'resistor', 'H20')], [
      { ...straightWire('w1', 'B14', 'B20'), source: 'auto' },
      { ...straightWire('w2', 'E20', 'G20'), source: 'auto' },
    ]);

  it('describes the wire, its chain and the routing rules for auto wires', () => {
    const m = firstMessage(routed(), { kind: 'wire', wireId: 'w1' }, '為什麼這樣走？');
    expect(m).toMatch(/^【電路摘要】/);
    expect(m).toContain('【學生正在看的導線】\nw1（AI 標準佈線）：B14 → B20');
    expect(m).toContain('這段連線共 2 條線：');
    expect(m).toContain('為什麼不一條線直接接：');
    expect(m).toContain('【AI 標準佈線的規則】');
    expect(m.endsWith('【學生的問題】\n為什麼這樣走？')).toBe(true);
  });

  it('leaves the rules out for manual wires', () => {
    const c = circuit([comp('R1', 'resistor', 'A10')], [straightWire('m1', 'B14', 'B20')]);
    const m = wireBrief(c, 'm1');
    expect(m).toContain('m1（學生手動接的線）');
    expect(m).not.toContain('【AI 標準佈線的規則】');
    expect(m).not.toContain('為什麼不一條線直接接');
  });

  it('explains EIC-1106 hole names only when the circuit has that board', () => {
    expect(holeRule(circuit([]))).not.toContain('P1');
    const eic = circuit([], [], [board('b1', 0, 0, 'EIC1106')]);
    expect(holeRule(eic)).toMatch(/1-A15/);
    expect(holeRule(eic)).toMatch(/P1.*P5/);
    expect(circuitBrief(eic)).toContain(holeRule(eic));
    expect(AI_SYSTEM_INSTRUCTION).toContain('1-A15');
    expect(AI_SYSTEM_INSTRUCTION).toContain('U1 第 3 腳');
  });

  it('compares topics by issue reference or wire id', () => {
    const c = icCircuit();
    const issue = vccIssue(c);
    expect(sameTopic({ kind: 'issue', issue }, { kind: 'issue', issue })).toBe(true);
    expect(sameTopic({ kind: 'wire', wireId: 'w1' }, { kind: 'wire', wireId: 'w1' })).toBe(true);
    expect(sameTopic({ kind: 'wire', wireId: 'w1' }, { kind: 'wire', wireId: 'w2' })).toBe(false);
    expect(sameTopic({ kind: 'issue', issue }, { kind: 'wire', wireId: 'w1' })).toBe(false);
  });
});

describe('asking about the whole routing', () => {
  it('compares routing topics by result and sends the summary with the rules', async () => {
    const { autoRoute } = await import('../../src/core/routing/autoRoute');
    const { applyRouting } = await import('../../src/core/routing/apply');
    const { analyzeCircuit } = await import('../../src/editor/analysis');
    const before = circuit([comp('R1', 'resistor', 'A10'), comp('R2', 'resistor', 'H20')], [straightWire('w1', 'B14', 'I20')]);
    const result = autoRoute(before);
    const after = applyRouting(before, result);
    const topic = { kind: 'routing' as const, result };
    expect(sameTopic(topic, { kind: 'routing', result })).toBe(true);
    expect(sameTopic(topic, { kind: 'routing', result: { ...result } })).toBe(false);
    expect(sameTopic(topic, { kind: 'wire', wireId: 'w1' })).toBe(false);
    const text = firstMessage(after, topic, ' 整體說明這次佈線 ', { beforeScore: analyzeCircuit(before).routing, result });
    expect(text).toContain('【電路摘要】');
    expect(text).toContain('【這次 AI 標準佈線】');
    expect(text).toMatch(/佈線成功：\d+ 條線/);
    expect(text).toContain('【AI 標準佈線的規則】');
    expect(text.endsWith('【學生的問題】\n整體說明這次佈線')).toBe(true);
    // 沒有佈線結果時只附規則。
    expect(firstMessage(after, topic, 'q')).not.toContain('【這次 AI 標準佈線】');
    expect(AI_SYSTEM_INSTRUCTION).toContain('學生問整次佈線時');
  });
});
