import { describe, expect, it } from 'vitest';
import { validateCircuit } from '../../src/core/circuit/validate';
import { explainIssue, plainText } from '../../src/editor/explain';
import { ISSUE_TEXT } from '../../src/editor/explain/generic';
import { chooseRail, freeHolesInGroup } from '../../src/editor/explain/helpers';
import type { Circuit, CircuitError, CircuitErrorCode } from '../../src/types/circuit';
import { circuit, comp, hole, wire } from '../fixtures/build';

const fake = (code: CircuitErrorCode, over: Partial<CircuitError> = {}): CircuitError => ({
  code,
  severity: 'error',
  message: 'x',
  points: [],
  componentIds: [],
  wireIds: [],
  netIds: [],
  ...over,
});
const texts = (c: Circuit, issue: CircuitError) => explainIssue(c, issue).steps.map((s) => plainText(c, s));
const issueOf = (c: Circuit, code: CircuitErrorCode, at?: string) =>
  validateCircuit(c).find((e) => e.code === code && (!at || e.points.some((p) => p.x === hole(at).x && p.y === hole(at).y)))!;
const names = (_c: Circuit, points: Array<{ x: number; y: number }>) => points.map((p) => `${p.x},${p.y}`);

/** 74LS00 跨在凹槽上：第 1–7 腳在 F10–F16，第 14–8 腳在 E10–E16；VCC 在 T+3、GND 在 B-3，第 7 腳已接 GND。 */
const icBase = () => [comp('U1', '74LS00', 'F10'), comp('V1', 'vcc', 'T+3'), comp('G1', 'gnd', 'B-3')];
const gndWire = () => wire('g1', 'J16', 'B-16');

describe('explanations: shared parts', () => {
  const generic: CircuitErrorCode[] = [
    'PLACEMENT_INVALID',
    'PIN_COLLISION',
    'BODY_OVERLAP',
    'WIRE_ENDPOINT_INVALID',
    'WIRE_PATH_INVALID',
    'WIRE_THROUGH_OBSTACLE',
    'WIRE_OVERLAP',
    'IC_PIN_SHORT',
    'OUTPUT_CONFLICT',
    'COMPONENT_SHORTED',
  ];

  it('gives every text-only issue a reason and at least one step', () => {
    for (const code of generic) {
      const e = explainIssue(circuit([]), fake(code));
      expect(e.why, code).toBe(ISSUE_TEXT[code].why);
      expect(e.steps.length, code).toBeGreaterThan(0);
      expect(e.holes, code).toEqual([]);
    }
  });

  it('falls back to the generic text when an explainer cannot read the issue', () => {
    const e = explainIssue(circuit([]), fake('IC_POWER_MISSING'));
    expect(e.why).toBe(ISSUE_TEXT.IC_POWER_MISSING.why);
    expect(e.steps.map((s) => s.text)).toEqual([ISSUE_TEXT.IC_POWER_MISSING.fix]);
  });

  it('lists free holes of a row and picks the rail on the same side that carries power', () => {
    const c = circuit(icBase(), [gndWire()]);
    expect(names(c, freeHolesInGroup(c, hole('E10')))).toEqual(names(c, ['A10', 'B10', 'C10', 'D10'].map(hole)));
    expect(chooseRail(c, hole('E10'), '+')).toEqual({ rail: 'T+', powered: true });
    expect(chooseRail(c, hole('F16'), '+')).toEqual({ rail: 'T+', powered: true });
    expect(chooseRail(c, hole('E10'), '-')).toEqual({ rail: 'B-', powered: true });
    expect(chooseRail(circuit([comp('U1', '74LS00', 'F10')]), hole('F16'), '-')).toEqual({ rail: 'B-', powered: false });
  });

  it('writes hole names into the step text', () => {
    const c = circuit(icBase(), [gndWire()]);
    expect(plainText(c, { text: '從 {0} 到 {1}', holes: [hole('A10'), hole('T+10')] })).toBe('從 A10 到 T+10');
  });
});

