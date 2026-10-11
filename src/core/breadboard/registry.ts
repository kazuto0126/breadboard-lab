import type { BoardLayout, Breadboard } from '../../types/board';
import { buildBoard } from './buildBoard';
import { EIC1106_LAYOUT, MB102_LAYOUT } from './layouts';

const LAYOUTS: Record<string, BoardLayout> = { MB102: MB102_LAYOUT, EIC1106: EIC1106_LAYOUT };

export function getLayout(layoutId: string): BoardLayout {
  const layout = LAYOUTS[layoutId];
  if (!layout) throw new Error(`Unknown board layout: ${layoutId}`);
  return layout;
}
const cache = new Map<string, Breadboard>();

/** 回傳快取的板子模型。回傳值是共用物件，呼叫端不可修改。 */
export function getBoard(layoutId: string, boardId: string): Breadboard {
  const key = `${layoutId}/${boardId}`;
  let board = cache.get(key);
  if (!board) {
    board = buildBoard(getLayout(layoutId), boardId);
    cache.set(key, board);
  }
  return board;
}
