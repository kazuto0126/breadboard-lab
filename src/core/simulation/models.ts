import type {
  ActiveSignal,
  AdderLogic,
  Bcd7segLogic,
  ComparatorLogic,
  JkffLogic,
  MuxLogic,
  Timer555Logic,
  DecoderLogic,
  DffLogic,
  GateOp,
  GatesLogic,
  Level,
  Logic,
  LogicSpec,
  RippleCounterLogic,
  SyncCounterLogic,
  TransceiverLogic,
  UpDownCounterLogic,
} from '../../types/logic';

/** 讀取某隻腳（依腳位名稱）目前的輸入值。 */
export type ReadPin = (pin: string) => Logic;

/** 模型狀態：純資料，可以直接 JSON 化。 */
export interface ModelState {
  /** 上一次求值時時脈腳的值，用來找出邊緣。 */
  prev: Record<string, Logic>;
  /** 內部狀態位元（正反器的 Q、計數器的計數值），LSB 在前。 */
  bits: Logic[];
}

export interface Evaluation {
  /** 每隻輸出腳要驅動的電位；Z 表示這次不驅動（三態或雙向腳當輸入）。 */
  outputs: Record<string, Level>;
  state: ModelState;
}

export interface LogicModel {
  /** 這個模型可能驅動的腳位。 */
  outputs: string[];
  /** 上電狀態（所有正反器與計數器為 0）。 */
  init(): ModelState;
  evaluate(read: ReadPin, state: ModelState): Evaluation;
}

// ---------- 三值邏輯 ----------

export const not = (v: Logic): Logic => (v === 'X' ? 'X' : v === 1 ? 0 : 1);

/**
 * 非同步清除 / 預設腳是 X（還不知道有沒有作用）時的結果：沒作用時是 normal，有作用時是 forced 裡的值；
 * 全部一樣就是那個值，不然是 X。回授計數器上電時 NAND 的輸出還是 X，已經是 0 再清除一次還是 0，不能讓 X 卡在迴圈裡。
 */
export function eitherWay<T extends Logic | number | 'X'>(normal: T, forced: T[]): T | 'X' {
  return forced.every((v) => v === normal) ? normal : 'X';
}

export function and(values: Logic[]): Logic {
  if (values.includes(0)) return 0;
  return values.includes('X') ? 'X' : 1;
}

export function or(values: Logic[]): Logic {
  if (values.includes(1)) return 1;
  return values.includes('X') ? 'X' : 0;
}

export function xor(values: Logic[]): Logic {
  if (values.includes('X')) return 'X';
  return (values as Array<0 | 1>).reduce<number>((acc, v) => acc ^ v, 0) as 0 | 1;
}

const GATES: Record<GateOp, (values: Logic[]) => Logic> = {
  and,
  or,
  nand: (v) => not(and(v)),
  nor: (v) => not(or(v)),
  xor,
  xnor: (v) => not(xor(v)),
  not: (v) => not(v[0]),
  buf: (v) => v[0],
};

/** 控制訊號是否有效（1 = 有效、0 = 無效、X = 不確定）。 */
export function asserted(read: ReadPin, signal: ActiveSignal): Logic {
  const v = read(signal.pin);
  if (v === 'X') return 'X';
  return (v === 1) === (signal.active === 'high') ? 1 : 0;
}

/** 全部有效（空陣列視為有效）。 */
export function allAsserted(read: ReadPin, signals: ActiveSignal[]): Logic {
  return and(signals.map((s) => asserted(read, s)));
}

const rising = (prev: Logic | undefined, now: Logic) => prev === 0 && now === 1;
const falling = (prev: Logic | undefined, now: Logic) => prev === 1 && now === 0;

/** 位元陣列（LSB 在前）→ 數值；有任何 X 就是 X。 */
export function toNumber(bits: Logic[]): number | 'X' {
  let n = 0;
  for (let i = bits.length - 1; i >= 0; i--) {
    const b = bits[i];
    if (b === 'X') return 'X';
    n = n * 2 + b;
  }
  return n;
}

export function toBits(n: number | 'X', width: number): Logic[] {
  return Array.from({ length: width }, (_, i) => (n === 'X' ? 'X' : (((n >> i) & 1) as 0 | 1)));
}

