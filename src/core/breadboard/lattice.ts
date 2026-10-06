import type { Breadboard, BreadboardInstance } from '../../types/board';
import type { Direction, GridPoint } from '../../types/geometry';
import { getNode } from './naming';
import { getBoard } from './registry';

/** 1 格 = 0.1 吋。板子位置以 mm 記錄，換算成格數後四捨五入，所有板子共用同一張全域格子。 */
export const MM_PER_UNIT = 2.54;

export interface LatticeBoard {
  id: string;
  board: Breadboard;
  /** 板內格點 (0, 0) 在全域格子中的座標。 */
  ox: number;
  oy: number;
  /** 板面大小（格）：格點範圍外加一圈留白，板內座標 x ∈ [0, width − 1]、y ∈ [0, height − 1]。 */
  width: number;
  height: number;
}

export interface Lattice {
  boards: LatticeBoard[];
  byId: Map<string, LatticeBoard>;
  /** 板子 → 所屬群組 ID（互相貼合且對齊的板子為一組；ID 取組內排序最小的板子 ID）。 */
  groupOf: Map<string, string>;
}

export function unitsFromMm(mm: number): number {
  const u = Math.round(mm / MM_PER_UNIT);
  return u === 0 ? 0 : u;
}

/** 兩塊板是否「邊對邊貼合且完全對齊」：上下排 x 相同、左右排 y 相同。 */
export function alignedAdjacent(a: Omit<LatticeBoard, 'board' | 'id'>, b: Omit<LatticeBoard, 'board' | 'id'>): 'vertical' | 'horizontal' | null {
  if (a.ox === b.ox && a.width === b.width && (a.oy + a.height === b.oy || b.oy + b.height === a.oy)) return 'vertical';
  if (a.oy === b.oy && a.height === b.height && (a.ox + a.width === b.ox || b.ox + b.width === a.ox)) return 'horizontal';
  return null;
}

const cache = new WeakMap<BreadboardInstance[], Lattice>();

