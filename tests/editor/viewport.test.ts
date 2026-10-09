import { describe, expect, it } from 'vitest';
import { boardFrames, fromWorld, gridBounds, localPx, PITCH, toWorld, worldBounds } from '../../src/editor/geometry';
import { clampScale, fitRect, MAX_SCALE, MIN_SCALE, panBy, pinchViewport, screenToWorld, worldToScreen, zoomAt } from '../../src/editor/viewport';
import { circuit, pt } from '../fixtures/build';

describe('board geometry', () => {
  const frames = boardFrames(circuit([]));

  it('places grid points on a 0.1-inch pitch inside a padded board', () => {
    expect(frames).toHaveLength(1);
    expect(frames[0].width).toBe(65 * PITCH);
    expect(frames[0].height).toBe(20 * PITCH);
    expect(localPx(1, 1)).toEqual({ x: 1.5 * PITCH, y: 1.5 * PITCH });
    expect(toWorld(frames, pt(2, 1))!.x - toWorld(frames, pt(1, 1))!.x).toBe(PITCH);
    expect(toWorld(frames, { boardId: 'nope', x: 1, y: 1 })).toBeNull();
  });

  it('maps world coordinates back to the nearest grid point', () => {
    const w = toWorld(frames, pt(12, 4))!;
    expect(fromWorld(frames, w.x + 4, w.y - 6)).toMatchObject({ boardId: 'b1', x: 12, y: 4 });
    const hit = fromWorld(frames, w.x + PITCH / 2, w.y)!;
    expect(hit.fx).toBeCloseTo(12.5);
    expect(fromWorld(frames, -5, -5)).toBeNull();
    // 板邊的留白也算在板上，對應到留白格（x = 0、y = 0），不是孔。
    expect(fromWorld(frames, 1, 1)).toMatchObject({ x: 0, y: 0 });
  });

  it('computes bounds', () => {
    expect(worldBounds(frames)).toEqual({ x: 0, y: 0, width: 65 * PITCH, height: 20 * PITCH });
    expect(worldBounds([])).toBeNull();
    const b = gridBounds(frames, [pt(1, 1), pt(3, 2)], 0.5)!;
    expect(b.width).toBe(3 * PITCH);
    expect(b.height).toBe(2 * PITCH);
  });
});

describe('viewport', () => {
  it('converts between screen and world coordinates', () => {
    const v = { scale: 2, x: 10, y: 20 };
    expect(worldToScreen(v, 5, 5)).toEqual({ x: 20, y: 30 });
    expect(screenToWorld(v, 20, 30)).toEqual({ x: 5, y: 5 });
    expect(panBy(v, 3, -4)).toEqual({ scale: 2, x: 13, y: 16 });
  });

  it('zooms around the cursor and clamps the scale', () => {
    const v = { scale: 1, x: 0, y: 0 };
    const z = zoomAt(v, 2, 100, 50);
    expect(z.scale).toBe(2);
    expect(screenToWorld(z, 100, 50)).toEqual({ x: 100, y: 50 });
    expect(zoomAt(v, 1000, 0, 0).scale).toBe(MAX_SCALE);
    expect(zoomAt(v, 0.0001, 0, 0).scale).toBe(MIN_SCALE);
    expect(clampScale(1.5)).toBe(1.5);
  });

  it('fits a rectangle into the screen, centred', () => {
    const v = fitRect({ x: 0, y: 0, width: 1300, height: 380 }, 1000, 600, 50);
    expect(v.scale).toBeCloseTo(900 / 1300);
    const centre = worldToScreen(v, 650, 190);
    expect(centre.x).toBeCloseTo(500);
    expect(centre.y).toBeCloseTo(300);
  });
});

describe('pinch zoom', () => {
  const start = { scale: 1, x: 10, y: 20 };

  it('zooms by the ratio of finger distances around their midpoint', () => {
    const v = pinchViewport(start, { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 50, y: 100 }, { x: 250, y: 100 });
    expect(v.scale).toBe(2);
    // 兩指中點 (150, 100) 底下的世界座標不動。
    const before = screenToWorld(start, 150, 100);
    const after = worldToScreen(v, before.x, before.y);
    expect(after.x).toBeCloseTo(150);
    expect(after.y).toBeCloseTo(100);
  });

  it('pans with the midpoint when the fingers move together, and clamps the zoom', () => {
    const moved = pinchViewport(start, { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 30, y: 40 }, { x: 130, y: 40 });
    expect(moved).toEqual({ scale: 1, x: 40, y: 60 });
    expect(pinchViewport(start, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, { x: 1000, y: 0 }).scale).toBe(MAX_SCALE);
    expect(pinchViewport(start, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 5 }, { x: 5, y: 5 }).scale).toBe(1);
  });
});
