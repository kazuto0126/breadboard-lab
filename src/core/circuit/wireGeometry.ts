import { nodeIdOf } from '../breadboard/naming';
import type { Wire } from '../../types/circuit';
import type { Direction, GridPoint } from '../../types/geometry';

export function stepDirection(a: GridPoint, b: GridPoint): Direction | null {
  if (a.boardId !== b.boardId) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 1 && dy === 0) return 'E';
  if (dx === -1 && dy === 0) return 'W';
  if (dx === 0 && dy === 1) return 'S';
  if (dx === 0 && dy === -1) return 'N';
  return null;
}

export type PathIssue = 'TOO_SHORT' | 'NOT_ORTHOGONAL_STEP' | 'ENDPOINT_MISMATCH' | 'SELF_INTERSECT' | 'OUT_OF_BOARD';

export function pathIssues(wire: Wire, isOnBoard: (p: GridPoint) => boolean): PathIssue[] {
  const issues = new Set<PathIssue>();
  const path = wire.path;
  if (path.length < 2) issues.add('TOO_SHORT');
  for (let i = 1; i < path.length; i++) if (!stepDirection(path[i - 1], path[i])) issues.add('NOT_ORTHOGONAL_STEP');
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

export function segments(path: GridPoint[]): Array<{ dir: Direction; length: number }> {
  const out: Array<{ dir: Direction; length: number }> = [];
  for (let i = 1; i < path.length; i++) {
    const dir = stepDirection(path[i - 1], path[i]);
    if (!dir) continue;
    const last = out[out.length - 1];
    if (last && last.dir === dir) last.length++;
    else out.push({ dir, length: 1 });
  }
  return out;
}

export function countBends(path: GridPoint[]): number {
  return Math.max(0, segments(path).length - 1);
}

/** 夾在兩個轉彎之間、只有 1 格長的小折角（實際上很難把線折出來）。 */
export function countShortJogs(path: GridPoint[]): number {
  const segs = segments(path);
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

export function wireNodeUsages(wire: Wire): NodeUsage[] {
  const path = wire.path;
  return path.map((p, i) => {
    let kind: UsageKind = 'end';
    if (i > 0 && i < path.length - 1) {
      const into = stepDirection(path[i - 1], p);
      const out = stepDirection(p, path[i + 1]);
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
export function analyzeWireInteractions(wires: Wire[]): { overlaps: WireConflict[]; crossings: WireConflict[] } {
  const byNode = new Map<string, NodeUsage[]>();
  for (const w of wires) {
    for (const usage of wireNodeUsages(w)) {
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
