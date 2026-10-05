import { describe, expect, it } from 'vitest';
import { effectiveSpan, resolveFootprint, rotateOffset } from '../../src/core/circuit/footprint';
import type { ComponentDefinition, ComponentInstance, PackageSpec, Rotation } from '../../src/types/component';

function def(pkg: PackageSpec): ComponentDefinition {
  return { id: 'T', name: 'T', category: 'ic', package: pkg, pins: [], internalConnections: [], defaultProps: {}, logic: null };
}

function inst(x: number, y: number, rotation: Rotation = 0, span?: number): ComponentInstance {
  return { id: 'c1', defId: 'T', boardId: 'b1', anchor: { x, y }, rotation, span, props: {} };
}

const pins = (fp: ReturnType<typeof resolveFootprint>) => fp.pins.map((p) => [p.pinNumber, p.point.x, p.point.y]);
const cells = (fp: ReturnType<typeof resolveFootprint>) => fp.blocked.map((p) => [p.x, p.y]);

const dip14 = def({ type: 'dip', pinCount: 14, rowSpacing: 3 });
const dip24w = def({ type: 'dip', pinCount: 24, rowSpacing: 6 });
const resistor = def({ type: 'two-lead', defaultSpan: 4, minSpan: 1, blocksBetween: true });
const led = def({ type: 'two-lead', defaultSpan: 1, minSpan: 1, blocksBetween: false });
const single = def({ type: 'single' });
const button = def({ type: 'tactile4' });

describe('rotateOffset', () => {
  it('rotates clockwise in screen coordinates (y down)', () => {
    expect(rotateOffset([1, 0], 0)).toEqual([1, 0]);
    expect(rotateOffset([1, 0], 90)).toEqual([0, 1]);
    expect(rotateOffset([1, 0], 180)).toEqual([-1, 0]);
    expect(rotateOffset([1, 0], 270)).toEqual([0, -1]);
  });
});

describe('resolveFootprint', () => {
  it('places a 0.3-inch DIP14 across the trench with pin 1 bottom-left', () => {
    const fp = resolveFootprint(inst(10, 11), dip14);
    expect(pins(fp)).toEqual([
      [1, 10, 11], [2, 11, 11], [3, 12, 11], [4, 13, 11], [5, 14, 11], [6, 15, 11], [7, 16, 11],
      [8, 16, 8], [9, 15, 8], [10, 14, 8], [11, 13, 8], [12, 12, 8], [13, 11, 8], [14, 10, 8],
    ]);
    expect(fp.blocked).toHaveLength(7 * 4);
    expect(cells(fp)).toContainEqual([12, 9]);
    expect(cells(fp)).toContainEqual([12, 10]);
    expect(fp.pins[0].point.boardId).toBe('b1');
  });

  it('places a DIP14 upside down (rotation 180)', () => {
    const fp = resolveFootprint(inst(16, 8, 180), dip14);
    expect(pins(fp)[0]).toEqual([1, 16, 8]);
    expect(pins(fp)[6]).toEqual([7, 10, 8]);
    expect(pins(fp)[7]).toEqual([8, 10, 11]);
    expect(pins(fp)[13]).toEqual([14, 16, 11]);
  });

  it('places a 0.6-inch DIP24 on rows D and H', () => {
    const fp = resolveFootprint(inst(20, 13), dip24w);
    expect(pins(fp)[0]).toEqual([1, 20, 13]);
    expect(pins(fp)[11]).toEqual([12, 31, 13]);
    expect(pins(fp)[12]).toEqual([13, 31, 7]);
    expect(pins(fp)[23]).toEqual([24, 20, 7]);
    expect(fp.blocked).toHaveLength(12 * 7);
  });

  it('places a resistor with its default span and blocks the body', () => {
    const fp = resolveFootprint(inst(30, 12), resistor);
    expect(pins(fp)).toEqual([[1, 30, 12], [2, 34, 12]]);
    expect(cells(fp)).toEqual([[31, 12], [32, 12], [33, 12]]);
  });

  it('honours span overrides and every rotation for two-lead parts', () => {
    expect(pins(resolveFootprint(inst(29, 8, 90, 3), resistor))).toEqual([[1, 29, 8], [2, 29, 11]]);
    expect(cells(resolveFootprint(inst(29, 8, 90, 3), resistor))).toEqual([[29, 9], [29, 10]]);
    expect(pins(resolveFootprint(inst(30, 12, 180), resistor))).toEqual([[1, 30, 12], [2, 26, 12]]);
    expect(pins(resolveFootprint(inst(30, 12, 270), resistor))).toEqual([[1, 30, 12], [2, 30, 8]]);
    expect(effectiveSpan(inst(1, 1, 0, 7), resistor)).toBe(7);
    expect(effectiveSpan(inst(1, 1), resistor)).toBe(4);
    expect(effectiveSpan(inst(1, 1), dip14)).toBe(0);
  });

  it('does not block anything for LEDs and single terminals', () => {
    expect(pins(resolveFootprint(inst(40, 12), led))).toEqual([[1, 40, 12], [2, 41, 12]]);
    expect(resolveFootprint(inst(40, 12, 0, 3), led).blocked).toEqual([]);
    expect(pins(resolveFootprint(inst(5, 2), single))).toEqual([[1, 5, 2]]);
    expect(resolveFootprint(inst(5, 2), single).blocked).toEqual([]);
  });

  it('places a tactile push button across the trench', () => {
    const fp = resolveFootprint(inst(4, 11), button);
    expect(pins(fp)).toEqual([[1, 4, 11], [2, 4, 8], [3, 6, 11], [4, 6, 8]]);
    expect(fp.blocked).toHaveLength(12);
  });
});
