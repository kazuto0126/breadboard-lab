import { latticeOf, latticeStep, pointAt, type Lattice } from '../breadboard/lattice';
import { nodeIdOf } from '../breadboard/naming';
import type { Wire } from '../../types/circuit';
import type { Direction, GridPoint } from '../../types/geometry';

/** 相鄰兩點的方向。不同板子的兩點需要 lattice 才能判斷（同一群組的跨板導線）。 */
export function stepDirection(a: GridPoint, b: GridPoint, lattice?: Lattice): Direction | null {
  if (a.boardId !== b.boardId) return lattice ? latticeStep(lattice, a, b) : null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 1 && dy === 0) return 'E';
  if (dx === -1 && dy === 0) return 'W';
  if (dx === 0 && dy === 1) return 'S';
  if (dx === 0 && dy === -1) return 'N';
  return null;
}

export type PathIssue = 'TOO_SHORT' | 'NOT_ORTHOGONAL_STEP' | 'ENDPOINT_MISMATCH' | 'SELF_INTERSECT' | 'OUT_OF_BOARD' | 'NOT_SAME_GROUP';

/** 「經過」一個孔：線段穿過以孔為中心、半邊長 0.45 格的正方形（斜線從兩孔正中間的對角穿過時不算）。 */
export const HOLE_HALF = 0.45;

export interface LPoint {
  x: number;
  y: number;
}

export interface Segment {
  a: LPoint;
  b: LPoint;
}

export function isStraight(wire: Wire): boolean {
  return wire.straight === true;
}

/** 格點的全域座標；沒有 lattice（或板子不存在）時用板內座標。 */
function at(p: GridPoint, lattice?: Lattice): LPoint {
  return (lattice && latticeOf(lattice, p)) || { x: p.x, y: p.y };
}

/** 導線的直線段（全域座標）：直線導線一段；路徑導線把同方向的連續格點合成一段。 */
export function wireSegments(wire: Wire, lattice?: Lattice): Segment[] {
  if (isStraight(wire)) return [{ a: at(wire.start, lattice), b: at(wire.end, lattice) }];
  const pts = wire.path.map((p) => at(p, lattice));
  const out: Segment[] = [];
  let from = 0;
  for (let i = 1; i < pts.length; i++) {
    const last = i === pts.length - 1;
    const turns =
      !last && (pts[i + 1].x - pts[i].x !== pts[i].x - pts[i - 1].x || pts[i + 1].y - pts[i].y !== pts[i].y - pts[i - 1].y);
    if (last || turns) {
      out.push({ a: pts[from], b: pts[i] });
      from = i;
    }
  }
  return out;
}

/** 長度（格）：直線導線是兩端的直線距離，路徑導線是步數。 */
export function wireLength(wire: Wire, lattice?: Lattice): number {
  if (!isStraight(wire)) return Math.max(0, wire.path.length - 1);
  const [s] = wireSegments(wire, lattice);
  return Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
}

/** Liang–Barsky：線段是否穿過以 (cx, cy) 為中心、半邊長 h 的正方形。 */
function hitsSquare(s: Segment, cx: number, cy: number, h = HOLE_HALF): boolean {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, s.a.x - (cx - h)) && clip(dx, cx + h - s.a.x) && clip(-dy, s.a.y - (cy - h)) && clip(dy, cy + h - s.a.y) && t0 <= t1;
}

/** 導線經過的格點（不含兩端），沿線排序。路徑導線就是路徑中間的點；直線導線用 hitsSquare 判斷，跨板時換算到格點所在的板子。 */
export function cellsUnder(wire: Wire, lattice?: Lattice): GridPoint[] {
  if (!isStraight(wire)) return wire.path.slice(1, -1);
  const [s] = wireSegments(wire, lattice);
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const len2 = dx * dx + dy * dy;
  const found: Array<{ t: number; p: GridPoint }> = [];
  for (let x = Math.min(s.a.x, s.b.x); x <= Math.max(s.a.x, s.b.x); x++) {
    for (let y = Math.min(s.a.y, s.b.y); y <= Math.max(s.a.y, s.b.y); y++) {
      if ((x === s.a.x && y === s.a.y) || (x === s.b.x && y === s.b.y)) continue;
      if (!hitsSquare(s, x, y)) continue;
      const p = lattice ? pointAt(lattice, x, y) : { boardId: wire.start.boardId, x, y };
      if (p) found.push({ t: len2 === 0 ? 0 : ((x - s.a.x) * dx + (y - s.a.y) * dy) / len2, p });
    }
  }
  return found.sort((a, b) => a.t - b.t).map((f) => f.p);
}

