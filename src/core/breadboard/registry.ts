import type { BoardLayout, Breadboard } from '../../types/board';
import { buildBoard } from './buildBoard';
import { MB102_LAYOUT } from './layouts';

const LAYOUTS: Record<string, BoardLayout> = { MB102: MB102_LAYOUT };
const cache = new Map<string, Breadboard>();

/** 回傳快取的板子模型。回傳值是共用物件，呼叫端不可修改。 */
export function getBoard(layoutId: string, boardId: string): Breadboard {
  const key = `${layoutId}/${boardId}`;
  let board = cache.get(key);
  if (!board) {
    const layout = LAYOUTS[layoutId];
    if (!layout) throw new Error(`Unknown board layout: ${layoutId}`);
    board = buildBoard(layout, boardId);
    cache.set(key, board);
  }
  return board;
}
