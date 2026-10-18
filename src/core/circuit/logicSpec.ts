import type { ActiveSignal, GateOp, LogicSpec } from '../../types/logic';

const GATE_OPS = new Set<string>(['and', 'or', 'nand', 'nor', 'xor', 'xnor', 'not', 'buf']);

type Obj = Record<string, unknown>;

/**
 * 驗證元件 JSON 的 logic 欄位：模型名稱已知、參數齊全、所有腳位名稱都存在。
 * 回傳只含已知欄位的乾淨副本；格式錯誤時丟出可讀的錯誤。
 */
export function parseLogic(id: string, raw: unknown, pinNames: ReadonlySet<string>): LogicSpec | null {
  if (raw === null || raw === undefined) return null;
  const fail = (message: string): never => {
    throw new Error(`Invalid component definition ${id}: logic ${message}`);
  };
  const obj = (v: unknown, path: string): Obj => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(`${path} must be an object`);
    return v as Obj;
  };
  const arr = (v: unknown, path: string, min = 1): unknown[] => {
    if (!Array.isArray(v) || v.length < min) fail(`${path} must be an array with at least ${min} item(s)`);
    return v as unknown[];
  };
  const pin = (v: unknown, path: string): string => {
    if (typeof v !== 'string' || !pinNames.has(v)) fail(`${path} refers to unknown pin ${String(v)}`);
    return v as string;
  };
  const pins = (v: unknown, path: string, min = 1): string[] => arr(v, path, min).map((p, i) => pin(p, `${path}[${i}]`));
  const signal = (v: unknown, path: string): ActiveSignal => {
    const s = obj(v, path);
    if (s.active !== 'high' && s.active !== 'low') fail(`${path}.active must be "high" or "low"`);
    return { pin: pin(s.pin, `${path}.pin`), active: s.active as 'high' | 'low' };
  };
  const signals = (v: unknown, path: string, min = 1): ActiveSignal[] => arr(v, path, min).map((s, i) => signal(s, `${path}[${i}]`));
  const positiveInt = (v: unknown, path: string): number => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) fail(`${path} must be a positive integer`);
    return v as number;
  };
  const sameLength = (a: unknown[], b: unknown[], what: string) => {
    if (a.length !== b.length) fail(`${what} must have the same length`);
  };

  const spec = obj(raw, '');
  switch (spec.model) {
    case 'gates':
      return {
        model: 'gates',
        gates: arr(spec.gates, 'gates').map((g, i) => {
          const gate = obj(g, `gates[${i}]`);
          if (typeof gate.op !== 'string' || !GATE_OPS.has(gate.op)) fail(`gates[${i}].op is unknown (${String(gate.op)})`);
          const inputs = pins(gate.in, `gates[${i}].in`);
          if ((gate.op === 'not' || gate.op === 'buf') && inputs.length !== 1) fail(`gates[${i}] (${gate.op}) takes exactly one input`);
          return { op: gate.op as GateOp, in: inputs, out: pin(gate.out, `gates[${i}].out`) };
        }),
      };
    case 'decoder':
      return {
        model: 'decoder',
        units: arr(spec.units, 'units').map((u, i) => {
          const unit = obj(u, `units[${i}]`);
          const select = pins(unit.select, `units[${i}].select`);
          const outputs = pins(unit.outputs, `units[${i}].outputs`);
          if (outputs.length !== 2 ** select.length) fail(`units[${i}].outputs must have 2^select outputs`);
          if (unit.outputActive !== 'high' && unit.outputActive !== 'low') fail(`units[${i}].outputActive must be "high" or "low"`);
          return { select, enable: signals(unit.enable ?? [], `units[${i}].enable`, 0), outputs, outputActive: unit.outputActive as 'high' | 'low' };
        }),
      };
    case 'dff':
      return {
        model: 'dff',
        flipflops: arr(spec.flipflops, 'flipflops').map((f, i) => {
          const ff = obj(f, `flipflops[${i}]`);
          if (ff.q === undefined && ff.qn === undefined) fail(`flipflops[${i}] needs q or qn`);
          return {
            d: pin(ff.d, `flipflops[${i}].d`),
            clock: pin(ff.clock, `flipflops[${i}].clock`),
            ...(ff.q !== undefined ? { q: pin(ff.q, `flipflops[${i}].q`) } : {}),
            ...(ff.qn !== undefined ? { qn: pin(ff.qn, `flipflops[${i}].qn`) } : {}),
            ...(ff.preset !== undefined ? { preset: signal(ff.preset, `flipflops[${i}].preset`) } : {}),
            ...(ff.clear !== undefined ? { clear: signal(ff.clear, `flipflops[${i}].clear`) } : {}),
          };
        }),
        ...(spec.load !== undefined ? { load: signals(spec.load, 'load') } : {}),
        ...(spec.outputEnable !== undefined ? { outputEnable: signals(spec.outputEnable, 'outputEnable') } : {}),
      };
    case 'ripple-counter': {
      const stages = arr(spec.stages, 'stages').map((s, i) => {
        const stage = obj(s, `stages[${i}]`);
        const modulus = positiveInt(stage.modulus, `stages[${i}].modulus`);
        const outputs = pins(stage.outputs, `stages[${i}].outputs`);
        if (2 ** outputs.length < modulus) fail(`stages[${i}] needs more outputs for modulus ${modulus}`);
        return { clock: pin(stage.clock, `stages[${i}].clock`), modulus, outputs };
      });
      const presets = arr(spec.presets ?? [], 'presets', 0).map((p, i) => {
        const preset = obj(p, `presets[${i}]`);
        const values = arr(preset.values, `presets[${i}].values`);
        sameLength(values, stages, `presets[${i}].values and stages`);
        values.forEach((v, k) => {
          if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= stages[k].modulus) fail(`presets[${i}].values[${k}] is out of range`);
        });
        return { when: signals(preset.when, `presets[${i}].when`), values: values as number[] };
      });
      return { model: 'ripple-counter', stages, presets };
    }
    case 'sync-counter': {
      const outputs = pins(spec.outputs, 'outputs');
      const data = pins(spec.data, 'data');
      sameLength(outputs, data, 'outputs and data');
      const clear = obj(spec.clear, 'clear');
      if (clear.mode !== 'async' && clear.mode !== 'sync') fail('clear.mode must be "async" or "sync"');
      const carry = obj(spec.carry, 'carry');
      return {
        model: 'sync-counter',
        outputs,
        data,
        clock: pin(spec.clock, 'clock'),
        clear: { ...signal(clear, 'clear'), mode: clear.mode as 'async' | 'sync' },
        load: signal(spec.load, 'load'),
        enable: signals(spec.enable ?? [], 'enable', 0),
        carry: { output: pin(carry.output, 'carry.output'), enable: signals(carry.enable ?? [], 'carry.enable', 0) },
      };
    }
    case 'updown-counter': {
      const outputs = pins(spec.outputs, 'outputs');
      const data = pins(spec.data, 'data');
      sameLength(outputs, data, 'outputs and data');
      return {
        model: 'updown-counter',
        outputs,
        data,
        up: pin(spec.up, 'up'),
        down: pin(spec.down, 'down'),
        clear: signal(spec.clear, 'clear'),
        load: signal(spec.load, 'load'),
        carry: pin(spec.carry, 'carry'),
        borrow: pin(spec.borrow, 'borrow'),
      };
    }
    case 'adder': {
      const a = pins(spec.a, 'a');
      const b = pins(spec.b, 'b');
      const sum = pins(spec.sum, 'sum');
      sameLength(a, b, 'a and b');
      sameLength(a, sum, 'a and sum');
      return { model: 'adder', a, b, carryIn: pin(spec.carryIn, 'carryIn'), sum, carryOut: pin(spec.carryOut, 'carryOut') };
    }
    case 'transceiver': {
      const a = pins(spec.a, 'a');
      const b = pins(spec.b, 'b');
      sameLength(a, b, 'a and b');
      const direction = obj(spec.direction, 'direction');
      if (direction.aToB !== 'high' && direction.aToB !== 'low') fail('direction.aToB must be "high" or "low"');
      return {
        model: 'transceiver',
        a,
        b,
        direction: { pin: pin(direction.pin, 'direction.pin'), aToB: direction.aToB as 'high' | 'low' },
        enable: signals(spec.enable ?? [], 'enable', 0),
      };
    }
    case 'jkff':
      return {
        model: 'jkff',
        flipflops: arr(spec.flipflops, 'flipflops').map((f, i) => {
          const ff = obj(f, `flipflops[${i}]`);
          if (ff.q === undefined && ff.qn === undefined) fail(`flipflops[${i}] needs q or qn`);
          return {
            j: pin(ff.j, `flipflops[${i}].j`),
            k: pin(ff.k, `flipflops[${i}].k`),
            clock: pin(ff.clock, `flipflops[${i}].clock`),
            ...(ff.q !== undefined ? { q: pin(ff.q, `flipflops[${i}].q`) } : {}),
            ...(ff.qn !== undefined ? { qn: pin(ff.qn, `flipflops[${i}].qn`) } : {}),
            ...(ff.preset !== undefined ? { preset: signal(ff.preset, `flipflops[${i}].preset`) } : {}),
            ...(ff.clear !== undefined ? { clear: signal(ff.clear, `flipflops[${i}].clear`) } : {}),
          };
        }),
      };
    case 'comparator': {
      const a = pins(spec.a, 'a');
      const b = pins(spec.b, 'b');
      sameLength(a, b, 'a and b');
      const triple = (v: unknown, path: string) => {
        const t = obj(v, path);
        return { gt: pin(t.gt, `${path}.gt`), eq: pin(t.eq, `${path}.eq`), lt: pin(t.lt, `${path}.lt`) };
      };
      return { model: 'comparator', a, b, cascade: triple(spec.cascade, 'cascade'), outputs: triple(spec.outputs, 'outputs') };
    }
    case 'mux':
      return {
        model: 'mux',
        units: arr(spec.units, 'units').map((u, i) => {
          const unit = obj(u, `units[${i}]`);
          const select = pins(unit.select, `units[${i}].select`);
          const data = pins(unit.data, `units[${i}].data`);
          if (data.length !== 2 ** select.length) fail(`units[${i}].data must have 2^select inputs`);
          if (unit.output === undefined && unit.outputN === undefined) fail(`units[${i}] needs output or outputN`);
          return {
            select,
            data,
            enable: signals(unit.enable ?? [], `units[${i}].enable`, 0),
            ...(unit.output !== undefined ? { output: pin(unit.output, `units[${i}].output`) } : {}),
            ...(unit.outputN !== undefined ? { outputN: pin(unit.outputN, `units[${i}].outputN`) } : {}),
          };
        }),
      };
    case 'bcd7seg': {
      const inputs = pins(spec.inputs, 'inputs');
      const segments = pins(spec.segments, 'segments');
      if (inputs.length !== 4) fail('inputs must be the 4 BCD lines A B C D');
      if (segments.length !== 7) fail('segments must list the 7 outputs a…g');
      return {
        model: 'bcd7seg',
        inputs,
        segments,
        lampTest: pin(spec.lampTest, 'lampTest'),
        blanking: pin(spec.blanking, 'blanking'),
        rippleBlanking: pin(spec.rippleBlanking, 'rippleBlanking'),
        ...(spec.activeHigh === true ? { activeHigh: true } : {}),
      };
    }
    case 'timer555':
      return { model: 'timer555', output: pin(spec.output, 'output'), reset: signal(spec.reset, 'reset') };
    default:
      return fail(`model is unknown (${String(spec.model)})`);
  }
}
