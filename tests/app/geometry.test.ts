import { describe, expect, it } from 'vitest';
import { boundsOf, componentCells } from '../../src/app/geometry/componentShape';
import { hitTest } from '../../src/app/geometry/hitTest';
import { rotateClockwise } from '../../src/app/geometry/rotate';
import { anchorCenteredAt, snapAnchor, trenchAnchorY } from '../../src/app/geometry/snap';
import { flippedPath, lPath } from '../../src/app/geometry/wirePath';
import { getComponentDefinition } from '../../src/core/circuit/library';
import { circuit, comp, hole, pt, wire } from '../fixtures/build';

const def = (id: string) => getComponentDefinition(id)!;
const xy = (points: Array<{ x: number; y: number }>) => points.map((p) => [p.x, p.y]);

describe('componentCells', () => {
  it('covers the pins and the body of a resistor', () => {
    const cells = componentCells(comp('R1', 'resistor', 'A20'));
    expect(cells).toHaveLength(5);
    expect(xy(cells)).toEqual(expect.arrayContaining([[20, 4], [21, 4], [22, 4], [23, 4], [24, 4]]));
  });

  it('includes the cells between LED legs', () => {
    expect(componentCells(comp('D1', 'led', 'C10', { span: 3 }))).toHaveLength(4);
  });

  it('covers the whole DIP rectangle', () => {
    expect(boundsOf(componentCells(comp('U1', '74LS00', 'F10')))).toEqual({ minX: 10, minY: 8, maxX: 16, maxY: 11 });
  });
});

describe('hitTest', () => {
  const c = circuit([comp('U1', '74LS00', 'F10'), comp('D1', 'led', 'C30', { span: 3 })], [wire('m1', 'A40', 'A50')]);

  it('prefers pins, then component areas, then wires, then holes', () => {
    expect(hitTest(c, hole('E10'))).toEqual({ kind: 'pin', componentId: 'U1', pinNumber: 14 });
    expect(hitTest(c, pt(12, 9))).toEqual({ kind: 'component', componentId: 'U1' });
    expect(hitTest(c, hole('C31'))).toEqual({ kind: 'component', componentId: 'D1' });
    expect(hitTest(c, hole('A45'))).toEqual({ kind: 'wire', wireId: 'm1' });
    expect(hitTest(c, hole('J60'))).toEqual({ kind: 'hole', point: hole('J60') });
    expect(hitTest(c, pt(20, 9))).toEqual({ kind: 'empty', point: pt(20, 9) });
  });
});

describe('snapping', () => {
  it('pins DIP packages across the trench at 0 and 180 degrees', () => {
    expect(trenchAnchorY(def('74LS00'), 0)).toBe(11);
    expect(trenchAnchorY(def('74LS00'), 180)).toBe(8);
    expect(trenchAnchorY(def('74LS154'), 0)).toBe(13);
    expect(trenchAnchorY(def('74LS154'), 180)).toBe(7);
    expect(trenchAnchorY(def('dipsw-8'), 0)).toBe(11);
    expect(trenchAnchorY(def('74LS00'), 90)).toBeNull();
    expect(trenchAnchorY(def('resistor'), 0)).toBeNull();
  });

  it('rounds to the nearest grid point and applies the trench rule', () => {
    expect(snapAnchor(def('resistor'), 0, { x: 12.4, y: 5.6 })).toEqual({ x: 12, y: 6 });
    expect(snapAnchor(def('74LS00'), 0, { x: 12.6, y: 3 })).toEqual({ x: 13, y: 11 });
  });

  it('centres parts on the pointer', () => {
    expect(anchorCenteredAt(def('74LS00'), 0, undefined, { x: 13, y: 5 })).toEqual({ x: 10, y: 11 });
    expect(anchorCenteredAt(def('resistor'), 0, undefined, { x: 32, y: 12 })).toEqual({ x: 30, y: 12 });
    expect(anchorCenteredAt(def('led'), 0, undefined, { x: 40, y: 12 })).toEqual({ x: 40, y: 12 });
    expect(anchorCenteredAt(def('vcc'), 0, undefined, { x: 5, y: 2 })).toEqual({ x: 5, y: 2 });
  });
});

describe('rotateClockwise', () => {
  it('turns a resistor about its centre', () => {
    const r = rotateClockwise(comp('R1', 'resistor', [30, 12]));
    expect(r.rotation).toBe(90);
    expect(r.anchor).toEqual({ x: 32, y: 10 });
  });

  it('turns a DIP to 90 degrees, then back across the trench at 180', () => {
    const quarter = rotateClockwise(comp('U1', '74LS00', 'F10'));
    expect(quarter).toMatchObject({ rotation: 90, anchor: { x: 11, y: 6 } });
    const half = rotateClockwise(quarter);
    expect(half.rotation).toBe(180);
    expect(half.anchor).toEqual({ x: 15, y: 8 });
  });
});

describe('wire paths', () => {
  it('builds L-shaped paths in either order', () => {
    expect(xy(lPath(hole('A10'), hole('C12'), true))).toEqual([[10, 4], [11, 4], [12, 4], [12, 5], [12, 6]]);
    expect(xy(lPath(hole('A10'), hole('C12'), false))).toEqual([[10, 4], [10, 5], [10, 6], [11, 6], [12, 6]]);
    expect(xy(lPath(hole('A10'), hole('A13'), false))).toEqual([[10, 4], [11, 4], [12, 4], [13, 4]]);
  });

  it('flips only wires with exactly one corner', () => {
    const l = { ...wire('m1', 'A10', 'C12'), path: lPath(hole('A10'), hole('C12'), true) };
    expect(xy(flippedPath(l)!)).toEqual([[10, 4], [10, 5], [10, 6], [11, 6], [12, 6]]);
    expect(flippedPath(wire('m2', 'A10', 'A20'))).toBeNull();
    expect(flippedPath(wire('m3', 'A10', [12, 3], 'C14'))).toBeNull();
  });
});