const readAll = (read: ReadPin, pins: string[]): Logic[] => pins.map((p) => read(p));

function snapshot(read: ReadPin, pins: string[]): Record<string, Logic> {
  const prev: Record<string, Logic> = {};
  for (const p of pins) prev[p] = read(p);
  return prev;
}

const zeros = (n: number): Logic[] => new Array<Logic>(n).fill(0);

// ---------- 模型 ----------

function gatesModel(spec: GatesLogic): LogicModel {
  return {
    outputs: spec.gates.map((g) => g.out),
    init: () => ({ prev: {}, bits: [] }),
    evaluate(read, state) {
      const outputs: Record<string, Level> = {};
      for (const g of spec.gates) outputs[g.out] = GATES[g.op](readAll(read, g.in));
      return { outputs, state };
    },
  };
}

function decoderModel(spec: DecoderLogic): LogicModel {
  return {
    outputs: spec.units.flatMap((u) => u.outputs),
    init: () => ({ prev: {}, bits: [] }),
    evaluate(read, state) {
      const outputs: Record<string, Level> = {};
      for (const unit of spec.units) {
        const active: Logic = unit.outputActive === 'high' ? 1 : 0;
        const inactive = not(active);
        const enabled = allAsserted(read, unit.enable);
        const selected = toNumber(readAll(read, unit.select));
        unit.outputs.forEach((pin, i) => {
          if (enabled === 0) outputs[pin] = inactive;
          else if (enabled === 'X' || selected === 'X') outputs[pin] = 'X';
          else outputs[pin] = i === selected ? active : inactive;
        });
      }
      return { outputs, state };
    },
  };
}

function dffModel(spec: DffLogic): LogicModel {
  const clocks = [...new Set(spec.flipflops.map((f) => f.clock))];
  return {
    outputs: spec.flipflops.flatMap((f) => [f.q, f.qn].filter((p): p is string => p !== undefined)),
    init: () => ({ prev: {}, bits: zeros(spec.flipflops.length) }),
    evaluate(read, state) {
      const load = spec.load ? allAsserted(read, spec.load) : 1;
      const enabled = spec.outputEnable ? allAsserted(read, spec.outputEnable) : 1;
      const drive = (v: Logic): Level => (enabled === 1 ? v : enabled === 0 ? 'Z' : 'X');
      const outputs: Record<string, Level> = {};
      const bits = spec.flipflops.map((ff, i) => {
        let q = state.bits[i] ?? 0;
        const pre = ff.preset ? asserted(read, ff.preset) : 0;
        const clr = ff.clear ? asserted(read, ff.clear) : 0;
        // 74LS74 的 /PRE 與 /CLR 同時有效時，Q 與 /Q 都是 HIGH。
        const both = pre === 1 && clr === 1;
        if (both || pre === 1) q = 1;
        else if (clr === 1) q = 0;
        else {
          if (rising(state.prev[ff.clock], read(ff.clock))) q = load === 1 ? read(ff.d) : load === 0 ? q : 'X';
          q = eitherWay<Logic>(q, [...(pre === 'X' ? [1 as const] : []), ...(clr === 'X' ? [0 as const] : [])]);
        }
        if (ff.q) outputs[ff.q] = drive(q);
        if (ff.qn) outputs[ff.qn] = drive(both ? 1 : not(q));
        return q;
      });
      return { outputs, state: { prev: snapshot(read, clocks), bits } };
    },
  };
}

