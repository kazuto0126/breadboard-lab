import { describe, expect, it } from 'vitest';
import { parseLogic } from '../../src/core/circuit/logicSpec';
import { BCD_GLYPHS, createModel, OSC_PIN, type LogicModel, type ModelState } from '../../src/core/simulation/models';
import type { Logic } from '../../src/types/logic';

const model = (raw: unknown, pins: string[]) => createModel(parseLogic('T', raw, new Set(pins))!);
const run = (m: LogicModel, inputs: Record<string, Logic>, state: ModelState = m.init()) => m.evaluate((p) => inputs[p] ?? 1, state);

describe('jkff (74LS73 / 76)', () => {
  const jk = model(
    { model: 'jkff', flipflops: [{ j: 'J', k: 'K', clock: 'CLK', q: 'Q', qn: '/Q', preset: { pin: '/PRE', active: 'low' }, clear: { pin: '/CLR', active: 'low' } }] },
    ['J', 'K', 'CLK', 'Q', '/Q', '/PRE', '/CLR'],
  );
  /** 給一個完整的時脈脈波（1 → 0），回傳下降緣之後的狀態與輸出。 */
  const pulse = (j: Logic, k: Logic, state: ModelState) => {
    const high = run(jk, { J: j, K: k, CLK: 1 }, state);
    return run(jk, { J: j, K: k, CLK: 0 }, high.state);
  };

  it('acts on the falling edge: set, reset, toggle, hold', () => {
    let s = jk.init();
    let r = pulse(1, 0, s);
    expect(r.outputs).toEqual({ Q: 1, '/Q': 0 });
    r = pulse(0, 1, r.state);
    expect(r.outputs.Q).toBe(0);
    r = pulse(1, 1, r.state);
    expect(r.outputs.Q).toBe(1);
    r = pulse(1, 1, r.state);
    expect(r.outputs.Q).toBe(0);
    r = pulse(0, 0, r.state);
    expect(r.outputs.Q).toBe(0);
    s = r.state;
    // 上升緣不動作。
    expect(run(jk, { J: 1, K: 0, CLK: 1 }, run(jk, { J: 1, K: 0, CLK: 0 }, s).state).outputs.Q).toBe(0);
  });

  it('clears and presets asynchronously; both low drives Q and /Q high', () => {
    expect(run(jk, { '/CLR': 0 }, { prev: {}, bits: [1] }).outputs.Q).toBe(0);
    expect(run(jk, { '/PRE': 0 }).outputs.Q).toBe(1);
    expect(run(jk, { '/PRE': 0, '/CLR': 0 }).outputs).toEqual({ Q: 1, '/Q': 1 });
  });
});

describe('comparator (74LS85)', () => {
  const cmp = model(
    { model: 'comparator', a: ['A0', 'A1', 'A2', 'A3'], b: ['B0', 'B1', 'B2', 'B3'], cascade: { gt: 'IA>B', eq: 'IA=B', lt: 'IA<B' }, outputs: { gt: 'OA>B', eq: 'OA=B', lt: 'OA<B' } },
    ['A0', 'A1', 'A2', 'A3', 'B0', 'B1', 'B2', 'B3', 'IA>B', 'IA=B', 'IA<B', 'OA>B', 'OA=B', 'OA<B'],
  );
  const num = (prefix: string, n: number) => Object.fromEntries([0, 1, 2, 3].map((i) => [`${prefix}${i}`, ((n >> i) & 1) as Logic]));
  const out = (a: number, b: number, cascade: [Logic, Logic, Logic] = [0, 1, 0]) =>
    run(cmp, { ...num('A', a), ...num('B', b), 'IA>B': cascade[0], 'IA=B': cascade[1], 'IA<B': cascade[2] }).outputs;

  it('compares A and B', () => {
    expect(out(9, 3)).toEqual({ 'OA>B': 1, 'OA=B': 0, 'OA<B': 0 });
    expect(out(3, 9)).toEqual({ 'OA>B': 0, 'OA=B': 0, 'OA<B': 1 });
    expect(out(5, 5)).toEqual({ 'OA>B': 0, 'OA=B': 1, 'OA<B': 0 });
  });

  it('follows the cascade inputs when A = B (datasheet table)', () => {
    expect(out(5, 5, [1, 0, 0])).toEqual({ 'OA>B': 1, 'OA=B': 0, 'OA<B': 0 });
    expect(out(5, 5, [0, 0, 1])).toEqual({ 'OA>B': 0, 'OA=B': 0, 'OA<B': 1 });
    expect(out(5, 5, [1, 0, 1])).toEqual({ 'OA>B': 0, 'OA=B': 0, 'OA<B': 0 });
    expect(out(5, 5, [0, 0, 0])).toEqual({ 'OA>B': 1, 'OA=B': 0, 'OA<B': 1 });
  });
});

