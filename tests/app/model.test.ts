import { describe, expect, it } from 'vitest';
import { colorName, DEFAULT_WIRE_COLOR, WIRE_COLORS } from '../../src/app/model/colors';
import { nextComponentId, nextWireId } from '../../src/app/model/ids';
import { naturalCompare } from '../../src/app/model/naturalCompare';
import {
  BOARD_ID,
  circuitSignature,
  createProject,
  DEFAULT_PROJECT_NAME,
  emptyCircuit,
  isRoutingStale,
  stableStringify,
} from '../../src/app/model/projectFile';
import { circuit, comp, wire } from '../fixtures/build';

const NO_METRICS = { wireCount: 0, totalLength: 0, bends: 0, crossings: 0, overlaps: 0, shortJogs: 0 };

describe('project file', () => {
  it('creates an empty project with one MB-102 board', () => {
    const doc = createProject(undefined, new Date('2026-10-06T00:00:00Z'));
    expect(doc).toEqual({
      format: 'breadboard-lab',
      version: 1,
      name: DEFAULT_PROJECT_NAME,
      circuit: emptyCircuit(),
      routing: null,
      savedAt: '2026-10-06T00:00:00.000Z',
    });
    expect(doc.circuit.boards).toEqual([{ id: BOARD_ID, layoutId: 'MB102', x: 0, y: 0, groupId: null }]);
  });

  it('stringifies objects independent of key order and drops undefined', () => {
    expect(stableStringify({ b: 1, a: [2, { d: undefined, c: 3 }] })).toBe('{"a":[2,{"c":3}],"b":1}');
  });

  it('gives the same signature regardless of component order', () => {
    const a = circuit([comp('R1', 'resistor', 'A10'), comp('D1', 'led', 'C30')], [wire('m1', 'B10', 'B30')]);
    const reversed = { ...a, components: [...a.components].reverse() };
    expect(circuitSignature(reversed)).toBe(circuitSignature(a));
    const moved = { ...a, components: [comp('R1', 'resistor', 'A11'), a.components[1]] };
    expect(circuitSignature(moved)).not.toBe(circuitSignature(a));
  });

  it('marks routing as stale after the circuit changes', () => {
    const doc = createProject();
    expect(isRoutingStale(doc)).toBe(false);
    const routed = {
      ...doc,
      routing: { before: [], beforeScore: 0, metrics: NO_METRICS, score: 100, signature: circuitSignature(doc.circuit), checklist: {} },
    };
    expect(isRoutingStale(routed)).toBe(false);
    const edited = { ...routed, circuit: { ...routed.circuit, wires: [wire('m1', 'A10', 'A20')] } };
    expect(isRoutingStale(edited)).toBe(true);
  });
});

describe('colors', () => {
  it('names the palette colours and falls back to 其他', () => {
    expect(WIRE_COLORS).toHaveLength(10);
    expect(colorName('#D32F2F')).toBe('紅');
    expect(colorName('#212121')).toBe('黑');
    expect(colorName('#123456')).toBe('其他');
    expect(DEFAULT_WIRE_COLOR).toBe('#d32f2f');
  });
});

describe('naturalCompare', () => {
  it('orders embedded numbers numerically', () => {
    expect(['NET_10', 'NET_2', 'GND', 'NET_1'].sort(naturalCompare)).toEqual(['GND', 'NET_1', 'NET_2', 'NET_10']);
  });
});

describe('ids', () => {
  it('picks the smallest free id for each category prefix', () => {
    const c = circuit(
      [comp('U1', '74LS00', 'F10'), comp('U3', '74LS04', 'F30'), comp('R1', 'resistor', 'A40')],
      [wire('m1', 'A50', 'A55')],
    );
    expect(nextComponentId(c, 'ic')).toBe('U2');
    expect(nextComponentId(c, 'resistor')).toBe('R2');
    expect(nextComponentId(c, 'led')).toBe('D1');
    expect(nextComponentId(c, 'dip-switch')).toBe('SW1');
    expect(nextWireId(c)).toBe('m2');
  });
});
