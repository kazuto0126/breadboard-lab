import { buildLattice, latticeOf, MM_PER_UNIT, pointAt } from '../core/breadboard/lattice';
import { parseHoleName } from '../core/breadboard/naming';
import { getBoard } from '../core/breadboard/registry';
import type { BreadboardInstance } from '../types/board';
import type { Circuit, Wire } from '../types/circuit';
import type { ComponentInstance, ComponentProps, Rotation } from '../types/component';
import type { GridPoint } from '../types/geometry';

export const BOARD_ID = 'b1';
const referenceBoard = getBoard('MB102', BOARD_ID);

/** 孔位名稱（例如 "E12"、"T+5"）、格子座標 [x, y]，或任何板子上的格點。 */
export type Where = string | [number, number] | GridPoint;

export function hole(name: string): GridPoint {
  const p = parseHoleName(referenceBoard, name);
  if (!p) throw new Error(`Unknown hole ${name}`);
  return p;
}

export function pt(x: number, y: number): GridPoint {
  return { boardId: BOARD_ID, x, y };
}

function toPoint(where: Where): GridPoint {
  if (typeof where === 'string') return hole(where);
  return Array.isArray(where) ? pt(where[0], where[1]) : { boardId: where.boardId, x: where.x, y: where.y };
}

export function comp(
  id: string,
  defId: string,
  anchor: Where,
  opts: { rotation?: Rotation; span?: number; props?: ComponentProps; board?: string } = {},
): ComponentInstance {
  const p = toPoint(anchor);
  const instance: ComponentInstance = {
    id,
    defId,
    boardId: opts.board ?? BOARD_ID,
    anchor: { x: p.x, y: p.y },
    rotation: opts.rotation ?? 0,
    props: opts.props ?? {},
  };
  if (opts.span !== undefined) instance.span = opts.span;
  return instance;
}

/** 從 a 走到 b：先水平再垂直。 */
function run(a: GridPoint, b: GridPoint): GridPoint[] {
  const out: GridPoint[] = [a];
  let { x, y } = a;
  while (x !== b.x) {
    x += Math.sign(b.x - x);
    out.push(pt(x, y));
  }
  while (y !== b.y) {
    y += Math.sign(b.y - y);
    out.push(pt(x, y));
  }
  return out;
}

/** 依序經過每個點的手動導線；相鄰兩點之間先水平再垂直。 */
export function wire(id: string, ...points: Where[]): Wire {
  const pts = points.map(toPoint);
  const path: GridPoint[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) path.push(...run(pts[i - 1], pts[i]).slice(1));
  return { id, color: '#888888', source: 'manual', start: pts[0], end: pts[pts.length - 1], path };
}

/** 兩孔之間的一條直線導線（可以斜）。 */
export function straightWire(id: string, from: Where, to: Where): Wire {
  const start = toPoint(from);
  const end = toPoint(to);
  return { id, color: '#888888', source: 'manual', straight: true, start, end, path: [{ ...start }, { ...end }] };
}

export function circuit(components: ComponentInstance[], wires: Wire[] = [], boards?: BreadboardInstance[]): Circuit {
  return { version: 1, boards: boards ?? [board(BOARD_ID)], components, wires };
}

/** 一塊 MB-102，位置以格（0.1 吋）為單位。上下貼合時下面那塊 y = 20，左右貼合時右邊那塊 x = 65。 */
export function board(id: string, unitsX = 0, unitsY = 0): BreadboardInstance {
  return { id, layoutId: 'MB102', x: unitsX * MM_PER_UNIT, y: unitsY * MM_PER_UNIT, groupId: null };
}

/** 指定板子上的孔（所有板子同一種版型）。 */
export function holeOn(boardId: string, name: string): GridPoint {
  return { ...hole(name), boardId };
}

/** 依序經過每個點、在全域格子上先水平再垂直走的導線，可以跨過同群組兩塊板之間的接縫。 */
export function latticeWire(boards: BreadboardInstance[], id: string, ...points: GridPoint[]): Wire {
  const lattice = buildLattice(boards);
  const cells = points.map((p) => {
    const at = latticeOf(lattice, p);
    if (!at) throw new Error(`Unknown board ${p.boardId}`);
    return at;
  });
  const out: GridPoint[] = [];
  const push = (x: number, y: number) => {
    const p = pointAt(lattice, x, y);
    if (!p) throw new Error(`(${x}, ${y}) is not on any breadboard`);
    out.push(p);
  };
  push(cells[0].x, cells[0].y);
  for (let i = 1; i < cells.length; i++) {
    let { x, y } = cells[i - 1];
    while (x !== cells[i].x) push((x += Math.sign(cells[i].x - x)), y);
    while (y !== cells[i].y) push(x, (y += Math.sign(cells[i].y - y)));
  }
  return { id, color: '#888888', source: 'manual', start: out[0], end: out[out.length - 1], path: out };
}
