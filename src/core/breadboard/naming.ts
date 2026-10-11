import type { Breadboard, BreadboardNode } from '../../types/board';
import type { GridPoint } from '../../types/geometry';

export function nodeIdOf(p: GridPoint): string {
  return `${p.boardId}:${p.x},${p.y}`;
}

export function parseNodeId(id: string): GridPoint {
  const colon = id.lastIndexOf(':');
  const [x, y] = id.slice(colon + 1).split(',').map(Number);
  return { boardId: id.slice(0, colon), x, y };
}

export function getNode(board: Breadboard, x: number, y: number): BreadboardNode | undefined {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
  if (x < 1 || y < 1 || x > board.width || y > board.height) return undefined;
  return board.nodes[(y - 1) * board.width + (x - 1)];
}

export function holeName(board: Breadboard, p: GridPoint): string | null {
  if (p.boardId !== board.id) return null;
  return getNode(board, p.x, p.y)?.name ?? null;
}

const LABEL_PATTERN = /^(T\+|T-|B\+|B-|P[1-5][+-]|[1-3]-[A-J]|[A-J])(\d+)$/;

/** 接受 "A12"、"b1:A12"、小寫 "a12"、全形減號 "B−30"。 */
export function parseHoleName(board: Breadboard, raw: string): GridPoint | null {
  const text = raw.trim().replace(/[−–]/g, '-');
  const colon = text.lastIndexOf(':');
  if (colon >= 0 && text.slice(0, colon) !== board.id) return null;
  const local = text.slice(colon + 1);
  // 接線柱（紅、黑…）沒有欄號，名稱完全相同就是它。
  const exact = board.nodes.find((n) => n.name !== null && n.name === local);
  if (exact) return { boardId: board.id, x: exact.x, y: exact.y };
  const match = LABEL_PATTERN.exec(local.toUpperCase());
  if (!match) return null;
  const name = `${match[1]}${Number(match[2])}`;
  const node = board.nodes.find((n) => n.name === name);
  return node ? { boardId: board.id, x: node.x, y: node.y } : null;
}