const cross = (o: LPoint, a: LPoint, b: LPoint) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** 兩條線段共線且共用一段長度 > 0：回傳共用部分在 s 上的起點；否則 null。 */
export function segmentOverlap(s: Segment, t: Segment): LPoint | null {
  if (cross(s.a, s.b, t.a) !== 0 || cross(s.a, s.b, t.b) !== 0) return null;
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return null;
  const proj = (p: LPoint) => ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / len2;
  const lo = Math.max(0, Math.min(proj(t.a), proj(t.b)));
  const hi = Math.min(1, Math.max(proj(t.a), proj(t.b)));
  if (hi - lo <= 1e-9) return null;
  return { x: s.a.x + dx * lo, y: s.a.y + dy * lo };
}

/** 兩條線段在各自的中段交於一點（X 形交叉）：回傳交點；端點相接、共線都回傳 null。 */
export function segmentCrossing(s: Segment, t: Segment): LPoint | null {
  const d1 = cross(t.a, t.b, s.a);
  const d2 = cross(t.a, t.b, s.b);
  const d3 = cross(s.a, s.b, t.a);
  const d4 = cross(s.a, s.b, t.b);
  if (d1 * d2 < 0 && d3 * d4 < 0) {
    const r = d1 / (d1 - d2);
    return { x: s.a.x + (s.b.x - s.a.x) * r, y: s.a.y + (s.b.y - s.a.y) * r };
  }
  return null;
}

export function pathIssues(wire: Wire, isOnBoard: (p: GridPoint) => boolean, lattice?: Lattice): PathIssue[] {
  const issues = new Set<PathIssue>();
  if (isStraight(wire)) {
    const ends = [nodeIdOf(wire.start), nodeIdOf(wire.end)];
    if (wire.path.length !== 2 || nodeIdOf(wire.path[0]) !== ends[0] || nodeIdOf(wire.path[1]) !== ends[1]) issues.add('ENDPOINT_MISMATCH');
    if (ends[0] === ends[1]) issues.add('TOO_SHORT');
    if (!isOnBoard(wire.start) || !isOnBoard(wire.end)) issues.add('OUT_OF_BOARD');
    if (lattice && lattice.groupOf.get(wire.start.boardId) !== lattice.groupOf.get(wire.end.boardId)) issues.add('NOT_SAME_GROUP');
    return [...issues];
  }
  const path = wire.path;
  if (path.length < 2) issues.add('TOO_SHORT');
  for (let i = 1; i < path.length; i++) if (!stepDirection(path[i - 1], path[i], lattice)) issues.add('NOT_ORTHOGONAL_STEP');
  if (
    path.length > 0 &&
    (nodeIdOf(path[0]) !== nodeIdOf(wire.start) || nodeIdOf(path[path.length - 1]) !== nodeIdOf(wire.end))
  ) {
    issues.add('ENDPOINT_MISMATCH');
  }
  if (new Set(path.map(nodeIdOf)).size !== path.length) issues.add('SELF_INTERSECT');
  if (path.some((p) => !isOnBoard(p))) issues.add('OUT_OF_BOARD');
  return [...issues];
}

export function segments(path: GridPoint[], lattice?: Lattice): Array<{ dir: Direction; length: number }> {
  const out: Array<{ dir: Direction; length: number }> = [];
  for (let i = 1; i < path.length; i++) {
    const dir = stepDirection(path[i - 1], path[i], lattice);
    if (!dir) continue;
    const last = out[out.length - 1];
    if (last && last.dir === dir) last.length++;
    else out.push({ dir, length: 1 });
  }
  return out;
}

export function countBends(path: GridPoint[], lattice?: Lattice): number {
  return Math.max(0, segments(path, lattice).length - 1);
}

