import { describe, expect, it } from 'vitest';
import { getComponentDefinition } from '../../src/core/circuit/library';
import { and, createModel, not, or, toBits, toNumber, xor, type ModelState } from '../../src/core/simulation/models';
import type { Level, Logic } from '../../src/types/logic';

/** 用 IC 的 JSON 邏輯建立一顆「晶片」，未設定的輸入視為浮接（TTL 讀成 1）。 */
function chip(id: string) {
  const logic = getComponentDefinition(id)!.logic!;
  const model = createModel(logic);
  let state: ModelState = model.init();
  const inputs: Record<string, Logic> = {};
  let outputs: Record<string, Level> = {};
  const evaluate = (values: Record<string, Logic> = {}) => {
    Object.assign(inputs, values);
    const r = model.evaluate((pin) => inputs[pin] ?? 1, state);
    state = r.state;
    outputs = r.outputs;
    return outputs;
  };
  return {
    model,
    evaluate,
    /** 先把時脈設成 from，再變成 to（產生一個邊緣）。 */
    edge(clock: string, from: Logic, to: Logic, values: Record<string, Logic> = {}) {
      evaluate({ ...values, [clock]: from });
      return evaluate({ [clock]: to });
    },
    out: (pin: string) => outputs[pin],
    count: (pins: string[]) => toNumber(pins.map((p) => outputs[p] as Logic)),
  };
}

const BITS = [0, 1] as const;

describe('three-valued logic helpers', () => {
  it('follows the dominance rules', () => {
    expect(and([0, 'X'])).toBe(0);
    expect(and([1, 'X'])).toBe('X');
    expect(or([1, 'X'])).toBe(1);
    expect(or([0, 'X'])).toBe('X');
    expect(xor([1, 'X'])).toBe('X');
    expect(xor([1, 1, 1])).toBe(1);
    expect(not('X')).toBe('X');
    expect(toNumber([1, 0, 1, 1])).toBe(13);
    expect(toNumber([1, 'X'])).toBe('X');
    expect(toBits(6, 4)).toEqual([0, 1, 1, 0]);
  });
});

describe('quad 2-input gates (74LS00 / 02 / 08 / 32 / 86)', () => {
  const cases: Array<[string, (a: number, b: number) => number, (i: number) => [string, string, string]]> = [
    ['74LS00', (a, b) => 1 - (a & b), (i) => [`${i}A`, `${i}B`, `${i}Y`]],
    ['74LS02', (a, b) => 1 - (a | b), (i) => [`${i}A`, `${i}B`, `${i}Y`]],
    ['74LS08', (a, b) => a & b, (i) => [`${i}A`, `${i}B`, `${i}Y`]],
    ['74LS32', (a, b) => a | b, (i) => [`${i}A`, `${i}B`, `${i}Y`]],
    ['74LS86', (a, b) => a ^ b, (i) => [`${i}A`, `${i}B`, `${i}Y`]],
  ];
  it.each(cases)('%s matches its truth table on all four gates', (id, fn, names) => {
    const c = chip(id);
    for (let gate = 1; gate <= 4; gate++) {
      const [a, b, y] = names(gate);
      for (const va of BITS) for (const vb of BITS) expect(c.evaluate({ [a]: va, [b]: vb })[y], `${id} ${a}=${va} ${b}=${vb}`).toBe(fn(va, vb));
    }
  });

  it('74LS00: a LOW input decides the output even when the other is unknown', () => {
    const c = chip('74LS00');
    expect(c.evaluate({ '1A': 0, '1B': 'X' })['1Y']).toBe(1);
    expect(c.evaluate({ '1A': 1, '1B': 'X' })['1Y']).toBe('X');
  });

  it('74LS04 inverts all six inputs', () => {
    const c = chip('74LS04');
    for (let i = 1; i <= 6; i++) {
      expect(c.evaluate({ [`${i}A`]: 0 })[`${i}Y`]).toBe(1);
      expect(c.evaluate({ [`${i}A`]: 1 })[`${i}Y`]).toBe(0);
    }
  });
});

