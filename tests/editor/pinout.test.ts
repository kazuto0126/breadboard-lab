import { describe, expect, it } from 'vitest';
import { getComponentDefinition } from '../../src/core/circuit/library';
import { pinoutLayout } from '../../src/editor/pinout';

const def = (id: string) => getComponentDefinition(id)!;
const numbers = (pins: Array<{ number: number }>) => pins.map((p) => p.number);

describe('pinoutLayout', () => {
  it('matches the board with the notch on the left (rotation 0)', () => {
    const l = pinoutLayout(def('74LS00'), 0)!;
    expect(l.notch).toBe('left');
    expect(numbers(l.bottom)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(numbers(l.top)).toEqual([14, 13, 12, 11, 10, 9, 8]);
    expect(l.top[0]).toMatchObject({ name: 'VCC', kind: 'power' });
    expect(l.bottom[6]).toMatchObject({ name: 'GND', kind: 'ground' });
  });

  it('turns around with the IC (rotation 180)', () => {
    const l = pinoutLayout(def('74LS00'), 180)!;
    expect(l.notch).toBe('right');
    expect(numbers(l.top)).toEqual([7, 6, 5, 4, 3, 2, 1]);
    expect(numbers(l.bottom)).toEqual([8, 9, 10, 11, 12, 13, 14]);
  });

  it('marks active-low pins and strips the slash from the label', () => {
    const y0 = pinoutLayout(def('74LS138'), 0)!.top.find((p) => p.number === 15)!;
    expect(y0).toMatchObject({ name: '/Y0', label: 'Y0', activeLow: true });
    const bi = pinoutLayout(def('74LS47'), 0)!.bottom.find((p) => p.number === 4)!;
    expect(bi).toMatchObject({ label: 'BI/RBO', activeLow: true });
    expect(pinoutLayout(def('74LS47'), 0)!.bottom[0]).toMatchObject({ label: 'B', activeLow: false });
  });

  it('shows NC pins and the common anode of a 7-segment display', () => {
    expect(pinoutLayout(def('74LS21'), 0)!.bottom[2]).toMatchObject({ number: 3, kind: 'nc' });
    const seg = pinoutLayout(def('7seg-ca'), 180)!;
    expect(seg.notch).toBe('right');
    expect(numbers(seg.top)).toEqual([5, 4, 3, 2, 1]);
    expect(seg.top[2]).toMatchObject({ name: 'CA', kind: 'power' });
  });

  it('has no diagram for DIP switches or two-lead parts', () => {
    expect(pinoutLayout(def('dipsw-4'), 0)).toBeNull();
    expect(pinoutLayout(def('resistor'), 0)).toBeNull();
  });
});