function rippleCounterModel(spec: RippleCounterLogic): LogicModel {
  const widths = spec.stages.map((s) => s.outputs.length);
  const offsets = widths.map((_, k) => widths.slice(0, k).reduce((a, b) => a + b, 0));
  const clocks = [...new Set(spec.stages.map((s) => s.clock))];
  return {
    outputs: spec.stages.flatMap((s) => s.outputs),
    init: () => ({ prev: {}, bits: zeros(widths.reduce((a, b) => a + b, 0)) }),
    evaluate(read, state) {
      const current = spec.stages.map((_, k) => toNumber(state.bits.slice(offsets[k], offsets[k] + widths[k])));
      const counted = current.map((v, k) => {
        const stage = spec.stages[k];
        if (!falling(state.prev[stage.clock], read(stage.clock))) return v;
        return v === 'X' ? 'X' : (v + 1) % stage.modulus;
      });
      // 依順序看每一組重設（74LS90 的 R9 優先於 R0）；重設腳是 X 時，重設與否結果一樣的那一級照舊。
      const afterPresets = (from: number): Array<number | 'X'> => {
        if (from >= spec.presets.length) return counted;
        const p = spec.presets[from];
        const when = allAsserted(read, p.when);
        if (when === 0) return afterPresets(from + 1);
        if (when === 1) return [...p.values];
        return afterPresets(from + 1).map((v, k) => eitherWay(v, [p.values[k]]));
      };
      const values = afterPresets(0);
      const outputs: Record<string, Level> = {};
      const bits = spec.stages.flatMap((stage, k) => {
        const stageBits = toBits(values[k], widths[k]);
        stage.outputs.forEach((pin, j) => (outputs[pin] = stageBits[j]));
        return stageBits;
      });
      return { outputs, state: { prev: snapshot(read, clocks), bits } };
    },
  };
}

function syncCounterModel(spec: SyncCounterLogic): LogicModel {
  const width = spec.outputs.length;
  const max = 2 ** width - 1;
  return {
    outputs: [...spec.outputs, spec.carry.output],
    init: () => ({ prev: {}, bits: zeros(width) }),
    evaluate(read, state) {
      let q = toNumber(state.bits);
      const clear = asserted(read, spec.clear);
      const edge = rising(state.prev[spec.clock], read(spec.clock));
      if (clear === 1 && (spec.clear.mode === 'async' || edge)) q = 0;
      else {
        if (edge) {
          const load = asserted(read, spec.load);
          const enabled = allAsserted(read, spec.enable);
          if (load === 1) q = toNumber(readAll(read, spec.data));
          else if (load === 'X') q = 'X';
          else if (enabled === 1) q = q === 'X' ? 'X' : (q + 1) % (max + 1);
          else if (enabled === 'X') q = 'X';
        }
        // 清除腳是 X：清除與否結果一樣（已經是 0）時照舊。同步清除只在時脈邊緣有作用。
        if (clear === 'X' && (spec.clear.mode === 'async' || edge)) q = eitherWay(q, [0]);
      }
      const bits = toBits(q, width);
      const outputs: Record<string, Level> = {};
      spec.outputs.forEach((pin, i) => (outputs[pin] = bits[i]));
      outputs[spec.carry.output] = and([allAsserted(read, spec.carry.enable), q === 'X' ? 'X' : q === max ? 1 : 0]);
      return { outputs, state: { prev: snapshot(read, [spec.clock]), bits } };
    },
  };
}

function upDownCounterModel(spec: UpDownCounterLogic): LogicModel {
  const width = spec.outputs.length;
  const modulus = 2 ** width;
  return {
    outputs: [...spec.outputs, spec.carry, spec.borrow],
    init: () => ({ prev: {}, bits: zeros(width) }),
    evaluate(read, state) {
      let q = toNumber(state.bits);
      const clear = asserted(read, spec.clear);
      const load = asserted(read, spec.load);
      const up = read(spec.up);
      const down = read(spec.down);
      if (clear === 1) q = 0;
      else {
        if (load === 1) q = toNumber(readAll(read, spec.data));
        else if (load === 'X') q = 'X';
        else if (rising(state.prev[spec.up], up) && down === 1) q = q === 'X' ? 'X' : (q + 1) % modulus;
        else if (rising(state.prev[spec.down], down) && up === 1) q = q === 'X' ? 'X' : (q + modulus - 1) % modulus;
        // 清除腳是 X：清除與否結果一樣（已經是 0）時照舊。
        if (clear === 'X') q = eitherWay(q, [0]);
      }
      const bits = toBits(q, width);
      const outputs: Record<string, Level> = {};
      spec.outputs.forEach((pin, i) => (outputs[pin] = bits[i]));
      // /CO：計到最大值且 UP 為 LOW 時輸出 LOW；/BO：計到 0 且 DOWN 為 LOW 時輸出 LOW。
      outputs[spec.carry] = not(and([q === 'X' ? 'X' : q === modulus - 1 ? 1 : 0, not(up)]));
      outputs[spec.borrow] = not(and([q === 'X' ? 'X' : q === 0 ? 1 : 0, not(down)]));
      return { outputs, state: { prev: snapshot(read, [spec.up, spec.down]), bits } };
    },
  };
}