const withWire = (c: Circuit, path: Circuit['wires'][number]['path']): Circuit => ({
  ...c,
  wires: [...c.wires, { id: 'sug', color: '#22c55e', source: 'manual', start: path[0], end: path[path.length - 1], path }],
});

describe('explanations: power', () => {
  it('suggests a wire from the VCC pin row to the + rail, and following it fixes the issue', () => {
    const c = circuit(icBase(), [gndWire()]);
    const issue = issueOf(c, 'IC_POWER_MISSING', 'E10');
    const e = explainIssue(c, issue);
    expect(texts(c, issue)).toEqual(['從 U1 第 14 腳（VCC）那一排的空孔 A10，拉一條線到上方的 + 電源軌 T+10。']);
    expect(names(c, e.holes)).toEqual(names(c, [hole('A10'), hole('T+10')]));
    expect(e.wires).toHaveLength(1);
    const fixed = withWire(c, e.wires[0]);
    expect(validateCircuit(fixed).some((x) => x.code === 'IC_POWER_MISSING' && x.points[0].x === 10 && x.points[0].y === hole('E10').y)).toBe(false);
  });

  it('asks to place a GND first when no rail carries ground, without reusing that hole for the wire', () => {
    const c = circuit([comp('U1', '74LS00', 'F10'), comp('V1', 'vcc', 'T+3')], [wire('v1', 'A10', 'T+10')]);
    const issue = issueOf(c, 'IC_POWER_MISSING', 'F16');
    expect(texts(c, issue)).toEqual([
      '先從元件庫放一個 GND 到下方的 − 電源軌，例如 B-3。',
      '從 U1 第 7 腳（GND）那一排的空孔 J16，拉一條線到下方的 − 電源軌 B-16。',
    ]);
  });

  it('uses the other + rail when only that one has power', () => {
    const c = circuit([comp('U1', '74LS00', 'F10'), comp('V1', 'vcc', 'B+3'), comp('G1', 'gnd', 'B-3')], [gndWire()]);
    expect(texts(c, issueOf(c, 'IC_POWER_MISSING', 'E10'))).toEqual(['從 U1 第 14 腳（VCC）那一排的空孔 D10，拉一條線到下方的 + 電源軌 B+10。']);
  });

  it('says so when the pin row has no free hole', () => {
    const full = ['A', 'B', 'C', 'D'].map((r, i) => wire(`x${i}`, `${r}10`, `${r}${20 + i}`));
    const c = circuit(icBase(), [gndWire(), ...full]);
    const e = explainIssue(c, issueOf(c, 'IC_POWER_MISSING', 'E10'));
    expect(e.steps.map((s) => plainText(c, s))).toEqual(['U1 第 14 腳（VCC）那一排已經沒有空孔，請先移開那一排上的導線或元件，再拉線到上方的 + 電源軌。']);
    expect(e.holes).toEqual([]);
  });

  it('places VCC and GND on the rails when the circuit has no power at all', () => {
    const c = circuit([comp('U1', '74LS00', 'F10')]);
    const issue = issueOf(c, 'NO_POWER_SOURCE');
    expect(texts(c, issue)).toEqual([
      '從元件庫放一個 VCC 到上方的 + 電源軌，例如 T+3。',
      '從元件庫放一個 GND 到下方的 − 電源軌，例如 B-3。',
      '再把 IC 的 VCC 腳接到 + 軌、GND 腳接到 − 軌；其他元件也從這兩條軌拿電。',
    ]);
  });

  it('offers to tie an unused input to the + rail, and following it fixes the warning', () => {
    const c = circuit(icBase(), [gndWire(), wire('v1', 'A10', 'T+10')]);
    const issue = issueOf(c, 'INPUT_FLOATING', 'F10');
    const e = explainIssue(c, issue);
    expect(texts(c, issue)).toEqual([
      '如果這隻腳要用：從 G10 拉線到開關，或其他閘的輸出腳所在的那一排。',
      '如果用不到：從 U1 第 1 腳（1A）那一排的空孔 G10，拉一條線到上方的 + 電源軌 T+9，讓它固定是 HIGH。',
    ]);
    const fixed = withWire(c, e.wires[0]);
    expect(validateCircuit(fixed).some((x) => x.code === 'INPUT_FLOATING' && x.points[0].x === 10 && x.points[0].y === hole('F10').y)).toBe(false);
  });
});