/** 夾在兩個轉彎之間、只有 1 格長的小折角（實際上很難把線折出來）。 */
export function countShortJogs(path: GridPoint[], lattice?: Lattice): number {
  const segs = segments(path, lattice);
  let count = 0;
  for (let i = 1; i < segs.length - 1; i++) if (segs[i].length === 1) count++;
  return count;
}

export type UsageKind = 'end' | 'H' | 'V' | 'turn';

export interface NodeUsage {
  wireId: string;
  nodeId: string;
  kind: UsageKind;
}

export function wireNodeUsages(wire: Wire, lattice?: Lattice): NodeUsage[] {
  const path = wire.path;
  return path.map((p, i) => {
    let kind: UsageKind = 'end';
    if (i > 0 && i < path.length - 1) {
      const into = stepDirection(path[i - 1], p, lattice);
      const out = stepDirection(p, path[i + 1], lattice);
      if (into && into === out) kind = into === 'E' || into === 'W' ? 'H' : 'V';
      else kind = 'turn';
    }
    return { wireId: wire.id, nodeId: nodeIdOf(p), kind };
  });
}

export interface WireConflict {
  nodeId: string;
  wireIds: [string, string];
}

/** 同一格點恰好兩條線、一橫一直地直穿才算交叉；其他任何共用都算重疊。 */
function nodeInteractions(wires: Wire[], lattice?: Lattice): { overlaps: WireConflict[]; crossings: WireConflict[] } {
  const byNode = new Map<string, NodeUsage[]>();
  for (const w of wires) {
    for (const usage of wireNodeUsages(w, lattice)) {
      const list = byNode.get(usage.nodeId);
      if (list) list.push(usage);
      else byNode.set(usage.nodeId, [usage]);
    }
  }
  const overlaps: WireConflict[] = [];
  const crossings: WireConflict[] = [];
  const nodeIds = [...byNode.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const nodeId of nodeIds) {
    const usages = byNode.get(nodeId)!;
    for (let i = 0; i < usages.length; i++) {
      for (let j = i + 1; j < usages.length; j++) {
        const a = usages[i];
        const b = usages[j];
        if (a.wireId === b.wireId) continue;
        const wireIds: [string, string] = a.wireId < b.wireId ? [a.wireId, b.wireId] : [b.wireId, a.wireId];
        const perpendicular = (a.kind === 'H' && b.kind === 'V') || (a.kind === 'V' && b.kind === 'H');
        (perpendicular && usages.length === 2 ? crossings : overlaps).push({ nodeId, wireIds });
      }
    }
  }
  return { overlaps, crossings };
}

/** 兩條路徑導線之間沿用格點規則；牽涉直線導線的用線段幾何：共線共用一段 = 重疊，中段交於一點 = 交叉。 */
export function analyzeWireInteractions(wires: Wire[], lattice?: Lattice): { overlaps: WireConflict[]; crossings: WireConflict[] } {
  const result = nodeInteractions(wires.filter((w) => !isStraight(w)), lattice);
  const segs = new Map(wires.map((w) => [w.id, wireSegments(w, lattice)]));
  const nodeOf = (p: LPoint, w: Wire) => {
    const q = lattice ? pointAt(lattice, Math.round(p.x), Math.round(p.y)) : null;
    return nodeIdOf(q ?? { boardId: w.start.boardId, x: Math.round(p.x), y: Math.round(p.y) });
  };
  for (let i = 0; i < wires.length; i++) {
    for (let j = i + 1; j < wires.length; j++) {
      const a = wires[i];
      const b = wires[j];
      if (!isStraight(a) && !isStraight(b)) continue;
      const wireIds: [string, string] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
      let overlap: LPoint | null = null;
      for (const s of segs.get(a.id)!) {
        for (const t of segs.get(b.id)!) {
          overlap ??= segmentOverlap(s, t);
          const x = segmentCrossing(s, t);
          if (x) result.crossings.push({ nodeId: nodeOf(x, a), wireIds });
        }
      }
      if (overlap) result.overlaps.push({ nodeId: nodeOf(overlap, a), wireIds });
    }
  }
  return result;
}
