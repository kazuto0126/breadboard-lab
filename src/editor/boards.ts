import { dropNoteTargets } from './notes';
import { buildLattice, MM_PER_UNIT, unitsFromMm } from '../core/breadboard/lattice';
import { getBoard } from '../core/breadboard/registry';
import { compareIds } from '../core/circuit/nets';
import type { BoardGroup, BreadboardInstance, LayoutId } from '../types/board';
import type { Circuit, Wire } from '../types/circuit';
import { PITCH } from './geometry';
import { nextBoardId } from './ids';

/**
 * 多塊麵包板的編輯邏輯（需求文件第三十八章）。座標一律以格（0.1 吋）為單位，
 * 板子在全域格子上的範圍 = 板面（格點範圍外加一圈留白），MB-102 是 65 × 20 格。
 * Board Group 完全由幾何推導：邊對邊貼合且對齊的板子就是同一組。
 */

/** 需求文件 38.3：吸附距離（螢幕像素）。換算成格數時除以目前的縮放，放大縮小時手感一致。 */
export const SNAP_DISTANCE = 24;
/** 一個電路最多幾塊麵包板。 */
export const MAX_BOARDS = 8;
/** 新增的板子放在所有板子下方，間隔幾格（不會自動吸附）。 */
export const NEW_BOARD_GAP = 4;
/** 「移出群組」後與其他板子至少保持的間隔（格）。 */
export const DETACH_GAP = 2;

/** 板子在全域格子上的範圍（格）。 */
export interface BoardRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

type Box = Omit<BoardRect, 'id'>;

/** 縮放 scale 時，吸附距離是幾格。 */
export function snapUnits(scale: number): number {
  return SNAP_DISTANCE / (scale * PITCH);
}

export function mmFromUnits(units: number): number {
  return Math.round(units * MM_PER_UNIT * 1000) / 1000 || 0;
}

export function boardRect(instance: BreadboardInstance): BoardRect {
  const board = getBoard(instance.layoutId, instance.id);
  return { id: instance.id, x: unitsFromMm(instance.x), y: unitsFromMm(instance.y), width: board.width + 2, height: board.height + 2 };
}

export function boardRects(circuit: Pick<Circuit, 'boards'>): BoardRect[] {
  return circuit.boards.map(boardRect);
}

/** 內部重疊（邊貼邊不算）。 */
export function rectsOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** 兩個矩形之間至少隔了 gap 格。 */
function separated(a: Box, b: Box, gap: number): boolean {
  return a.x + a.width + gap <= b.x || b.x + b.width + gap <= a.x || a.y + a.height + gap <= b.y || b.y + b.height + gap <= a.y;
}

function shift<T extends Box>(r: T, dx: number, dy: number): T {
  return { ...r, x: r.x + dx, y: r.y + dy };
}

const roundUnits = (v: number) => Math.round(v) || 0;

/** 由板子的位置推導出的 Board Group（至少兩塊板），依 ID 排序。ID 為 `g-` + 組內最小的板子 ID。 */
export function boardGroups(circuit: Pick<Circuit, 'boards'>): BoardGroup[] {
  const lattice = buildLattice(circuit.boards);
  const members = new Map<string, string[]>();
  for (const b of lattice.boards) {
    const root = lattice.groupOf.get(b.id)!;
    const list = members.get(root);
    if (list) list.push(b.id);
    else members.set(root, [b.id]);
  }
  const groups: BoardGroup[] = [];
  for (const [root, ids] of members) {
    if (ids.length < 2) continue;
    const boards = ids.map((id) => lattice.byId.get(id)!);
    const x = Math.min(...boards.map((b) => b.ox));
    const y = Math.min(...boards.map((b) => b.oy));
    const right = Math.max(...boards.map((b) => b.ox + b.width));
    const bottom = Math.max(...boards.map((b) => b.oy + b.height));
    groups.push({ id: `g-${root}`, boardIds: [...ids].sort(compareIds), x, y, width: right - x, height: bottom - y, rotation: 0 });
  }
  return groups.sort((a, b) => compareIds(a.id, b.id));
}

/** 和 boardId 同一組的所有板子（含自己；單獨一塊時只有自己）。找不到板子時回傳空陣列。 */
export function groupMembers(circuit: Pick<Circuit, 'boards'>, boardId: string): string[] {
  const lattice = buildLattice(circuit.boards);
  const root = lattice.groupOf.get(boardId);
  if (root === undefined) return [];
  return lattice.boards.filter((b) => lattice.groupOf.get(b.id) === root).map((b) => b.id);
}