describe('explanations: parts', () => {
  it('points at the free hole nearest the centre channel of an unconnected leg', () => {
    const c = circuit([comp('R1', 'resistor', 'A30')]);
    expect(texts(c, issueOf(c, 'PIN_UNCONNECTED', 'A30'))).toEqual([
      '從 R1 第 1 腳（1）那一排的空孔 E30 拉線到要接的地方（電源軌，或另一個元件的腳所在的那一排）。',
    ]);
  });

  /** 陽極接 GND、陰極接 VCC 的 LED。 */
  const reversed = () =>
    circuit(
      [comp('D1', 'led', 'G40'), comp('V1', 'vcc', 'B+3'), comp('G1', 'gnd', 'B-3')],
      [wire('a1', 'J40', 'B-40'), wire('k1', 'J41', 'B+41')],
    );

  it('shows where the anode and the cathode are when an LED is reversed', () => {
    const c = reversed();
    const e = explainIssue(c, issueOf(c, 'LED_REVERSED'));
    expect(names(c, e.holes)).toEqual(names(c, [hole('G40'), hole('G41')]));
    expect(e.steps.map((s) => plainText(c, s))[0]).toBe('陽極（A）現在在 G40、陰極（K）在 G41：實體 LED 拔起來轉半圈再插回去，讓陽極改插 G41、陰極改插 G40。');
  });

  /** 陽極接 VCC、陰極直接接 GND，沒有限流電阻。 */
  const bare = () =>
    circuit(
      [comp('D1', 'led', 'G40'), comp('V1', 'vcc', 'B+3'), comp('G1', 'gnd', 'B-3')],
      [wire('a1', 'J40', 'B+40'), wire('k1', 'J41', 'B-41')],
    );

  it('places a resistor on the cathode side and moves the cathode wire, which fixes the warning', () => {
    const c = bare();
    const e = explainIssue(c, issueOf(c, 'LED_NO_RESISTOR'));
    expect(e.steps.map((s) => plainText(c, s))).toEqual([
      '電阻（元件庫的 220Ω）一腳插在 LED 陰極那一排的 F41，另一腳插在 F45。',
      '把 k1 插在 J41 的那一端拔起來，改插到 J45。',
    ]);
    expect(e.removeWireIds).toEqual(['k1']);
    const path = e.wires[0];
    const fixed: Circuit = {
      ...c,
      components: [...c.components, comp('R9', 'resistor', 'F41', { props: { resistance: 220 } })],
      wires: [...c.wires.filter((w) => w.id !== 'k1'), { id: 'k2', color: '#000000', source: 'manual', start: path[0], end: path[path.length - 1], path }],
    };
    expect(validateCircuit(fixed).some((x) => x.code === 'LED_NO_RESISTOR')).toBe(false);
  });

  it('wires the new resistor row to ground when the cathode was not connected', () => {
    const c = circuit([comp('D1', 'led', 'G40'), comp('V1', 'vcc', 'B+3'), comp('G1', 'gnd', 'B-3')], [wire('a1', 'J40', 'B+40')]);
    expect(texts(c, issueOf(c, 'LED_NO_RESISTOR'))).toEqual([
      '電阻（元件庫的 220Ω）一腳插在 LED 陰極那一排的 F41，另一腳插在 F45。',
      '從電阻另一腳那一排的空孔 J45，拉一條線到下方的 − 電源軌 B-45。',
    ]);
  });
});
