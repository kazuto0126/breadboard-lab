import { parseHoleName } from '../../src/core/breadboard/naming';
import { getBoard } from '../../src/core/breadboard/registry';
import type { Circuit, Wire } from '../../src/types/circuit';
import type { ComponentInstance, ComponentProps, Rotation } from '../../src/types/component';
import type { GridPoint } from '../../src/types/geometry';

export const BOARD_ID = 'b1';
const board = getBoard('MB102', BOARD_ID);

/** 孔位名稱（例如 "E12"、"T+5"）或格子座標 [x, y]。 */
export type Where = string | [number, number];

export function hole(name: string): GridPoint {
  const p = parseHoleName(board, name);
  if (!p) throw new Error(`Unknown hole ${name}`);
  return p;
}

export function pt(x: number, y: number): GridPoint {
  return { boardId: BOARD_ID, x, y };
}

function toPoint(where: Where): GridPoint {
  return typeof where === 'string' ? hole(where) : pt(where[0], where[1]);
}

export function comp(
  id: string,
  defId: string,
  anchor: Where,
  opts: { rotation?: Rotation; span?: number; props?: ComponentProps } = {},
): ComponentInstance {
  const p = toPoint(anchor);
  const instance: ComponentInstance = {
    id,
    defId,
    boardId: BOARD_ID,
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

export function circuit(components: ComponentInstance[], wires: Wire[] = []): Circuit {
  return { version: 1, boards: [{ id: BOARD_ID, layoutId: 'MB102', x: 0, y: 0, groupId: null }], components, wires };
}
