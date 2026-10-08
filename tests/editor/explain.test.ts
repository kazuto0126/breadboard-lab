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

void texts;
void issueOf;
