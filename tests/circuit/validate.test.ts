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
    const errors = validateCircuit(circuit([...powered(), comp('U1', '74LS04', 'F10')], [wire('y', 'H11', 'H12')]));
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

describe('sub-project 19: switches without pulls and unused gates', () => {
  // 74LS00 在 F10，VCC / GND 接好；開關 SW1 在 F30，第 1 個開關上側（A30）接電源、下側（H30）接 1A。
  const base = (rail: 'T+30' | 'T-30', extra: ReturnType<typeof comp>[] = []) =>
    circuit(
      [comp('V1', 'vcc', 'T+3'), comp('G1', 'gnd', 'B-3'), comp('G2', 'gnd', 'T-5'), comp('U1', '74LS00', 'F10'), comp('SW1', 'dipsw-4', 'F30'), ...extra],
      [wire('pv', 'T+10', 'A10'), wire('pg', 'B-16', 'J16'), wire('top', rail, 'A30'), wire('in', 'H30', 'H10')],
    );
  const codes = (c: Circuit) => validateCircuit(c).filter((e) => e.code === 'SWITCH_NO_PULL').map((e) => e.message);

  it('warns about a switch with no pull resistor, by which rail it uses', () => {
    expect(codes(base('T+30'))).toEqual([expect.stringMatching(/^⚠ .*SW1.* 第 1 個開關沒有下拉電阻：模擬時 OFF 當成 0；實際接線時 OFF 會懸空，TTL 會讀成 1$/)]);
    expect(codes(base('T-30'))).toEqual([expect.stringMatching(/^⚠ .*SW1.* 第 1 個開關沒有上拉電阻：模擬時 OFF 當成 1；實際接線時懸空容易受雜訊影響$/)]);
    // 下側那一排再接一顆電阻到 GND：有下拉電阻，不警告。
    const pulled = circuit(
      [...base('T+30').components, comp('R1', 'resistor', 'I32')],
      [...base('T+30').wires, wire('r', 'J30', 'J32'), wire('rg', 'J36', 'B-36')],
    );
    expect(codes(pulled)).toEqual([]);
  });

  it('does not call a completely unused gate floating', () => {
    const floating = (c: Circuit) => validateCircuit(c).filter((e) => e.code === 'INPUT_FLOATING' && e.componentIds.includes('U1')).map((e) => e.message);
    // 第 1 組（1A 接開關、1B 沒接）只接了一半：1B 照樣警告；第 2–4 組完全沒用到：不警告。
    expect(floating(base('T+30'))).toEqual(['⚠ 74LS00 (U1) 第 2 腳（1B）未連接，TTL 輸入懸空會被當成 HIGH']);
  });
});

describe('unused DIP switch positions', () => {
  // SW1（4 位元）在 F30：第 1 個開關上側（A30）接 +5 V、下側（H30）接 74LS00 的 1A；第 2–4 個開關沒有用到。
  const parts = [comp('V1', 'vcc', 'T+3'), comp('G1', 'gnd', 'B-3'), comp('U1', '74LS00', 'F10'), comp('SW1', 'dipsw-4', 'F30')];
  const wires = [wire('pv', 'T+10', 'A10'), wire('pg', 'B-16', 'J16'), wire('top', 'T+30', 'A30'), wire('in', 'H30', 'H10')];
  const unconnected = (c: Circuit) => validateCircuit(c).filter((e) => e.code === 'PIN_UNCONNECTED' && e.componentIds.includes('SW1')).map((e) => e.message);

  it('does not warn about a switch whose two pins are both unconnected', () => {
    expect(unconnected(circuit(parts, wires))).toEqual([]);
  });

  it('still warns when only one pin of a switch is connected', () => {
    // 第 2 個開關的下側（F31，腳 2）接到 1B，上側（腳 7）沒接。
    const half = circuit(parts, [...wires, wire('half', 'H31', 'H11')]);
    expect(unconnected(half)).toEqual([expect.stringMatching(/SW1.* 第 7 腳未連接$/)]);
  });
});