describe('decoders', () => {
  it('74LS138 pulls exactly one output LOW when enabled', () => {
    const c = chip('74LS138');
    for (let n = 0; n < 8; n++) {
      const out = c.evaluate({ A: (n & 1) as Logic, B: ((n >> 1) & 1) as Logic, C: ((n >> 2) & 1) as Logic, G1: 1, '/G2A': 0, '/G2B': 0 });
      for (let k = 0; k < 8; k++) expect(out[`/Y${k}`]).toBe(k === n ? 0 : 1);
    }
  });

  it('74LS138 keeps every output HIGH when any enable is inactive', () => {
    const c = chip('74LS138');
    for (const disable of [{ G1: 0 }, { '/G2A': 1 }, { '/G2B': 1 }] as Array<Record<string, Logic>>) {
      const out = c.evaluate({ A: 0, B: 0, C: 0, G1: 1, '/G2A': 0, '/G2B': 0, ...disable });
      expect(Object.values(out).every((v) => v === 1)).toBe(true);
    }
  });

  it('74LS154 decodes 4 bits to 16 active-LOW outputs', () => {
    const c = chip('74LS154');
    for (let n = 0; n < 16; n++) {
      const out = c.evaluate({ A: (n & 1) as Logic, B: ((n >> 1) & 1) as Logic, C: ((n >> 2) & 1) as Logic, D: ((n >> 3) & 1) as Logic, '/G1': 0, '/G2': 0 });
      expect(Object.entries(out).filter(([, v]) => v === 0).map(([k]) => k)).toEqual([`/Y${n}`]);
    }
    expect(Object.values(c.evaluate({ '/G1': 1 })).every((v) => v === 1)).toBe(true);
  });
});

describe('D flip-flops', () => {
  it('74LS74 stores D on the rising edge only', () => {
    const c = chip('74LS74');
    c.evaluate({ '1/PRE': 1, '1/CLR': 1, '1D': 1, '1CLK': 0 });
    expect(c.out('1Q')).toBe(0);
    c.evaluate({ '1CLK': 1 });
    expect([c.out('1Q'), c.out('1/Q')]).toEqual([1, 0]);
    c.evaluate({ '1D': 0 });
    expect(c.out('1Q')).toBe(1); // 沒有邊緣就保持
    c.evaluate({ '1CLK': 0 });
    expect(c.out('1Q')).toBe(1); // 下降緣不觸發
    c.evaluate({ '1CLK': 1 });
    expect(c.out('1Q')).toBe(0);
    expect(c.out('2Q')).toBe(0); // 另一顆不受影響
  });

  it('74LS74 /PRE and /CLR act immediately, and both LOW drive Q and /Q HIGH', () => {
    const c = chip('74LS74');
    expect(c.evaluate({ '1/PRE': 0, '1/CLR': 1 })['1Q']).toBe(1);
    expect(c.evaluate({ '1/PRE': 1, '1/CLR': 0 })['1Q']).toBe(0);
    const both = c.evaluate({ '1/PRE': 0, '1/CLR': 0 });
    expect([both['1Q'], both['1/Q']]).toEqual([1, 1]);
  });

  it('74LS174 / 175 / 273 clock every flip-flop together and clear with /CLR', () => {
    for (const [id, n, qn] of [
      ['74LS174', 6, false],
      ['74LS175', 4, true],
      ['74LS273', 8, false],
    ] as const) {
      const c = chip(id);
      const data: Record<string, Logic> = { '/CLR': 1 };
      for (let i = 1; i <= n; i++) data[`${i}D`] = (i % 2) as Logic;
      const out = c.edge('CLK', 0, 1, data);
      for (let i = 1; i <= n; i++) {
        expect(out[`${i}Q`], `${id} ${i}Q`).toBe(i % 2);
        if (qn) expect(out[`${i}/Q`]).toBe(1 - (i % 2));
      }
      const cleared = c.evaluate({ '/CLR': 0 });
      for (let i = 1; i <= n; i++) expect(cleared[`${i}Q`]).toBe(0);
    }
  });

  it('74LS173 loads only when /G1 = /G2 = LOW, tri-states with M or N, and clears with CLR HIGH', () => {
    const c = chip('74LS173');
    const base = { CLR: 0, M: 0, N: 0, '1D': 1, '2D': 0, '3D': 1, '4D': 1 } as Record<string, Logic>;
    let out = c.edge('CLK', 0, 1, { ...base, '/G1': 1, '/G2': 0 });
    expect(c.count(['1Q', '2Q', '3Q', '4Q'])).toBe(0); // 沒有致能載入
    out = c.edge('CLK', 0, 1, { '/G1': 0, '/G2': 0 });
    expect(c.count(['1Q', '2Q', '3Q', '4Q'])).toBe(0b1101);
    out = c.evaluate({ M: 1 });
    expect(['1Q', '2Q', '3Q', '4Q'].map((p) => out[p])).toEqual(['Z', 'Z', 'Z', 'Z']);
    out = c.evaluate({ M: 0, CLR: 1 });
    expect(c.count(['1Q', '2Q', '3Q', '4Q'])).toBe(0);
  });
});

