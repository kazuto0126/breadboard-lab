import { describe, expect, it } from 'vitest';
import { checkPlacement, isFreeHole } from '../../src/app/geometry/placement';
import { circuit, comp, hole, pt, wire } from '../fixtures/build';

const base = circuit([comp('U1', '74LS00', 'F10'), comp('R1', 'resistor', 'A30')], [wire('m1', 'C40', 'C45')]);

describe('checkPlacement', () => {
  it('accepts a part on free holes', () => {
    expect(checkPlacement(base, comp('D1', 'led', 'H40'))).toEqual({ ok: true });
  });

  it('rejects pins that are not on a hole', () => {
    expect(checkPlacement(base, comp('D1', 'led', [20, 9]))).toEqual({ ok: false, reason: '第 1 腳沒有插在孔上' });
    expect(checkPlacement(base, comp('R2', 'resistor', 'A62'))).toEqual({ ok: false, reason: '第 2 腳沒有插在孔上' });
  });

  it('rejects pins on another part, under a body, or on a wire end', () => {
    expect(checkPlacement(base, comp('D1', 'led', 'A34'))).toEqual({ ok: false, reason: '第 1 腳會壓到 R1' });
    expect(checkPlacement(base, comp('D1', 'led', 'A31'))).toEqual({ ok: false, reason: '第 1 腳會壓到 R1' });
    expect(checkPlacement(base, comp('D1', 'led', 'C44'))).toEqual({ ok: false, reason: '第 2 腳的位置已經插了導線' });
  });

  it('rejects a body that covers another part', () => {
    // R2 的腳在 C19、C23，本體蓋住 C20–C22；D9 的兩腳 C21、C22 被本體蓋住。
    const withLed = circuit([comp('D9', 'led', 'C21')]);
    expect(checkPlacement(withLed, comp('R2', 'resistor', 'C19'))).toEqual({ ok: false, reason: '會壓到 D9' });
  });

  it('ignores the part being moved', () => {
    expect(checkPlacement(base, comp('R1', 'resistor', 'A31'), 'R1')).toEqual({ ok: true });
  });

  it('rejects a span below the minimum, unknown parts and unknown boards', () => {
    expect(checkPlacement(base, comp('R2', 'resistor', 'A50', { span: 0 }))).toEqual({ ok: false, reason: '兩腳距離太小' });
    expect(checkPlacement(base, comp('X1', 'nope', 'A50'))).toEqual({ ok: false, reason: '未知的元件 nope' });
    expect(checkPlacement(base, { ...comp('D1', 'led', 'A50'), boardId: 'b9' })).toEqual({ ok: false, reason: '找不到這塊麵包板' });
  });
});

describe('isFreeHole', () => {
  it('is true only for holes without pins, bodies or wire ends', () => {
    expect(isFreeHole(base, hole('A50'))).toBe(true);
    expect(isFreeHole(base, hole('E10'))).toBe(false);
    expect(isFreeHole(base, hole('A31'))).toBe(false);
    expect(isFreeHole(base, hole('C40'))).toBe(false);
    expect(isFreeHole(base, hole('C42'))).toBe(true);
    expect(isFreeHole(base, pt(20, 9))).toBe(false);
  });
});
