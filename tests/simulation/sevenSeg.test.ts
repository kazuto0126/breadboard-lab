import { describe, expect, it } from 'vitest';
import { getComponentDefinition } from '../../src/core/circuit/library';
import { validateCircuit } from '../../src/core/circuit/validate';
import { BCD_GLYPHS } from '../../src/core/simulation/models';
import { darkReasonText, whyDark } from '../../src/core/simulation/darkDisplay';
import { compileSimulation, initialSimState, settle } from '../../src/core/simulation/simulate';
import { parseCircuitText, serializeCircuitFile } from '../../src/editor/fileFormat';
import { formatCapacitance, librarySections } from '../../src/editor/library';
import type { Circuit } from '../../src/types/circuit';
import { circuit, comp, wire } from '../fixtures/build';

/**
 * 74LS47 在 F15：第 1–8 腳 F15–F22（B C /LT /BI /RBI D A GND），第 9–16 腳 E22–E15（/e /d /c /b /a /g /f VCC）。
 * 7 段顯示器 DS1 在 H45（兩排間距 6）：下排 H45–H49 = e d CA c dp，上排 D49–D45 = b a CA f g。
 * 每一段經一顆直立跨過凹槽的電阻（第 25、27…37 欄）：74LS47 的輸出 → 電阻上端，電阻下端 → 段。
 */
function display(value: number, opts: { resistors?: boolean; anodeToGround?: boolean; cathode?: boolean; commonToVcc?: boolean } = {}): Circuit {
  const resistors = opts.resistors ?? true;
  const bits = [0, 1, 2, 3].map((i) => (value >> i) & 1);
  // 輸入：1 = 接 VCC（T+），0 = 接 GND（B-）。A 第 7 腳 F21、B 第 1 腳 F15、C 第 2 腳 F16、D 第 6 腳 F20。
  const inputCols = [21, 15, 16, 20];
  // 電源軌在第 20 欄沒有孔，D 改接到第 19 欄的軌。
  const rail = (col: number) => (col === 20 ? 19 : col);
  const inputs = inputCols.map((col, i) => (bits[i] ? wire(`in${i}`, `J${col}`, `T+${rail(col)}`) : wire(`in${i}`, `J${col}`, `B-${rail(col)}`)));
  // 段 → 74LS47 輸出的欄（上半）與顯示器腳的孔。
  const segs: Array<[string, number, string]> = [
    ['a', 18, 'A48'],
    ['b', 19, 'A49'],
    ['c', 20, 'J48'],
    ['d', 21, 'J46'],
    ['e', 22, 'J45'],
    ['f', 16, 'A46'],
    ['g', 17, 'A45'],
  ];
  // 子專案 32：cathode 時改用 74LS48（腳位和 74LS47 一樣）與共陰極顯示器。
  const parts = [comp('V1', 'vcc', 'T+3'), comp('G1', 'gnd', 'B-3'), comp('U1', opts.cathode ? '74LS48' : '74LS47', 'F15'), comp('DS1', opts.cathode ? '7seg-cc' : '7seg-ca', 'H45')];
  const wires = [wire('vcc', 'T+15', 'A15'), wire('gnd', 'J22', 'B-22'), ...inputs];
  segs.forEach(([name, col, hole], i) => {
    if (resistors) {
      const x = 25 + 2 * i;
      // 電阻直立跨過凹槽：第 1 腳在 E 列（上半）、第 2 腳在 F 列（下半），兩腳在不同的排。
      parts.push(comp(`R${i + 1}`, 'resistor', [x, 8], { rotation: 90, span: 3 }));
      wires.push(wire(`${name}1`, `A${col}`, [x, 4]), wire(`${name}2`, [x, 15], hole));
    } else {
      wires.push(wire(name, `A${col}`, hole));
    }
  });
  if (opts.cathode) wires.push(opts.commonToVcc ? wire('cc', 'A47', 'T+47') : wire('cc', 'J47', 'B-47'));
  else wires.push(opts.anodeToGround ? wire('ca', 'J47', 'B-47') : wire('ca', 'A47', 'T+47'));
  return circuit(parts, wires);
}
const segments = (c: Circuit) => {
  const sim = compileSimulation(c);
  return settle(sim, initialSimState(sim), { pressed: {}, clocks: {} }).result.litSegments.DS1;
};

describe('7-segment display driven by a 74LS47', () => {
  it('shows every digit 0–9', () => {
    for (let n = 0; n < 10; n++) expect(segments(display(n)).join(''), String(n)).toBe(BCD_GLYPHS[n]);
  });

  it('is a common-anode part that the IC mover leaves alone', () => {
    const def = getComponentDefinition('7seg-ca')!;
    expect(def.category).toBe('seven-seg');
    expect(def.internalConnections).toEqual([[3, 8]]);
    expect(def.pins.filter((p) => p.role === 'anode').map((p) => p.number)).toEqual([3, 8]);
  });
});

describe('Check Circuit for 7-segment displays', () => {
  const codes = (c: Circuit) => validateCircuit(c).filter((e) => e.componentIds.includes('DS1')).map((e) => e.code);

  it('is quiet when every segment has a resistor and dp is unused', () => {
    expect(codes(display(8))).toEqual([]);
  });
  it('warns about segments without a resistor', () => {
    const issues = validateCircuit(display(8, { resistors: false })).filter((e) => e.code === 'LED_NO_RESISTOR');
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('a、b、c、d、e、f、g');
  });
  it('warns when the common anode goes to GND', () => {
    expect(codes(display(8, { anodeToGround: true }))).toContain('LED_REVERSED');
  });
});