export function buildLattice(instances: BreadboardInstance[]): Lattice {
  const cached = cache.get(instances);
  if (cached) return cached;
  const boards = instances.map((inst): LatticeBoard => {
    const board = getBoard(inst.layoutId, inst.id);
    return { id: inst.id, board, ox: unitsFromMm(inst.x), oy: unitsFromMm(inst.y), width: board.width + 2, height: board.height + 2 };
  });
  const parent = new Map(boards.map((b) => [b.id, b.id]));
  const find = (x: string): string => {
    const p = parent.get(x)!;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  for (let i = 0; i < boards.length; i++) {
    for (let j = i + 1; j < boards.length; j++) {
      if (!alignedAdjacent(boards[i], boards[j])) continue;
      const a = find(boards[i].id);
      const b = find(boards[j].id);
      if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
    }
  }
  const groupOf = new Map(boards.map((b) => [b.id, find(b.id)]));
  const lattice: Lattice = { boards, byId: new Map(boards.map((b) => [b.id, b])), groupOf };
  cache.set(instances, lattice);
  return lattice;
}

/** 格點的全域座標；板子不存在時回傳 null。 */
export function latticeOf(lattice: Lattice, p: GridPoint): { x: number; y: number } | null {
  const b = lattice.byId.get(p.boardId);
  return b ? { x: b.ox + p.x, y: b.oy + p.y } : null;
}

/** 全域座標落在哪一塊板的板面上（板子互不重疊，所以最多一塊）。 */
export function boardAt(lattice: Lattice, x: number, y: number): LatticeBoard | null {
  for (const b of lattice.boards) {
    if (x >= b.ox && y >= b.oy && x < b.ox + b.width && y < b.oy + b.height) return b;
  }
  return null;
}

/** 全域座標 → 正規格點（以板面所在的那塊板表示）。不在任何板面上時回傳 null。 */
export function pointAt(lattice: Lattice, x: number, y: number): GridPoint | null {
  const b = boardAt(lattice, x, y);
  return b ? { boardId: b.id, x: x - b.ox, y: y - b.oy } : null;
}

/** 格點是否在自己那塊板的板面範圍內（含留白）。 */
export function isSurfacePoint(lattice: Lattice, p: GridPoint): boolean {
  const b = lattice.byId.get(p.boardId);
  return !!b && p.x >= 0 && p.y >= 0 && p.x < b.width && p.y < b.height;
}

export function isNodePoint(lattice: Lattice, p: GridPoint): boolean {
  const b = lattice.byId.get(p.boardId);
  return !!b && getNode(b.board, p.x, p.y) !== undefined;
}

const DIRS: Array<[Direction, number, number]> = [
  ['N', 0, -1],
  ['E', 1, 0],
  ['S', 0, 1],
  ['W', -1, 0],
];

/** 接縫：留白中、緊鄰同一群組另一塊板的格子。導線可以經過它跨到隔壁的板子。 */
export function isSeamPoint(lattice: Lattice, p: GridPoint): boolean {
  if (!isSurfacePoint(lattice, p) || isNodePoint(lattice, p)) return false;
  const own = lattice.byId.get(p.boardId)!;
  const group = lattice.groupOf.get(own.id);
  const at = latticeOf(lattice, p)!;
  return DIRS.some(([, dx, dy]) => {
    const other = boardAt(lattice, at.x + dx, at.y + dy);
    return other !== null && other.id !== own.id && lattice.groupOf.get(other.id) === group;
  });
}

/** 導線可以經過的格點：板上的格點（孔或板面），或同群組兩板之間的接縫。 */
export function isRoutablePoint(lattice: Lattice, p: GridPoint): boolean {
  return isNodePoint(lattice, p) || isSeamPoint(lattice, p);
}

/** 兩點相鄰時的方向（可以跨板）；不相鄰回傳 null。 */
export function latticeStep(lattice: Lattice, a: GridPoint, b: GridPoint): Direction | null {
  const pa = latticeOf(lattice, a);
  const pb = latticeOf(lattice, b);
  if (!pa || !pb) return null;
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  for (const [dir, ex, ey] of DIRS) if (dx === ex && dy === ey) return dir;
  return null;
}

/** 一個群組的佈線格子。外框只包住可以走線的格子，所以單塊板的索引與以前相同（x 1–63、y 1–18）。 */
export interface LatticeCanvas {
  groupId: string;
  boardIds: string[];
  originX: number;
  originY: number;
  width: number;
  height: number;
  size: number;
  /** 每一格的正規格點（不在板面上為 null）。 */
  points: Array<GridPoint | null>;
  /** 1 = 可以走線（板上的格點或接縫）。 */
  routable: Uint8Array;
}

export function canvasIndex(canvas: LatticeCanvas, lattice: Lattice, p: GridPoint): number {
  const at = latticeOf(lattice, p);
  if (!at) return -1;
  const x = at.x - canvas.originX;
  const y = at.y - canvas.originY;
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return -1;
  return y * canvas.width + x;
}

export function buildCanvas(lattice: Lattice, groupId: string): LatticeCanvas {
  const members = lattice.boards.filter((b) => lattice.groupOf.get(b.id) === groupId);
  const cells: Array<{ x: number; y: number }> = [];
  for (const b of members) {
    for (let y = 0; y < b.height; y++) {
      for (let x = 0; x < b.width; x++) {
        const p = { boardId: b.id, x, y };
        if (isRoutablePoint(lattice, p)) cells.push({ x: b.ox + x, y: b.oy + y });
      }
    }
  }
  const originX = cells.length > 0 ? Math.min(...cells.map((c) => c.x)) : 0;
  const originY = cells.length > 0 ? Math.min(...cells.map((c) => c.y)) : 0;
  const width = cells.length > 0 ? Math.max(...cells.map((c) => c.x)) - originX + 1 : 0;
  const height = cells.length > 0 ? Math.max(...cells.map((c) => c.y)) - originY + 1 : 0;
  const size = width * height;
  const points: Array<GridPoint | null> = new Array(size).fill(null);
  const routable = new Uint8Array(size);
  for (let i = 0; i < size; i++) points[i] = pointAt(lattice, originX + (i % width), originY + Math.floor(i / width));
  for (const c of cells) routable[(c.y - originY) * width + (c.x - originX)] = 1;
  return { groupId, boardIds: members.map((b) => b.id).sort(), originX, originY, width, height, size, points, routable };
}

/** 所有群組 ID（排序後）。 */
export function latticeGroups(lattice: Lattice): string[] {
  return [...new Set(lattice.groupOf.values())].sort();
}