function adderModel(spec: AdderLogic): LogicModel {
  const width = spec.a.length;
  return {
    outputs: [...spec.sum, spec.carryOut],
    init: () => ({ prev: {}, bits: [] }),
    evaluate(read, state) {
      const a = toNumber(readAll(read, spec.a));
      const b = toNumber(readAll(read, spec.b));
      const cin = read(spec.carryIn);
      const total = a === 'X' || b === 'X' || cin === 'X' ? 'X' : a + b + cin;
      const bits = toBits(total, width + 1);
      const outputs: Record<string, Level> = {};
      spec.sum.forEach((pin, i) => (outputs[pin] = bits[i]));
      outputs[spec.carryOut] = bits[width];
      return { outputs, state };
    },
  };
}

function transceiverModel(spec: TransceiverLogic): LogicModel {
  return {
    outputs: [...spec.a, ...spec.b],
    init: () => ({ prev: {}, bits: [] }),
    evaluate(read, state) {
      const outputs: Record<string, Level> = {};
      const enabled = allAsserted(read, spec.enable);
      const dir = read(spec.direction.pin);
      if (enabled === 0) {
        for (const pin of [...spec.a, ...spec.b]) outputs[pin] = 'Z';
      } else if (enabled === 'X' || dir === 'X') {
        for (const pin of [...spec.a, ...spec.b]) outputs[pin] = 'X';
      } else {
        const aToB = (dir === 1) === (spec.direction.aToB === 'high');
        const [from, to] = aToB ? [spec.a, spec.b] : [spec.b, spec.a];
        from.forEach((pin, i) => {
          outputs[pin] = 'Z';
          outputs[to[i]] = read(pin);
        });
      }
      return { outputs, state };
    },
  };
}

/** 依元件 JSON 的 logic 建立行為模型。 */
function jkffModel(spec: JkffLogic): LogicModel {
  const clocks = [...new Set(spec.flipflops.map((f) => f.clock))];
  return {
    outputs: spec.flipflops.flatMap((f) => [f.q, f.qn].filter((p): p is string => p !== undefined)),
    init: () => ({ prev: {}, bits: zeros(spec.flipflops.length) }),
    evaluate(read, state) {
      const outputs: Record<string, Level> = {};
      const bits = spec.flipflops.map((ff, i) => {
        let q = state.bits[i] ?? 0;
        const pre = ff.preset ? asserted(read, ff.preset) : 0;
        const clr = ff.clear ? asserted(read, ff.clear) : 0;
        // 和 74LS74 相同：/PRE 與 /CLR 同時有效時 Q 與 /Q 都是 HIGH。
        const both = pre === 1 && clr === 1;
        if (both || pre === 1) q = 1;
        else if (clr === 1) q = 0;
        else {
          if (falling(state.prev[ff.clock], read(ff.clock))) {
            const j = read(ff.j);
            const k = read(ff.k);
            if (j === 'X' || k === 'X') q = 'X';
            else if (j === 1 && k === 1) q = not(q);
            else if (j === 1) q = 1;
            else if (k === 1) q = 0;
          }
          q = eitherWay<Logic>(q, [...(pre === 'X' ? [1 as const] : []), ...(clr === 'X' ? [0 as const] : [])]);
        }
        if (ff.q) outputs[ff.q] = q;
        if (ff.qn) outputs[ff.qn] = both ? 1 : not(q);
        return q;
      });
      return { outputs, state: { prev: snapshot(read, clocks), bits } };
    },
  };
}

function comparatorModel(spec: ComparatorLogic): LogicModel {
  const o = spec.outputs;
  const c = spec.cascade;
  return {
    outputs: [o.gt, o.eq, o.lt],
    init: () => ({ prev: {}, bits: [] }),
    evaluate(read, state) {
      const a = toNumber(readAll(read, spec.a));
      const b = toNumber(readAll(read, spec.b));
      let gt: Logic;
      let eq: Logic;
      let lt: Logic;
      if (a === 'X' || b === 'X') gt = eq = lt = 'X';
      else if (a > b) [gt, eq, lt] = [1, 0, 0];
      else if (a < b) [gt, eq, lt] = [0, 0, 1];
      else {
        // 資料表的串接真值表。
        const ig = read(c.gt);
        const ie = read(c.eq);
        const il = read(c.lt);
        eq = ie;
        gt = and([not(ie), not(il)]);
        lt = and([not(ie), not(ig)]);
      }
      return { outputs: { [o.gt]: gt, [o.eq]: eq, [o.lt]: lt }, state };
    },
  };
}

