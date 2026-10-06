import { describe, expect, it } from 'vitest';
import { planPress, restrictPlan, wireOrientation } from '../../src/app/interaction/pressPlan';
import { shortcutFor, type KeyInput } from '../../src/app/interaction/shortcuts';
import {
  fitViewport,
  latticeToScreen,
  panBy,
  pinchViewport,
  screenToGridPoint,
  screenToLattice,
  zoomAt,
} from '../../src/app/interaction/viewport';
import { hole, pt } from '../fixtures/build';

describe('viewport math', () => {
  it('fits the board into the view and centres it', () => {
    expect(fitViewport(1280, 380)).toEqual({ scale: 1.9, tx: 32, ty: 9.5 });
  });

  it('never zooms out beyond the minimum scale', () => {
    expect(fitViewport(100, 30)).toEqual({ scale: 0.5, tx: -110, ty: -32.5 });
  });

  it('zooms around the pointer so the point under it stays put', () => {
    const before = { scale: 1, tx: 0, ty: 0 };
    const after = zoomAt(before, 2, 100, 50);
    expect(after).toEqual({ scale: 2, tx: -100, ty: -50 });
    expect(screenToLattice(after, 100, 50)).toEqual(screenToLattice(before, 100, 50));
  });

  it('clamps zooming at the maximum scale', () => {
    expect(zoomAt({ scale: 8, tx: 5, ty: 6 }, 2, 100, 100)).toEqual({ scale: 8, tx: 5, ty: 6 });
  });

  it('pans and converts between screen and lattice coordinates', () => {
    const vp = { scale: 2, tx: 10, ty: 20 };
    expect(panBy(vp, 5, -5)).toEqual({ scale: 2, tx: 15, ty: 15 });
    expect(screenToGridPoint(vp, 260, 108, 'b1')).toEqual({ boardId: 'b1', x: 13, y: 4 });
    expect(latticeToScreen(vp, 12, 4)).toEqual({ x: 250, y: 100 });
  });

  it('zooms and pans with two fingers', () => {
    const start = { scale: 1, tx: 0, ty: 0 };
    const vp = pinchViewport(start, [{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 0, y: 0 }, { x: 200, y: 0 }]);
    expect(vp).toEqual({ scale: 2, tx: 0, ty: 0 });
  });
});

describe('press plans', () => {
  it('follows the table in the spec', () => {
    expect(planPress({ kind: 'pin', componentId: 'U1', pinNumber: 3 }, false)).toEqual({
      click: { kind: 'pin', componentId: 'U1', pinNumber: 3 },
      drag: 'move',
      componentId: 'U1',
    });
    expect(planPress({ kind: 'component', componentId: 'R1' }, false)).toEqual({ click: { kind: 'component', id: 'R1' }, drag: 'move', componentId: 'R1' });
    expect(planPress({ kind: 'wire', wireId: 'm1' }, false)).toEqual({ click: { kind: 'wire', id: 'm1' }, drag: 'pan', componentId: null });
    expect(planPress({ kind: 'hole', point: hole('A1') }, true)).toEqual({ click: { kind: 'hole', point: hole('A1') }, drag: 'wire', componentId: null });
    expect(planPress({ kind: 'hole', point: hole('A1') }, false)).toEqual({ click: null, drag: 'pan', componentId: null });
    expect(planPress({ kind: 'empty', point: pt(20, 9) }, false)).toEqual({ click: null, drag: 'pan', componentId: null });
  });

  it('turns edits into panning when the board is read-only', () => {
    const plan = planPress({ kind: 'component', componentId: 'R1' }, false);
    expect(restrictPlan(plan, false, true)).toEqual({ click: { kind: 'component', id: 'R1' }, drag: 'pan', componentId: null });
    expect(restrictPlan(plan, false, false)).toEqual({ click: null, drag: 'pan', componentId: null });
    expect(restrictPlan(plan, true, true)).toBe(plan);
  });

  it('decides the wire corner once the pointer moved half a cell', () => {
    expect(wireOrientation(0.3, 0.2)).toBeNull();
    expect(wireOrientation(0.6, 0.2)).toBe(true);
    expect(wireOrientation(0.2, -0.7)).toBe(false);
    expect(wireOrientation(0.6, 0.6)).toBe(true);
  });
});

describe('shortcuts', () => {
  const k = (key: string, mods: Partial<KeyInput> = {}): KeyInput => ({
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
  });

  it('maps keys to editor actions', () => {
    expect(shortcutFor(k('r'), false)).toBe('rotate');
    expect(shortcutFor(k('R'), false)).toBe('rotate');
    expect(shortcutFor(k('Delete'), false)).toBe('delete');
    expect(shortcutFor(k('Backspace'), false)).toBe('delete');
    expect(shortcutFor(k('Escape'), false)).toBe('escape');
    expect(shortcutFor(k('z', { ctrlKey: true }), false)).toBe('undo');
    expect(shortcutFor(k('z', { metaKey: true }), false)).toBe('undo');
    expect(shortcutFor(k('Z', { ctrlKey: true, shiftKey: true }), false)).toBe('redo');
    expect(shortcutFor(k('y', { ctrlKey: true }), false)).toBe('redo');
    expect(shortcutFor(k('s', { ctrlKey: true }), false)).toBe('save');
    expect(shortcutFor(k('r', { ctrlKey: true }), false)).toBeNull();
    expect(shortcutFor(k('a'), false)).toBeNull();
  });

  it('only lets Ctrl+S through while typing', () => {
    expect(shortcutFor(k('s', { ctrlKey: true }), true)).toBe('save');
    expect(shortcutFor(k('r'), true)).toBeNull();
    expect(shortcutFor(k('Delete'), true)).toBeNull();
    expect(shortcutFor(k('z', { ctrlKey: true }), true)).toBeNull();
  });
});
