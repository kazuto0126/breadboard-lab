import { describe, expect, it } from 'vitest';
import { getComponentDefinition, getComponentDefinitions, parseDefinition } from '../../src/core/circuit/library';
import { parseLogic } from '../../src/core/circuit/logicSpec';

const MODELS: Record<string, string> = {
  '74LS00': 'gates',
  '74LS02': 'gates',
  '74LS04': 'gates',
  '74LS08': 'gates',
  '74LS32': 'gates',
  '74LS86': 'gates',
  '74LS74': 'dff',
  '74LS173': 'dff',
  '74LS174': 'dff',
  '74LS175': 'dff',
  '74LS273': 'dff',
  '74LS90': 'ripple-counter',
  '74LS93': 'ripple-counter',
  '74LS161': 'sync-counter',
  '74LS163': 'sync-counter',
  '74LS193': 'updown-counter',
  '74LS138': 'decoder',
  '74LS154': 'decoder',
  '74LS245': 'transceiver',
  '74LS283': 'adder',
  '74LS11': 'gates',
  '74LS21': 'gates',
  '74LS83': 'adder',
  '74LS73': 'jkff',
  '74LS76': 'jkff',
  '74LS85': 'comparator',
  '74LS151': 'mux',
  '74LS153': 'mux',
  '74LS47': 'bcd7seg',
  NE555: 'timer555',
};

describe('logic specs in the component library', () => {
  it('gives every 74LS IC a logic model and every other part none', () => {
    for (const def of getComponentDefinitions()) {
      if (def.category === 'ic') expect(def.logic?.model, def.id).toBe(MODELS[def.id]);
      else expect(def.logic, def.id).toBeNull();
    }
    expect(Object.keys(MODELS)).toHaveLength(30);
  });

  it('wires 74LS00 gate 1 to pins 1A, 1B → 1Y', () => {
    const logic = getComponentDefinition('74LS00')!.logic;
    expect(logic?.model).toBe('gates');
    if (logic?.model === 'gates') {
      expect(logic.gates).toHaveLength(4);
      expect(logic.gates[0]).toEqual({ op: 'nand', in: ['1A', '1B'], out: '1Y' });
    }
  });

  it('defines the clock source part', () => {
    const clock = getComponentDefinition('clock')!;
    expect(clock).toMatchObject({ category: 'clock', package: { type: 'single' }, defaultProps: { frequency: 1 } });
    expect(clock.pins).toEqual([{ number: 1, name: 'CLK', role: 'output' }]);
  });
});

describe('parseLogic', () => {
  const pins = new Set(['A', 'B', 'Y', 'CLK', 'Q', 'EN']);

  it('returns null when there is no logic', () => {
    expect(parseLogic('X', null, pins)).toBeNull();
    expect(parseLogic('X', undefined, pins)).toBeNull();
  });

  it('keeps only the known fields', () => {
    expect(parseLogic('X', { model: 'gates', gates: [{ op: 'and', in: ['A', 'B'], out: 'Y', colour: 'red' }], extra: 1 }, pins)).toEqual({
      model: 'gates',
      gates: [{ op: 'and', in: ['A', 'B'], out: 'Y' }],
    });
  });

  it('rejects malformed specs with a readable message', () => {
    expect(() => parseLogic('X', { model: 'toaster' }, pins)).toThrow('model is unknown');
    expect(() => parseLogic('X', { model: 'gates', gates: [{ op: 'and', in: ['A', 'Z'], out: 'Y' }] }, pins)).toThrow('unknown pin Z');
    expect(() => parseLogic('X', { model: 'gates', gates: [{ op: 'not', in: ['A', 'B'], out: 'Y' }] }, pins)).toThrow('exactly one input');
    expect(() => parseLogic('X', { model: 'gates', gates: [{ op: 'maybe', in: ['A'], out: 'Y' }] }, pins)).toThrow('op is unknown');
    expect(() =>
      parseLogic('X', { model: 'decoder', units: [{ select: ['A', 'B'], enable: [], outputs: ['Y'], outputActive: 'low' }] }, pins),
    ).toThrow('2^select');
    expect(() => parseLogic('X', { model: 'dff', flipflops: [{ d: 'A', clock: 'CLK' }] }, pins)).toThrow('needs q or qn');
    expect(() =>
      parseLogic('X', { model: 'dff', flipflops: [{ d: 'A', clock: 'CLK', q: 'Q', clear: { pin: 'EN', active: 'sideways' } }] }, pins),
    ).toThrow('active');
    expect(() =>
      parseLogic(
        'X',
        { model: 'ripple-counter', stages: [{ clock: 'CLK', modulus: 2, outputs: ['Q'] }], presets: [{ when: [{ pin: 'EN', active: 'high' }], values: [5] }] },
        pins,
      ),
    ).toThrow('out of range');
    expect(() => parseLogic('X', { model: 'ripple-counter', stages: [{ clock: 'CLK', modulus: 4, outputs: ['Q'] }] }, pins)).toThrow(
      'more outputs',
    );
  });

  it('refuses to reference a pin name that appears twice (like NC)', () => {
    const base = {
      id: 'X',
      name: 'X',
      category: 'ic',
      package: { type: 'dip', pinCount: 4, rowSpacing: 3 },
      pins: [
        { number: 1, name: 'A', role: 'input' },
        { number: 2, name: 'NC', role: 'nc' },
        { number: 3, name: 'NC', role: 'nc' },
        { number: 4, name: 'Y', role: 'output' },
      ],
    };
    expect(parseDefinition({ ...base, logic: { model: 'gates', gates: [{ op: 'not', in: ['A'], out: 'Y' }] } }).logic).not.toBeNull();
    expect(() => parseDefinition({ ...base, logic: { model: 'gates', gates: [{ op: 'not', in: ['NC'], out: 'Y' }] } })).toThrow('unknown pin NC');
  });
});
