import { countBends } from '../../core/circuit/wireGeometry';
import type { Wire } from '../../types/circuit';
import type { GridPoint } from '../../types/geometry';

/** L 形路徑：horizontalFirst 為 true 時先水平再垂直。起終點同列或同欄時是直線。 */
export function lPath(start: GridPoint, end: GridPoint, horizontalFirst: boolean): GridPoint[] {
  const out: GridPoint[] = [start];
  let { x, y } = start;
  const stepX = () => {
    while (x !== end.x) {
      x += Math.sign(end.x - x);
      out.push({ boardId: start.boardId, x, y });
    }
  };
  const stepY = () => {
    while (y !== end.y) {
      y += Math.sign(end.y - y);
      out.push({ boardId: start.boardId, x, y });
    }
  };
  if (horizontalFirst) {
    stepX();
    stepY();
  } else {
    stepY();
    stepX();
  }
  return out;
}

/** 只有恰好一個轉角的導線可以翻轉，回傳另一個方向的 L 形；直線或多轉角的導線回傳 null。 */
export function flippedPath(wire: Wire): GridPoint[] | null {
  if (wire.path.length < 3 || countBends(wire.path) !== 1) return null;
  const horizontalFirst = wire.path[1].y === wire.path[0].y;
  return lPath(wire.start, wire.end, !horizontalFirst);
}