describe('ripple counters (falling edge)', () => {
  /** 外部把 QA 接到 CKB：每次 CKA 下降緣後再求值一次，讓 QA 的變化傳到 CKB。 */
  function pulseCascaded(c: ReturnType<typeof chip>) {
    c.evaluate({ CKA: 1, CKB: c.out('QA') as Logic });
    c.evaluate({ CKA: 0, CKB: c.out('QA') as Logic });
    c.evaluate({ CKB: c.out('QA') as Logic });
  }

  it('74LS93 counts 0–15 in binary when QA drives CKB', () => {
    const c = chip('74LS93');
    c.evaluate({ 'R0(1)': 0, 'R0(2)': 0, CKA: 1, CKB: 0 });
    const seen: Array<number | 'X'> = [];
    for (let i = 0; i < 17; i++) {
      pulseCascaded(c);
      seen.push(c.count(['QA', 'QB', 'QC', 'QD']));
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0, 1]);
  });

  it('74LS90 counts 0–9 in BCD when QA drives CKB, and its CKB section divides by 5', () => {
    const c = chip('74LS90');
    c.evaluate({ 'R0(1)': 0, 'R0(2)': 0, 'R9(1)': 0, 'R9(2)': 0, CKA: 1, CKB: 0 });
    const seen: Array<number | 'X'> = [];
    for (let i = 0; i < 11; i++) {
      pulseCascaded(c);
      seen.push(c.count(['QA', 'QB', 'QC', 'QD']));
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1]);

    const d = chip('74LS90');
    d.evaluate({ 'R0(1)': 0, 'R0(2)': 0, 'R9(1)': 0, 'R9(2)': 0, CKB: 1 });
    const fives: Array<number | 'X'> = [];
    for (let i = 0; i < 6; i++) {
      d.edge('CKB', 1, 0);
      fives.push(d.count(['QB', 'QC', 'QD']));
    }
    expect(fives).toEqual([1, 2, 3, 4, 0, 1]);
  });

  it('74LS90 R9 sets 9 and wins over R0; R0 resets to 0', () => {
    const c = chip('74LS90');
    c.evaluate({ 'R0(1)': 1, 'R0(2)': 1, 'R9(1)': 1, 'R9(2)': 1 });
    expect(c.count(['QA', 'QB', 'QC', 'QD'])).toBe(9);
    c.evaluate({ 'R9(1)': 0 });
    expect(c.count(['QA', 'QB', 'QC', 'QD'])).toBe(0);
  });

  it('74LS93 ignores clock edges while held in reset', () => {
    const c = chip('74LS93');
    c.edge('CKA', 1, 0, { 'R0(1)': 1, 'R0(2)': 1 });
    expect(c.out('QA')).toBe(0);
  });
});