/** 位置對齊格點，並依幾何重新寫入每塊板的 groupId。沒有變化時回傳原本的 circuit。 */
export function normalizeBoardGroups(circuit: Circuit): Circuit {
  const aligned = circuit.boards.map((b) => {
    const x = mmFromUnits(unitsFromMm(b.x));
    const y = mmFromUnits(unitsFromMm(b.y));
    return x === b.x && y === b.y ? b : { ...b, x, y };
  });
  const groupOf = new Map<string, string>();
  for (const g of boardGroups({ boards: aligned })) for (const id of g.boardIds) groupOf.set(id, g.id);
  const boards = aligned.map((b) => {
    const groupId = groupOf.get(b.id) ?? null;
    return b.groupId === groupId ? b : { ...b, groupId };
  });
  return boards.every((b, i) => b === circuit.boards[i]) ? circuit : { ...circuit, boards };
}

/** 連接 ids 裡的板子與其他板子的導線（拆開群組會把它們拉斷）。 */
export function crossBoardWires(circuit: Pick<Circuit, 'wires'>, ids: string[]): Wire[] {
  const set = new Set(ids);
  return circuit.wires.filter((w) => w.path.some((p) => set.has(p.boardId)) && w.path.some((p) => !set.has(p.boardId)));
}

export type SnapSide = 'top' | 'bottom' | 'left' | 'right';

export interface BoardSnap {
  movingId: string;
  targetId: string;
  /** 移動中的板子貼在目標板子的哪一邊。 */
  side: SnapSide;
}

/** 不能這樣移動的原因：和其他板子重疊，或會拉斷連到其他板子的導線。 */
export type BoardMoveProblem = 'overlap' | 'wires';

export interface BoardMovePlan {
  /** 實際的位移（格，整數）。 */
  dx: number;
  dy: number;
  snap: BoardSnap | null;
  blocked: BoardMoveProblem | null;
}

/** 把 ids 這幾塊板子移動 dx、dy 格（整數）會不會出問題。 */
export function boardMoveProblem(circuit: Pick<Circuit, 'boards' | 'wires'>, ids: string[], dx: number, dy: number): BoardMoveProblem | null {
  const set = new Set(ids);
  const rects = boardRects(circuit);
  const moving = rects.filter((r) => set.has(r.id));
  const others = rects.filter((r) => !set.has(r.id));
  if (moving.some((m) => others.some((o) => rectsOverlap(shift(m, dx, dy), o)))) return 'overlap';
  if ((dx !== 0 || dy !== 0) && crossBoardWires(circuit, ids).length > 0) return 'wires';
  return null;
}

/**
 * 拖曳 ids 這幾塊板子（位移 dx、dy 格，可為小數）時要放在哪裡。
 * 任一塊移動中的板子的邊與其他板子的邊距離 ≤ snapUnits、而且長邊重疊至少一半時，
 * 調整位移讓兩塊板完全貼齊並對齊（上下排 x 相同、左右排 y 相同）；有多個選擇時取最近、不會重疊的那個。
 */