function muxModel(spec: MuxLogic): LogicModel {
  return {
    outputs: spec.units.flatMap((u) => [u.output, u.outputN].filter((p): p is string => p !== undefined)),
    init: () => ({ prev: {}, bits: [] }),
    evaluate(read, state) {
      const outputs: Record<string, Level> = {};
      for (const u of spec.units) {
        const enabled = allAsserted(read, u.enable);
        const selected = toNumber(readAll(read, u.select));
        const y: Logic = enabled === 0 ? 0 : enabled === 'X' || selected === 'X' ? 'X' : read(u.data[selected]);
        if (u.output) outputs[u.output] = y;
        if (u.outputN) outputs[u.outputN] = not(y);
      }
      return { outputs, state };
    },
  };
}

/** 74LS47 的字形（亮的段 a–g），索引是輸入值 0–15（資料表：6 上面沒有橫、9 下面沒有橫）。 */
export const BCD_GLYPHS: readonly string[] = [
  'abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'cdefg', 'abc', 'abcdefg', 'abcfg', 'deg', 'cdg', 'bfg', 'adfg', 'defg', '',
];
const SEGMENT_LETTERS = 'abcdefg';

function bcd7segModel(spec: Bcd7segLogic): LogicModel {
  return {
    outputs: [...spec.segments],
    init: () => ({ prev: {}, bits: [] }),
    evaluate(read, state) {
      const outputs: Record<string, Level> = {};
      // 74LS47：亮 → 驅動 0；不亮 → 開集極斷開（Z）。子專案 32：74LS48 亮 → 1、不亮 → 0。
      const show = (on: (segment: string) => Logic) =>
        spec.segments.forEach((pin, i) => {
          const v = on(SEGMENT_LETTERS[i]);
          outputs[pin] = v === 'X' ? 'X' : spec.activeHigh ? v : v === 1 ? 0 : 'Z';
        });
      const bi = read(spec.blanking);
      const lt = read(spec.lampTest);
      const rbi = read(spec.rippleBlanking);
      const value = toNumber(readAll(read, spec.inputs));
      if (bi === 0) show(() => 0);
      else if (bi === 'X') show(() => 'X');
      else if (lt === 0) show(() => 1);
      else if (lt === 'X' || value === 'X') show(() => 'X');
      else if (value === 0 && rbi === 0) show(() => 0);
      else if (value === 0 && rbi === 'X') show(() => 'X');
      else show((segment) => (BCD_GLYPHS[value].includes(segment) ? 1 : 0));
      return { outputs, state };
    },
  };
}

/** NE555 的虛擬振盪腳：編譯模擬時接到一個由模擬時間驅動的節點（見 simulate.ts）。 */
export const OSC_PIN = '~OSC';

function timer555Model(spec: Timer555Logic): LogicModel {
  return {
    outputs: [spec.output],
    init: () => ({ prev: {}, bits: [] }),
    evaluate(read, state) {
      const reset = asserted(read, spec.reset);
      const v: Logic = reset === 1 ? 0 : reset === 'X' ? 'X' : read(OSC_PIN);
      return { outputs: { [spec.output]: v }, state };
    },
  };
}

export function createModel(spec: LogicSpec): LogicModel {
  switch (spec.model) {
    case 'gates':
      return gatesModel(spec);
    case 'decoder':
      return decoderModel(spec);
    case 'dff':
      return dffModel(spec);
    case 'ripple-counter':
      return rippleCounterModel(spec);
    case 'sync-counter':
      return syncCounterModel(spec);
    case 'updown-counter':
      return upDownCounterModel(spec);
    case 'adder':
      return adderModel(spec);
    case 'jkff':
      return jkffModel(spec);
    case 'comparator':
      return comparatorModel(spec);
    case 'mux':
      return muxModel(spec);
    case 'bcd7seg':
      return bcd7segModel(spec);
    case 'timer555':
      return timer555Model(spec);
    case 'transceiver':
      return transceiverModel(spec);
  }
}