describe('mux (74LS151 / 153)', () => {
  const mux = model(
    { model: 'mux', units: [{ select: ['A', 'B', 'C'], data: ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'], enable: [{ pin: '/G', active: 'low' }], output: 'Y', outputN: 'W' }] },
    ['A', 'B', 'C', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', '/G', 'Y', 'W'],
  );
  it('passes the selected input and its inverse', () => {
    expect(run(mux, { '/G': 0, A: 1, B: 0, C: 1, D5: 0 }).outputs).toEqual({ Y: 0, W: 1 });
    expect(run(mux, { '/G': 0, A: 1, B: 0, C: 1, D5: 1, D0: 0 }).outputs).toEqual({ Y: 1, W: 0 });
  });
  it('outputs Y = 0, W = 1 when disabled', () => {
    expect(run(mux, { '/G': 1, D0: 1 }).outputs).toEqual({ Y: 0, W: 1 });
  });
});

describe('bcd7seg (74LS47)', () => {
  const segs = ['/a', '/b', '/c', '/d', '/e', '/f', '/g'];
  const dec = model(
    { model: 'bcd7seg', inputs: ['A', 'B', 'C', 'D'], segments: segs, lampTest: '/LT', blanking: '/BI/RBO', rippleBlanking: '/RBI' },
    ['A', 'B', 'C', 'D', '/LT', '/BI/RBO', '/RBI', ...segs],
  );
  const bits = (n: number) => ({ A: (n & 1) as Logic, B: ((n >> 1) & 1) as Logic, C: ((n >> 2) & 1) as Logic, D: ((n >> 3) & 1) as Logic });
  /** 亮的段（輸出 0）。 */
  const lit = (inputs: Record<string, Logic>) => {
    const o = run(dec, inputs).outputs;
    return segs.filter((p) => o[p] === 0).map((p) => p.slice(1)).join('');
  };

  it('decodes 0–15 with controls floating high', () => {
    for (let n = 0; n < 16; n++) expect(lit(bits(n)), String(n)).toBe(BCD_GLYPHS[n]);
    expect(BCD_GLYPHS.slice(0, 10)).toEqual(['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'cdefg', 'abc', 'abcdefg', 'abcfg']);
  });
  it('leaves unlit segments open (Z), not HIGH', () => {
    expect(run(dec, bits(1)).outputs['/a']).toBe('Z');
  });
  it('lamp test, blanking and ripple blanking', () => {
    expect(lit({ ...bits(1), '/LT': 0 })).toBe('abcdefg');
    expect(lit({ ...bits(8), '/BI/RBO': 0, '/LT': 0 })).toBe('');
    expect(lit({ ...bits(0), '/RBI': 0 })).toBe('');
    expect(lit({ ...bits(3), '/RBI': 0 })).toBe('abcdg');
  });
});

describe('timer555 (NE555)', () => {
  const t = model({ model: 'timer555', output: 'OUT', reset: { pin: '/RESET', active: 'low' } }, ['OUT', '/RESET']);
  it('follows the oscillator unless reset is low', () => {
    expect(run(t, { [OSC_PIN]: 0 }).outputs).toEqual({ OUT: 0 });
    expect(run(t, { [OSC_PIN]: 1 }).outputs).toEqual({ OUT: 1 });
    expect(run(t, { [OSC_PIN]: 1, '/RESET': 0 }).outputs).toEqual({ OUT: 0 });
  });
});

describe('parseLogic for the new models', () => {
  it('rejects a mux whose data count does not match the select lines', () => {
    expect(() => parseLogic('T', { model: 'mux', units: [{ select: ['A'], data: ['D0'], enable: [], output: 'Y' }] }, new Set(['A', 'D0', 'Y']))).toThrow(/2\^select/);
  });
  it('rejects a 74LS47 spec without 7 segments', () => {
    expect(() =>
      parseLogic('T', { model: 'bcd7seg', inputs: ['A', 'B', 'C', 'D'], segments: ['a'], lampTest: 'LT', blanking: 'BI', rippleBlanking: 'RBI' }, new Set(['A', 'B', 'C', 'D', 'a', 'LT', 'BI', 'RBI'])),
    ).toThrow(/7/);
  });
});