describe('capacitors', () => {
  it('appear in their own library section with µF names', () => {
    const section = librarySections().find((s) => s.id === 'capacitor')!;
    expect(section.items.map((i) => i.name)).toEqual(['0.01 µF 陶瓷電容', '0.1 µF 陶瓷電容', '1 µF 電解電容', '10 µF 電解電容', '100 µF 電解電容']);
    expect(formatCapacitance(1e-5)).toBe('10 µF');
  });

  it('do not change any level in the simulation', () => {
    const c = circuit([comp('V1', 'vcc', 'T+3'), comp('C1', 'capacitor-electrolytic', 'G10', { props: { capacitance: 1e-5 } })], [wire('w', 'J10', 'T+10')]);
    const sim = compileSimulation(c);
    const r = settle(sim, initialSimState(sim), { pressed: {}, clocks: {} }).result;
    expect(r.pinLevels['C1#1']).toBe(1);
    expect(r.pinLevels['C1#2']).toBe('Z');
  });

  /** 存檔後再讀回來的電路。 */
  const reload = (c: Circuit): Circuit => {
    const r = parseCircuitText(serializeCircuitFile(c, 'test'));
    if (!r.ok) throw new Error(r.error);
    return r.circuit;
  };

  it('keep their capacitance through save and load; old files without it still load', () => {
    const c = circuit([comp('C1', 'capacitor-ceramic', 'G10', { props: { capacitance: 1e-8 } })]);
    expect(reload(c).components[0].props.capacitance).toBe(1e-8);
    const old = circuit([comp('C1', 'capacitor-ceramic', 'G10')]);
    expect(reload(old).components[0].props.capacitance).toBeUndefined();
  });
});

describe('why a 7-segment display is dark', () => {
  const why = (c: Circuit) => {
    const sim = compileSimulation(c);
    return whyDark(sim, settle(sim, initialSimState(sim), { pressed: {}, clocks: {} }).result, 'DS1');
  };
  const without = (c: Circuit, ids: string[]): Circuit => ({ ...c, wires: c.wires.filter((w) => !ids.includes(w.id)) });

  it('says nothing while some segment is lit', () => {
    expect(why(display(8))).toBeNull();
  });

  it('tells 15 apart from no power', () => {
    expect(why(display(15))).toEqual({ kind: 'fifteen', driver: 'U1' });
    // 輸入腳都沒接：TTL 浮接算 1，也是 15。
    expect(why(without(display(3), ['in0', 'in1', 'in2', 'in3']))).toEqual({ kind: 'fifteen', driver: 'U1' });
    expect(why(display(15, { anodeToGround: true }))).toEqual({ kind: 'no-power' });
    expect(why(without(display(3), ['vcc']))).toEqual({ kind: 'driver-unpowered', driver: 'U1' });
  });

  it('notices blanking and segments that are not wired to the decoder', () => {
    const c = display(3);
    // /BI/RBO（第 4 腳，F18）接 GND。
    expect(why({ ...c, wires: [...c.wires, wire('bi', 'J18', 'B-18')] })).toEqual({ kind: 'blanked', driver: 'U1' });
    expect(why(without(c, ['a1', 'b1', 'c1', 'd1', 'e1', 'f1', 'g1']))).toEqual({ kind: 'unwired' });
  });

  it('explains each case in words', () => {
    expect(darkReasonText({ kind: 'fifteen', driver: 'U1' })).toContain('15');
    expect(darkReasonText({ kind: 'no-power' })).toContain('+5 V');
    expect(darkReasonText({ kind: 'driver-unpowered', driver: 'U1' })).toContain('U1');
    expect(darkReasonText({ kind: 'blanked', driver: 'U1' })).toContain('BI');
    expect(darkReasonText({ kind: 'unwired' })).toContain('a–g');
  });
});

describe('common-cathode displays with a 74LS48 (sub-project 32)', () => {
  it('shows every digit 0–9', () => {
    for (let n = 0; n < 10; n++) expect(segments(display(n, { cathode: true })).join(''), String(n)).toBe(BCD_GLYPHS[n]);
  });

  it('is a common-cathode part with the same pinout', () => {
    const def = getComponentDefinition('7seg-cc')!;
    expect(def.category).toBe('seven-seg');
    expect(def.pins.filter((p) => p.name === 'CC').map((p) => [p.number, p.role])).toEqual([
      [3, 'cathode'],
      [8, 'cathode'],
    ]);
    expect(getComponentDefinition('74LS48')!.logic).toMatchObject({ model: 'bcd7seg', activeHigh: true });
  });

  it('explains why it is dark and warns when the common cathode goes to +5 V', () => {
    const why = (c: Circuit) => {
      const sim = compileSimulation(c);
      return whyDark(sim, settle(sim, initialSimState(sim), { pressed: {}, clocks: {} }).result, 'DS1');
    };
    expect(why(display(15, { cathode: true }))).toEqual({ kind: 'fifteen', driver: 'U1', chip: '74LS48' });
    expect(why(display(3, { cathode: true, commonToVcc: true }))).toEqual({ kind: 'no-power', cathode: true });
    expect(darkReasonText({ kind: 'no-power', cathode: true })).toContain('共陰極');
    expect(darkReasonText({ kind: 'fifteen', driver: 'U1', chip: '74LS48' })).toContain('74LS48');
    const codes = validateCircuit(display(3, { cathode: true, commonToVcc: true })).filter((e) => e.componentIds.includes('DS1'));
    expect(codes.find((e) => e.code === 'LED_REVERSED')?.message).toContain('共陰極（CC）接到 VCC');
    expect(validateCircuit(display(8, { cathode: true })).filter((e) => e.componentIds.includes('DS1'))).toEqual([]);
  });
});
