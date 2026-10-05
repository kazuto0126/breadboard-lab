import { describe, expect, it } from 'vitest';
import { validateCircuit } from '../../src/core/circuit/validate';
import type { Circuit } from '../../src/types/circuit';
import { circuit, comp, pt, wire } from '../fixtures/build';

const codes = (c: Circuit) => validateCircuit(c).map((e) => e.code);

/** VCC → R1 → LED → GND，接線乾淨。 */
function ledCircuit(): Circuit {
  return circuit(
    [comp('V1', 'vcc', 'T+5'), comp('G1', 'gnd', 'B-5'), comp('R1', 'resistor', 'C20'), comp('D1', 'led', 'C30')],
    [wire('w1', 'T+21', [21, 3], 'A20'), wire('w2', 'B24', 'B30'), wire('w3', 'E31', 'B-31')],
  );
}

const powered = () => [comp('V1', 'vcc', 'T+5'), comp('G1', 'gnd', 'B-5')];

describe('validateCircuit', () => {
  it('accepts a clean LED circuit', () => {
    expect(validateCircuit(ledCircuit())).toEqual([
      expect.objectContaining({ code: 'CIRCUIT_VALID', severity: 'info', message: '✓ Circuit Valid：電路檢查通過' }),
    ]);
  });

  it('accepts an empty circuit', () => {
    expect(codes(circuit([]))).toEqual(['CIRCUIT_VALID']);
  });

  it('flags pins off holes, parts past the board edge and unknown boards without throwing', () => {
    expect(codes(circuit([comp('D1', 'led', [12, 9])]))).toContain('PLACEMENT_INVALID');
    expect(codes(circuit([comp('R1', 'resistor', 'A62')]))).toContain('PLACEMENT_INVALID');
    expect(codes(circuit([{ ...comp('R1', 'resistor', 'A10'), boardId: 'b9' }]))).toContain('PLACEMENT_INVALID');
  });

  it('flags two pins in one hole', () => {
    expect(codes(circuit([comp('D1', 'led', 'A10'), comp('D2', 'led', 'A10')]))).toContain('PIN_COLLISION');
  });

  it('flags overlapping bodies', () => {
    expect(codes(circuit([comp('R1', 'resistor', 'A20'), comp('D1', 'led', 'A22')]))).toContain('BODY_OVERLAP');
  });

  it('flags broken, blocked and overlapping wires', () => {
    const base = ledCircuit();
    const diagonal = { ...wire('wx', 'A40', 'A41'), path: [pt(40, 4), pt(41, 5)], end: pt(41, 5) };
    expect(codes({ ...base, wires: [...base.wires, diagonal] })).toContain('WIRE_PATH_INVALID');
    expect(codes({ ...base, wires: [...base.wires, wire('wy', 'A40', [40, 9])] })).toContain('WIRE_ENDPOINT_INVALID');
    expect(codes({ ...base, wires: [...base.wires, wire('wz', 'A18', 'A26')] })).toContain('WIRE_THROUGH_OBSTACLE');
    expect(codes({ ...base, wires: [...base.wires, wire('wo', 'B23', 'B27')] })).toContain('WIRE_OVERLAP');
  });

  it('flags a short between VCC and GND', () => {
    expect(codes(circuit([comp('V1', 'vcc', 'T+5'), comp('G1', 'gnd', 'T+9')]))).toContain('SHORT_CIRCUIT');
  });

  it('flags an IC rotated so that its pins share a strip', () => {
    expect(codes(circuit([...powered(), comp('U1', '74LS00', 'A30', { rotation: 90 })]))).toContain('IC_PIN_SHORT');
  });

  it('flags an IC whose VCC and GND pins are not powered', () => {
    const errors = validateCircuit(circuit([...powered(), comp('U1', '74LS00', 'F10')]));
    expect(errors.filter((e) => e.code === 'IC_POWER_MISSING').map((e) => e.message)).toEqual([
      '74LS00 (U1) 第 7 腳 GND 未連接',
      '74LS00 (U1) 第 14 腳 VCC 未連接',
    ]);
  });

  it('flags outputs wired together and outputs wired to a supply', () => {
    const parts = [...powered(), comp('U1', '74LS04', 'F10')];
    expect(codes(circuit(parts, [wire('w1', 'J11', 'J20'), wire('w2', 'I13', 'I20')]))).toContain('OUTPUT_CONFLICT');
    expect(codes(circuit(parts, [wire('w1', 'J11', [11, 16], 'B-11')]))).toContain('OUTPUT_CONFLICT');
  });

  it('flags a circuit with parts but no power source', () => {
    expect(codes(circuit([comp('R1', 'resistor', 'A10')]))).toContain('NO_POWER_SOURCE');
  });

  it('warns about floating IC inputs', () => {
    const errors = validateCircuit(circuit([...powered(), comp('U1', '74LS04', 'F10')]));
    expect(errors.find((e) => e.code === 'INPUT_FLOATING')).toMatchObject({
      severity: 'warning',
      message: expect.stringContaining('第 1 腳（1A）未連接'),
    });
  });

  it('warns about unconnected passive pins', () => {
    expect(codes(circuit([comp('V1', 'vcc', 'T+5'), comp('R1', 'resistor', 'A10')]))).toContain('PIN_UNCONNECTED');
  });

  it('warns about a reversed LED without a resistor', () => {
    const c = circuit(
      [...powered(), comp('D1', 'led', 'C30')],
      [wire('w1', 'E30', 'B-30'), wire('w2', 'A31', [31, 3], 'T+31')],
    );
    expect(codes(c)).toEqual(expect.arrayContaining(['LED_REVERSED', 'LED_NO_RESISTOR']));
  });

  it('warns about a resistor whose two leads share a strip', () => {
    expect(codes(circuit([comp('V1', 'vcc', 'T+5'), comp('R1', 'resistor', 'A20', { rotation: 90, span: 1 })]))).toContain(
      'COMPONENT_SHORTED',
    );
  });
});