export function snapBoardMove(circuit: Pick<Circuit, 'boards' | 'wires'>, ids: string[], dx: number, dy: number, snapUnits: number): BoardMovePlan {
  const set = new Set(ids);
  const rects = boardRects(circuit);
  const moving = rects.filter((r) => set.has(r.id));
  const others = rects.filter((r) => !set.has(r.id));
  const fits = (mx: number, my: number) => !moving.some((m) => others.some((o) => rectsOverlap(shift(m, mx, my), o)));
  const plan = (mx: number, my: number, snap: BoardSnap | null): BoardMovePlan => ({ dx: mx, dy: my, snap, blocked: boardMoveProblem(circuit, ids, mx, my) });

  const candidates: Array<{ dx: number; dy: number; distance: number; snap: BoardSnap }> = [];
  for (const m of moving) {
    const mx = m.x + dx;
    const my = m.y + dy;
    for (const o of others) {
      const targets: Array<[SnapSide, number, number]> = [];
      if (m.width === o.width && Math.abs(mx - o.x) <= o.width / 2) {
        targets.push(['bottom', o.x, o.y + o.height], ['top', o.x, o.y - m.height]);
      }
      if (m.height === o.height && Math.abs(my - o.y) <= o.height / 2) {
        targets.push(['right', o.x + o.width, o.y], ['left', o.x - m.width, o.y]);
      }
      for (const [side, tx, ty] of targets) {
        const gap = side === 'top' || side === 'bottom' ? Math.abs(my - ty) : Math.abs(mx - tx);
        if (gap > snapUnits) continue;
        const sdx = tx - m.x;
        const sdy = ty - m.y;
        candidates.push({ dx: sdx, dy: sdy, distance: Math.hypot(sdx - dx, sdy - dy), snap: { movingId: m.id, targetId: o.id, side } });
      }
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);
  for (const c of candidates) if (fits(c.dx, c.dy)) return plan(c.dx, c.dy, c.snap);
  return plan(roundUnits(dx), roundUnits(dy), null);
}

/** 把 ids 這幾塊板子移動 dx、dy 格。元件與導線用板內座標記錄，會跟著板子一起移動。 */
export function moveBoards(circuit: Circuit, ids: string[], dx: number, dy: number): Circuit {
  const mx = roundUnits(dx);
  const my = roundUnits(dy);
  const set = new Set(ids);
  if ((mx === 0 && my === 0) || !circuit.boards.some((b) => set.has(b.id))) return circuit;
  const boards = circuit.boards.map((b) =>
    set.has(b.id) ? { ...b, x: mmFromUnits(unitsFromMm(b.x) + mx), y: mmFromUnits(unitsFromMm(b.y) + my) } : b,
  );
  return normalizeBoardGroups({ ...circuit, boards });
}

/** 新增一塊麵包板（預設 MB-102），放在所有板子下方（左邊對齊、間隔 NEW_BOARD_GAP 格）。已達上限時回傳 null。 */
export function addBoard(circuit: Circuit, layoutId: LayoutId = 'MB102'): { circuit: Circuit; id: string } | null {
  if (circuit.boards.length >= MAX_BOARDS) return null;
  const id = nextBoardId(circuit);
  const rects = boardRects(circuit);
  const x = rects.length > 0 ? Math.min(...rects.map((r) => r.x)) : 0;
  const y = rects.length > 0 ? Math.max(...rects.map((r) => r.y + r.height)) + NEW_BOARD_GAP : 0;
  const instance: BreadboardInstance = { id, layoutId, x: mmFromUnits(x), y: mmFromUnits(y), groupId: null };
  return { circuit: normalizeBoardGroups({ ...circuit, boards: [...circuit.boards, instance] }), id };
}

/** 刪除一塊板，連同板上的元件與碰到這塊板的導線。最後一塊板不能刪（回傳 null）。 */
export function removeBoard(circuit: Circuit, id: string): Circuit | null {
  if (circuit.boards.length <= 1 || !circuit.boards.some((b) => b.id === id)) return null;
  const touches = (w: Wire) => w.start.boardId === id || w.end.boardId === id || w.path.some((p) => p.boardId === id);
  const components = circuit.components.filter((c) => c.boardId !== id);
  const wires = circuit.wires.filter((w) => !touches(w));
  // 子專案 29：指向這塊板上的元件或孔的便條拿掉指向。
  const notes = dropNoteTargets(circuit.notes, new Set(circuit.components.filter((c) => c.boardId === id).map((c) => c.id)), id);
  return normalizeBoardGroups({
    ...circuit,
    boards: circuit.boards.filter((b) => b.id !== id),
    components: components.length === circuit.components.length ? circuit.components : components,
    wires: wires.length === circuit.wires.length ? circuit.wires : wires,
    ...(notes ? { notes } : {}),
  });
}

/**
 * 「移出群組」：把板子往下、右、上、左其中一個方向移到最近、與所有板子至少隔 DETACH_GAP 格的位置。
 * 板子不在群組裡，或有導線連到群組其他板子時回傳 null（要先刪除那些導線）。
 */
export function detachBoard(circuit: Circuit, id: string): Circuit | null {
  if (groupMembers(circuit, id).length < 2 || crossBoardWires(circuit, [id]).length > 0) return null;
  const rects = boardRects(circuit);
  const me = rects.find((r) => r.id === id)!;
  const others = rects.filter((r) => r.id !== id);
  const clear = (dx: number, dy: number) => others.every((o) => separated(shift(me, dx, dy), o, DETACH_GAP));
  // 往下移到這個距離一定會離開所有板子，所以迴圈一定會找到位置。
  const limit = Math.max(1, Math.max(...others.map((o) => o.y + o.height)) + DETACH_GAP - me.y);
  const directions: Array<[number, number]> = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ];
  for (let d = 1; d <= limit; d++) {
    for (const [ux, uy] of directions) if (clear(ux * d, uy * d)) return moveBoards(circuit, [id], ux * d, uy * d);
  }
  return null;
}
