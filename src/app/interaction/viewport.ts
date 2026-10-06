import type { GridPoint } from '../../types/geometry';
import type { Viewport } from '../model/editorTypes';

export const UNIT = 10;
export const BOARD_WIDTH = 640;
export const BOARD_HEIGHT = 190;
export const MIN_SCALE = 0.5;
export const MAX_SCALE = 8;
export const WHEEL_FACTOR = 1.15;

export interface ScreenPoint {
  x: number;
  y: number;
}

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** 讓整塊板子放進 width × height（留 5% 邊）並置中。 */
export function fitViewport(width: number, height: number): Viewport {
  const scale = clampScale(Math.min(width / BOARD_WIDTH, height / BOARD_HEIGHT) * 0.95);
  return { scale, tx: (width - BOARD_WIDTH * scale) / 2, ty: (height - BOARD_HEIGHT * scale) / 2 };
}

/** 以螢幕點 (sx, sy) 為中心縮放 factor 倍。 */
export function zoomAt(vp: Viewport, factor: number, sx: number, sy: number): Viewport {
  const scale = clampScale(vp.scale * factor);
  const k = scale / vp.scale;
  return { scale, tx: sx - (sx - vp.tx) * k, ty: sy - (sy - vp.ty) * k };
}

export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { ...vp, tx: vp.tx + dx, ty: vp.ty + dy };
}

/** 螢幕座標（相對於 SVG 左上角）→ 格子座標（小數）。 */
export function screenToLattice(vp: Viewport, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - vp.tx) / vp.scale / UNIT, y: (sy - vp.ty) / vp.scale / UNIT };
}

export function screenToGridPoint(vp: Viewport, sx: number, sy: number, boardId: string): GridPoint {
  const p = screenToLattice(vp, sx, sy);
  return { boardId, x: Math.round(p.x), y: Math.round(p.y) };
}

export function latticeToScreen(vp: Viewport, x: number, y: number): ScreenPoint {
  return { x: x * UNIT * vp.scale + vp.tx, y: y * UNIT * vp.scale + vp.ty };
}

/** 兩指手勢：依兩指距離的比例縮放，並跟著兩指中點平移。 */
export function pinchViewport(startVp: Viewport, start: [ScreenPoint, ScreenPoint], now: [ScreenPoint, ScreenPoint]): Viewport {
  const distance = (a: ScreenPoint, b: ScreenPoint) => Math.hypot(a.x - b.x, a.y - b.y) || 1;
  const middle = (a: ScreenPoint, b: ScreenPoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const m0 = middle(start[0], start[1]);
  const m1 = middle(now[0], now[1]);
  const zoomed = zoomAt(startVp, distance(now[0], now[1]) / distance(start[0], start[1]), m0.x, m0.y);
  return panBy(zoomed, m1.x - m0.x, m1.y - m0.y);
}