describe('synchronous counters (rising edge)', () => {
  const Q = ['QA', 'QB', 'QC', 'QD'];
  const counting = { '/CLR': 1, '/LOAD': 1, ENP: 1, ENT: 1 } as Record<string, Logic>;

  it('74LS161 counts, sets RCO at 15 and wraps to 0', () => {
    const c = chip('74LS161');
    c.evaluate({ ...counting, CLK: 0 });
    for (let i = 1; i <= 15; i++) {
      c.edge('CLK', 0, 1);
      expect(c.count(Q)).toBe(i);
    }
    expect(c.out('RCO')).toBe(1);
    expect(c.evaluate({ ENT: 0 }).RCO).toBe(0);
    c.edge('CLK', 0, 1, { ENT: 1 });
    expect(c.count(Q)).toBe(0);
    expect(c.out('RCO')).toBe(0);
  });

  it('74LS161 holds when ENP is LOW and loads data with /LOAD on the clock', () => {
    const c = chip('74LS161');
    c.edge('CLK', 0, 1, { ...counting, ENP: 0 });
    expect(c.count(Q)).toBe(0);
    c.edge('CLK', 0, 1, { '/LOAD': 0, A: 1, B: 0, C: 1, D: 0 });
    expect(c.count(Q)).toBe(5);
  });

  it('74LS161 clears asynchronously, 74LS163 only on the clock', () => {
    const a = chip('74LS161');
    a.edge('CLK', 0, 1, { ...counting });
    expect(a.evaluate({ '/CLR': 0 }).QA).toBe(0);

    const s = chip('74LS163');
    s.edge('CLK', 0, 1, { ...counting });
    expect(s.evaluate({ '/CLR': 0, CLK: 0 }).QA).toBe(1);
    s.evaluate({ CLK: 1 });
    expect(s.count(Q)).toBe(0);
  });

  it('74LS193 counts up on UP, down on DOWN, with /CO and /BO', () => {
    const c = chip('74LS193');
    c.evaluate({ CLR: 0, '/LOAD': 1, UP: 1, DOWN: 1 });
    c.edge('DOWN', 1, 0);
    c.evaluate({ DOWN: 1 });
    expect(c.count(Q)).toBe(15); // 0 往下數 → 15
    expect(c.evaluate({ UP: 0 })['/CO']).toBe(0); // 15 且 UP 為 LOW
    c.evaluate({ UP: 1 });
    expect(c.count(Q)).toBe(0); // UP 上升緣：15 → 0
    expect(c.out('/CO')).toBe(1);
    expect(c.evaluate({ DOWN: 0 })['/BO']).toBe(0); // 0 且 DOWN 為 LOW
    c.evaluate({ DOWN: 1 }); // DOWN 上升緣：0 → 15
    expect(c.count(Q)).toBe(15);
  });

  it('74LS193 loads asynchronously and CLR wins', () => {
    const c = chip('74LS193');
    c.evaluate({ CLR: 0, '/LOAD': 0, A: 0, B: 1, C: 1, D: 0 });
    expect(c.count(Q)).toBe(6);
    c.evaluate({ CLR: 1 });
    expect(c.count(Q)).toBe(0);
  });
});

describe('74LS283 4-bit full adder', () => {
  it('adds every A, B and carry-in combination', () => {
    const c = chip('74LS283');
    for (let a = 0; a < 16; a++) {
      for (let b = 0; b < 16; b++) {
        for (const cin of BITS) {
          const inputs: Record<string, Logic> = { C0: cin };
          for (let i = 0; i < 4; i++) {
            inputs[`A${i + 1}`] = ((a >> i) & 1) as Logic;
            inputs[`B${i + 1}`] = ((b >> i) & 1) as Logic;
          }
          c.evaluate(inputs);
          expect(c.count(['S1', 'S2', 'S3', 'S4', 'C4'])).toBe(a + b + cin);
        }
      }
    }
  });

  it('reports X when an input is unknown', () => {
    expect(chip('74LS283').evaluate({ A1: 'X' }).C4).toBe('X');
  });
});

describe('74LS245 bus transceiver', () => {
  const A = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'];
  const B = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8'];

  it('drives B from A when DIR is HIGH and A from B when DIR is LOW', () => {
    const c = chip('74LS245');
    const values = (pins: string[]) => Object.fromEntries(pins.map((p, i) => [p, (i % 2) as Logic]));
    let out = c.evaluate({ '/G': 0, DIR: 1, ...values(A) });
    expect(B.map((p) => out[p])).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
    expect(A.map((p) => out[p]).every((v) => v === 'Z')).toBe(true);
    out = c.evaluate({ DIR: 0, ...values(B) });
    expect(A.map((p) => out[p])).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
    expect(B.map((p) => out[p]).every((v) => v === 'Z')).toBe(true);
  });

  it('isolates both buses when /G is HIGH', () => {
    const out = chip('74LS245').evaluate({ '/G': 1, DIR: 1 });
    expect([...A, ...B].every((p) => out[p] === 'Z')).toBe(true);
  });
});
