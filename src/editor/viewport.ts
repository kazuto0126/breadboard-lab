import type { Point, Rect } from './geometry';

/** 螢幕座標 = 世界座標 × scale + (x, y)。 */
export interface Viewport {
  scale: number;
  x: number;
  y: number;
}

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 8;
export const DEFAULT_VIEWPORT: Viewport = { scale: 1, x: 40, y: 40 };

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function screenToWorld(v: Viewport, sx: number, sy: number): Point {
  return { x: (sx - v.x) / v.scale, y: (sy - v.y) / v.scale };
}

export function worldToScreen(v: Viewport, wx: number, wy: number): Point {
  return { x: wx * v.scale + v.x, y: wy * v.scale + v.y };
}

/** 以螢幕上的 (sx, sy) 為中心縮放：該點底下的世界座標保持不動。 */
export function zoomAt(v: Viewport, factor: number, sx: number, sy: number): Viewport {
  const scale = clampScale(v.scale * factor);
  const world = screenToWorld(v, sx, sy);
  return { scale, x: sx - world.x * scale, y: sy - world.y * scale };
}

export function panBy(v: Viewport, dx: number, dy: number): Viewport {
  return { ...v, x: v.x + dx, y: v.y + dy };
}

/** 讓 rect 置中並剛好放進 width × height 的畫面（四周留 margin 像素）。 */
export function fitRect(rect: Rect, width: number, height: number, margin = 32): Viewport {
  const availableW = Math.max(1, width - 2 * margin);
  const availableH = Math.max(1, height - 2 * margin);
  const scale = clampScale(Math.min(availableW / rect.width, availableH / rect.height));
  return {
    scale,
    x: (width - rect.width * scale) / 2 - rect.x * scale,
    y: (height - rect.height * scale) / 2 - rect.y * scale,
  };
}

/** 把 rect 移到畫面中央，不改變縮放。 */
export function centerOn(v: Viewport, rect: Rect, width: number, height: number): Viewport {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return { scale: v.scale, x: width / 2 - cx * v.scale, y: height / 2 - cy * v.scale };
}
