import { describe, expect, it } from 'vitest';
import { getComponentDefinition } from '../../src/core/circuit/library';
import { resolveFootprint } from '../../src/core/circuit/footprint';
import {
  centeredAnchor,
  checkPlacement,
  findPlacement,
  footprintCenter,
  rotatedPlacement,
  searchOffsets,
} from '../../src/editor/placement';
import { circuit, comp, hole, wire } from '../fixtures/build';

const def = (id: string) => getComponentDefinition(id)!;

describe('checkPlacement', () => {
  it('accepts a DIP straddling the centre channel', () => {
    const ic = comp('U1', '74LS00', 'F10');
    expect(checkPlacement(circuit([ic]), ic)).toEqual({ ok: true, clean: true, hard: [], soft: [] });
  });

  it('rejects pins on the channel or outside the board', () => {
    const onChannel = comp('U1', '74LS00', [10, 10]);
    expect(checkPlacement(circuit([]), onChannel).hard).toContain('OFF_HOLE');
    const offBoard = comp('R1', 'resistor', 'A62');
    expect(checkPlacement(circuit([]), offBoard).hard).toContain('OUT_OF_BOARD');
  });

  it('rejects pins on occupied holes and overlapping bodies', () => {
    const r1 = comp('R1', 'resistor', 'A10');
    const pinOnPin = comp('R2', 'resistor', 'A14');
    expect(checkPlacement(circuit([r1]), pinOnPin).hard).toEqual(['PIN_OCCUPIED']);
    const ic = comp('U1', '74LS00', 'F10');
    const bodyOverBody = comp('R3', 'resistor', 'F8', { rotation: 0 });
    expect(checkPlacement(circuit([ic]), bodyOverBody).hard).toContain('BODY_OVERLAP');
    const onWireEnd = comp('D1', 'led', 'A20');
    expect(checkPlacement(circuit([], [wire('w1', 'A20', 'A25')]), onWireEnd).hard).toEqual(['PIN_OCCUPIED']);
  });

  it('ignores the component itself (moving in place)', () => {
    const r1 = comp('R1', 'resistor', 'A10');
    expect(checkPlacement(circuit([r1]), r1).ok).toBe(true);
  });

  it('flags soft issues: pins shorted by a strip, or pins on a wire', () => {
    const ledInColumn = comp('D1', 'led', 'A5', { rotation: 90 });
    expect(checkPlacement(circuit([]), ledInColumn)).toMatchObject({ ok: true, clean: false, soft: ['PINS_SHORTED'] });
    const onWire = comp('R1', 'resistor', 'C12');
    expect(checkPlacement(circuit([], [wire('w1', 'B10', 'D10')]), { ...onWire, anchor: { x: 10, y: 6 } }).soft).toEqual([
      'ON_WIRE',
    ]);
  });

  it('does not treat internally connected pins as a short', () => {
    // 按鈕的腳 1–2 在同一側、內部本來就導通；放在同一欄的同一半邊不算短路。
    const button = comp('BTN1', 'pushbutton', 'J5');
    const fp = resolveFootprint(button, def('pushbutton'));
    expect(fp.pins.map((p) => p.point.y)).toEqual([15, 12, 15, 12]);
    expect(checkPlacement(circuit([]), button).clean).toBe(true);
  });

  it('reports a span shorter than the minimum', () => {
    const r = { ...comp('R1', 'resistor', 'A10'), span: 0 };
    expect(checkPlacement(circuit([]), r).hard).toContain('SPAN_TOO_SMALL');
  });
});

describe('findPlacement', () => {
  it('snaps a DIP onto the channel from one row off', () => {
    const placed = findPlacement(circuit([]), comp('U1', '74LS00', [10, 10]));
    const f10 = hole('F10');
    expect(placed!.anchor).toEqual({ x: f10.x, y: f10.y });
  });

  it('keeps a clean exact position and moves away from soft issues when it can', () => {
    const r = comp('R1', 'resistor', 'A10');
    expect(findPlacement(circuit([]), r)!.anchor).toEqual(r.anchor);
    const onWire = comp('R2', 'resistor', [10, 6]);
    const moved = findPlacement(circuit([], [wire('w1', 'B10', 'D10')]), onWire)!;
    expect(moved.anchor).not.toEqual(onWire.anchor);
    expect(checkPlacement(circuit([], [wire('w1', 'B10', 'D10')]), moved).clean).toBe(true);
  });

  it('returns null when nothing nearby is legal', () => {
    expect(findPlacement(circuit([]), comp('U1', '74LS00', [10, 10]), { radius: 0 })).toBeNull();
  });

  it('searches offsets nearest first, deterministically', () => {
    const offsets = searchOffsets(1);
    expect(offsets[0]).toEqual([0, 0]);
    expect(offsets.slice(1, 5)).toEqual([[-1, 0], [1, 0], [0, -1], [0, 1]]);
    expect(searchOffsets(1)).toBe(offsets);
  });
});

describe('rotation helpers', () => {
  it('computes footprint centres and centred anchors', () => {
    const ic = comp('U1', '74LS00', 'F10');
    expect(footprintCenter(ic, def('74LS00'))).toEqual({ x: 13, y: 9.5 });
    expect(centeredAnchor(def('74LS00'), 0, undefined, 13, 9.5)).toEqual({ x: 10, y: 11 });
    expect(centeredAnchor(def('resistor'), 0, undefined, 12, 4)).toEqual({ x: 10, y: 4 });
  });

  it('flips a DIP by 180° because 90° can never be plugged in', () => {
    const ic = comp('U1', '74LS00', 'F10');
    const rotated = rotatedPlacement(circuit([ic]), ic)!;
    expect(rotated.rotation).toBe(180);
    const pins = resolveFootprint(rotated, def('74LS00')).pins;
    expect(pins.find((p) => p.pinNumber === 1)!.point).toEqual(hole('E16'));
    expect(pins.find((p) => p.pinNumber === 14)!.point).toEqual(hole('F16'));
  });

  it('turns a resistor upright around its centre', () => {
    const r = comp('R1', 'resistor', 'A10');
    const rotated = rotatedPlacement(circuit([r]), r)!;
    expect(rotated.rotation).toBe(90);
    const pins = resolveFootprint(rotated, def('resistor')).pins.map((p) => p.point.x);
    expect(new Set(pins).size).toBe(1);
  });
});
