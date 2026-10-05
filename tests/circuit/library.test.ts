import { describe, expect, it } from 'vitest';
import { getComponentDefinition, getComponentDefinitions, parseDefinition, RESISTOR_PRESETS } from '../../src/core/circuit/library';

const EXPECTED: Record<string, { pinCount: number; rowSpacing: 3 | 6; vcc: number; gnd: number }> = {
  '74LS00': { pinCount: 14, rowSpacing: 3, vcc: 14, gnd: 7 },
  '74LS02': { pinCount: 14, rowSpacing: 3, vcc: 14, gnd: 7 },
  '74LS04': { pinCount: 14, rowSpacing: 3, vcc: 14, gnd: 7 },
  '74LS08': { pinCount: 14, rowSpacing: 3, vcc: 14, gnd: 7 },
  '74LS32': { pinCount: 14, rowSpacing: 3, vcc: 14, gnd: 7 },
  '74LS74': { pinCount: 14, rowSpacing: 3, vcc: 14, gnd: 7 },
  '74LS86': { pinCount: 14, rowSpacing: 3, vcc: 14, gnd: 7 },
  '74LS90': { pinCount: 14, rowSpacing: 3, vcc: 5, gnd: 10 },
  '74LS93': { pinCount: 14, rowSpacing: 3, vcc: 5, gnd: 10 },
  '74LS138': { pinCount: 16, rowSpacing: 3, vcc: 16, gnd: 8 },
  '74LS154': { pinCount: 24, rowSpacing: 6, vcc: 24, gnd: 12 },
  '74LS161': { pinCount: 16, rowSpacing: 3, vcc: 16, gnd: 8 },
  '74LS163': { pinCount: 16, rowSpacing: 3, vcc: 16, gnd: 8 },
  '74LS173': { pinCount: 16, rowSpacing: 3, vcc: 16, gnd: 8 },
  '74LS174': { pinCount: 16, rowSpacing: 3, vcc: 16, gnd: 8 },
  '74LS175': { pinCount: 16, rowSpacing: 3, vcc: 16, gnd: 8 },
  '74LS193': { pinCount: 16, rowSpacing: 3, vcc: 16, gnd: 8 },
  '74LS245': { pinCount: 20, rowSpacing: 3, vcc: 20, gnd: 10 },
  '74LS273': { pinCount: 20, rowSpacing: 3, vcc: 20, gnd: 10 },
  '74LS283': { pinCount: 16, rowSpacing: 3, vcc: 16, gnd: 8 },
};

const pin = (id: string, n: number) => getComponentDefinition(id)!.pins.find((p) => p.number === n)!;

describe('component library', () => {
  it('loads 28 definitions with unique ids', () => {
    const defs = getComponentDefinitions();
    expect(defs).toHaveLength(28);
    expect(new Set(defs.map((d) => d.id)).size).toBe(28);
    expect(getComponentDefinitions()).toBe(defs);
  });

  it.each(Object.entries(EXPECTED))('%s has the right package and power pins', (id, e) => {
    const def = getComponentDefinition(id)!;
    expect(def.category).toBe('ic');
    expect(def.package).toEqual({ type: 'dip', pinCount: e.pinCount, rowSpacing: e.rowSpacing });
    expect(def.pins.map((p) => p.number)).toEqual(Array.from({ length: e.pinCount }, (_, i) => i + 1));
    expect(def.pins.filter((p) => p.role === 'power').map((p) => p.number)).toEqual([e.vcc]);
    expect(def.pins.filter((p) => p.role === 'ground').map((p) => p.number)).toEqual([e.gnd]);
    expect(def.logic).toBeNull();
  });

  it('spot-checks pin names and roles against the datasheets', () => {
    expect(pin('74LS00', 3)).toEqual({ number: 3, name: '1Y', role: 'output' });
    expect(pin('74LS02', 1)).toEqual({ number: 1, name: '1Y', role: 'output' });
    expect(pin('74LS04', 13)).toEqual({ number: 13, name: '6A', role: 'input' });
    expect(pin('74LS74', 5)).toEqual({ number: 5, name: '1Q', role: 'output' });
    expect(pin('74LS90', 14)).toEqual({ number: 14, name: 'CKA', role: 'input' });
    expect(pin('74LS138', 15)).toEqual({ number: 15, name: '/Y0', role: 'output' });
    expect(pin('74LS154', 23)).toEqual({ number: 23, name: 'A', role: 'input' });
    expect(pin('74LS161', 15)).toEqual({ number: 15, name: 'RCO', role: 'output' });
    expect(pin('74LS193', 12)).toEqual({ number: 12, name: '/CO', role: 'output' });
    expect(pin('74LS283', 9)).toEqual({ number: 9, name: 'C4', role: 'output' });
    expect(pin('74LS283', 7)).toEqual({ number: 7, name: 'C0', role: 'input' });
  });

  it('marks NC pins and bidirectional ports', () => {
    const nc = (id: string) => getComponentDefinition(id)!.pins.filter((p) => p.role === 'nc').map((p) => p.number);
    expect(nc('74LS90')).toEqual([4, 13]);
    expect(nc('74LS93')).toEqual([4, 6, 7, 13]);
    expect(getComponentDefinition('74LS245')!.pins.filter((p) => p.role === 'bidir')).toHaveLength(16);
  });

  it('defines the generic parts', () => {
    expect(getComponentDefinition('pushbutton')!.internalConnections).toEqual([[1, 2], [3, 4]]);
    expect(getComponentDefinition('dipsw-4')!.package).toEqual({ type: 'dip', pinCount: 8, rowSpacing: 3 });
    expect(getComponentDefinition('dipsw-8')!.defaultProps.switchStates).toHaveLength(8);
    expect(getComponentDefinition('led')!.pins.map((p) => p.role)).toEqual(['anode', 'cathode']);
    expect(getComponentDefinition('dc-power')!.pins.map((p) => p.role)).toEqual(['vcc-source', 'gnd-source']);
    expect(getComponentDefinition('resistor')!.package).toEqual({ type: 'two-lead', defaultSpan: 4, minSpan: 1, blocksBetween: true });
    expect(getComponentDefinition('nope')).toBeUndefined();
    expect(RESISTOR_PRESETS).toEqual([220, 330, 470, 1000, 2200, 4700, 10000, 100000]);
  });

  it('rejects malformed definitions', () => {
    const base = {
      id: 'X',
      name: 'X',
      category: 'resistor',
      package: { type: 'two-lead', defaultSpan: 4, minSpan: 1, blocksBetween: true },
      pins: [
        { number: 1, name: '1', role: 'passive' },
        { number: 2, name: '2', role: 'passive' },
      ],
    };
    expect(parseDefinition(base).internalConnections).toEqual([]);
    expect(parseDefinition(base).defaultProps).toEqual({});
    expect(() => parseDefinition({ ...base, category: 'toaster' })).toThrow('unknown category');
    expect(() => parseDefinition({ ...base, pins: [base.pins[0]] })).toThrow('numbered 1..2');
    expect(() => parseDefinition({ ...base, pins: [base.pins[0], { number: 2, name: '2', role: 'magic' }] })).toThrow('unknown role');
    expect(() => parseDefinition({ ...base, package: { type: 'dip', pinCount: 7, rowSpacing: 3 } })).toThrow('even');
    expect(() => parseDefinition({ ...base, internalConnections: [[1, 9]] })).toThrow('internalConnections');
    expect(() => parseDefinition(null)).toThrow('not an object');
  });
});
