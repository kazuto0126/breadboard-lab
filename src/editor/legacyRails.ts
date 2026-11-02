import { EIC1106_LAYOUT } from '../core/breadboard/layouts';
import { effectiveSpan, resolveFootprint } from '../core/circuit/footprint';
import { getComponentDefinition } from '../core/circuit/library';
import type { Circuit, Wire } from '../types/circuit';
import type { ComponentInstance } from '../types/component';
import type { GridPoint } from '../types/geometry';

/**
 * 子專案 57：EIC-1106 的電源軌以前每對都是 + 在上、− 在下，現在改成 − 在上、+ 在下。
 * 舊檔（檔案版本 1）打開時，把插在電源軌上的導線端點、元件腳、便條指的孔換到同極性的那一排，舊電路照樣能用。
 */
const SWAP: Map<number, number> = (() => {
  const yOf = new Map<string, number>(EIC1106_LAYOUT.rows.flatMap((r) => (r.kind === 'rail' ? [[r.label, r.y] as const] : [])));
  const swap = new Map<number, number>();
  for (const [label, y] of yOf) {
    const partner = yOf.get(label.endsWith('+') ? `${label.slice(0, -1)}-` : `${label.slice(0, -1)}+`);
    if (partner !== undefined) swap.set(y, partner);
  }
  return swap;
})();

const moved = (p: GridPoint, eic: Set<string>): GridPoint => (eic.has(p.boardId) && SWAP.has(p.y) ? { ...p, y: SWAP.get(p.y)! } : p);
const same = (a: GridPoint, b: GridPoint) => a.boardId === b.boardId && a.x === b.x && a.y === b.y;

/** 去掉直線中間的點（只留端點與轉角），換排時線才不會在兩排軌之間來回；換完再用 steps 補回每一格。 */
function corners(path: GridPoint[]): GridPoint[] {
  return path.filter((p, i) => {
    if (i === 0 || i === path.length - 1) return true;
    const a = path[i - 1];
    const b = path[i + 1];
    return !(a.boardId === p.boardId && b.boardId === p.boardId && ((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y)));
  });
}

/** 相鄰兩個轉角之間一格一格補齊（同一塊板、水平或垂直）。 */
function steps(points: GridPoint[]): GridPoint[] {
  const out: GridPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.boardId !== b.boardId || (a.x !== b.x && a.y !== b.y)) {
      out.push(b);
      continue;
    }
    let { x, y } = a;
    while (x !== b.x || y !== b.y) {
      x += Math.sign(b.x - x);
      y += Math.sign(b.y - y);
      out.push({ boardId: a.boardId, x, y });
    }
  }
  return out;
}

function migrateWire(w: Wire, eic: Set<string>): Wire {
  const touches = [w.start, w.end, ...w.path].some((p) => !same(p, moved(p, eic)));
  if (!touches) return w;
  const turned = corners(w.path).map((p) => moved(p, eic));
  return { ...w, start: moved(w.start, eic), end: moved(w.end, eic), path: w.straight ? turned : steps(turned) };
}

/** 元件：找一個腳剛好落在換排後位置的擺法（同方向，anchor 挪一格以內、2 腳元件長度差一格以內）；找不到就不動。 */
function migrateComponent(c: ComponentInstance, eic: Set<string>): ComponentInstance {
  const def = getComponentDefinition(c.defId);
  if (!def || !eic.has(c.boardId)) return c;
  const pinsOf = (x: ComponentInstance) => resolveFootprint(x, def).pins.map((p) => p.point);
  const before = pinsOf(c);
  const want = before.map((p) => moved(p, eic));
  if (want.every((p, i) => same(p, before[i]))) return c;
  const span = effectiveSpan(c, def);
  const pkg = def.package;
  const spans = pkg.type === 'two-lead' ? [span, span - 1, span + 1].filter((s) => s >= pkg.minSpan) : [span];
  for (const s of spans) {
    for (const dy of [0, -1, 1]) {
      for (const dx of [0, -1, 1]) {
        const t: ComponentInstance = { ...c, anchor: { x: c.anchor.x + dx, y: c.anchor.y + dy } };
        if (s !== span) t.span = s;
        if (pinsOf(t).every((p, i) => same(p, want[i]))) return t;
      }
    }
  }
  return c;
}

export function migrateEicRails(circuit: Circuit): Circuit {
  const eic = new Set(circuit.boards.filter((b) => b.layoutId === 'EIC1106').map((b) => b.id));
  if (eic.size === 0) return circuit;
  const notes = circuit.notes?.map((n) => (n.targetHole ? { ...n, targetHole: moved(n.targetHole, eic) } : n));
  return {
    ...circuit,
    components: circuit.components.map((c) => migrateComponent(c, eic)),
    wires: circuit.wires.map((w) => migrateWire(w, eic)),
    ...(notes ? { notes } : {}),
  };
}
