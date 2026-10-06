import type { Viewport } from '../model/editorTypes';
import { screenToLattice } from './viewport';

let element: SVGSVGElement | null = null;

/** 主畫面的板子 SVG（元件庫拖放時用來換算座標）。 */
export function registerBoardElement(el: SVGSVGElement | null): void {
  element = el;
}

export function getBoardElement(): SVGSVGElement | null {
  return element;
}

/** 螢幕座標 → 主畫面板子上的格子座標（小數）；不在板子範圍內時回傳 null。 */
export function clientToBoardLattice(clientX: number, clientY: number, viewport: Viewport): { x: number; y: number } | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
  return screenToLattice(viewport, clientX - rect.left, clientY - rect.top);
}
