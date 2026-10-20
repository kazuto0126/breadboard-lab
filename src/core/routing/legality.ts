import { buildLattice, isRoutablePoint, latticeOf } from '../breadboard/lattice';
import { nodeIdOf } from '../breadboard/naming';
import { groupInfo, groupOfPoint, indexCircuit, nodeAt, pushTo, type CircuitIndex } from '../circuit/circuitIndex';
import { compareIds, extractNetsWith, terminalGroupIds } from '../circuit/nets';
import { analyzeWireInteractions, cellsUnder, isStraight, pathIssues } from '../circuit/wireGeometry';
import type { Circuit, Net, Wire } from '../../types/circuit';
import type { GridPoint } from '../../types/geometry';
import type { LegalityViolation } from '../../types/routing';

/**
 * 獨立於佈線器的檢查（規格 2026-10-10 routing-standard 第 3 節）：任何一項不通過，autoRoute 就不能輸出那個 Net 的線。
 * 每條線是水平或垂直的直線；兩端插在這個 Net 的終端排或空的五孔排（轉接排）；一孔一線；不經過元件腳、本體、線端；不重疊；
 * 子專案 39：不交叉；連接關係不變。
 */
export function checkRoutingLegality(circuit: Circuit, wires: Wire[]): LegalityViolation[] {
  const index = indexCircuit(circuit);
  const reference = extractNetsWith(index, circuit.wires);
  const terminals = new Map(reference.map((net) => [net.id, new Set(terminalGroupIds(net, index))]));
  const lattice = buildLattice(circuit.boards);
  const isOnBoard = (p: GridPoint) => isRoutablePoint(lattice, p);
  const pinGroups = new Set<string>();
  for (const pc of index.placed) {
    for (const pin of pc.footprint.pins) {
      const g = groupOfPoint(index, pin.point);
      if (g) pinGroups.add(g);
    }
  }
  const endsAt = new Map<string, string[]>();
  for (const w of wires) for (const p of [w.start, w.end]) pushTo(endsAt, nodeIdOf(p), w.id);
  const out: LegalityViolation[] = [];
  for (const w of wires) {
    const netIds = w.netId ? [w.netId] : [];
    const issues: string[] = pathIssues(w, isOnBoard, lattice);
    const a = latticeOf(lattice, w.start);
    const b = latticeOf(lattice, w.end);
    if (!isStraight(w)) issues.push('NOT_STRAIGHT');
    else if (a && b && a.x !== b.x && a.y !== b.y) issues.push('DIAGONAL');
    const groups = [w.start, w.end].map((p) => nodeAt(index, p)?.groupId ?? null);
    if (groups[0] !== null && groups[0] === groups[1]) issues.push('SAME_GROUP');
    if (issues.length > 0) out.push({ code: 'PATH_INVALID', wireIds: [w.id], netIds, detail: issues.join(', ') });

    const allowed = w.netId ? terminals.get(w.netId) : undefined;
    for (const end of [w.start, w.end]) {
      const node = nodeAt(index, end);
      const id = nodeIdOf(end);
      const g = node?.groupId ?? null;
      // 自己的終端排，或空的五孔排（轉接排；空的電源軌不算）。
      const groupOk = g !== null && allowed !== undefined && (allowed.has(g) || (groupInfo(index, g)?.kind !== 'rail' && !pinGroups.has(g)));
      const ok =
        node !== undefined &&
        node.kind === 'hole' &&
        groupOk &&
        !index.pinsAt.has(id) &&
        !index.bodiesAt.has(id) &&
        (endsAt.get(id)?.length ?? 0) === 1;
      if (!ok) out.push({ code: 'ENDPOINT_INVALID', wireIds: [w.id], netIds, detail: node?.name ?? id });
    }
    const obstacle = cellsUnder(w, lattice).find((p) => {
      const id = nodeIdOf(p);
      return index.pinsAt.has(id) || index.bodiesAt.has(id) || endsAt.has(id);
    });
    if (obstacle) out.push({ code: 'THROUGH_OBSTACLE', wireIds: [w.id], netIds, detail: nodeIdOf(obstacle) });
  }
  const netOfWire = new Map(wires.map((w) => [w.id, w.netId]));
  const netsOf = (ids: readonly string[]) => [...new Set(ids.map((id) => netOfWire.get(id)).filter((n): n is string => n !== undefined))].sort(compareIds);
  const interactions = analyzeWireInteractions(wires, lattice);
  for (const o of interactions.overlaps) out.push({ code: 'OVERLAP', wireIds: [...o.wireIds], netIds: netsOf(o.wireIds), detail: o.nodeId });
  for (const x of interactions.crossings) out.push({ code: 'CROSSING', wireIds: [...x.wireIds], netIds: netsOf(x.wireIds), detail: x.nodeId });
  for (const netId of mismatchedNets(index, reference, wires)) {
    out.push({
      code: 'NET_MISMATCH',
      wireIds: wires.filter((w) => w.netId === netId).map((w) => w.id),
      netIds: [netId],
      detail: `${netId} 的連接關係與原電路不同`,
    });
  }
  return out;
}

/** 用「元件 + wires」重新分析 Net，回傳終端群組沒連在一起、或和別的 Net 併在一起的基準 Net。 */
export function mismatchedNets(index: CircuitIndex, reference: Net[], wires: Wire[]): string[] {
  const produced = extractNetsWith(index, wires);
  const producedOf = new Map<string, string>();
  for (const net of produced) for (const g of net.groupIds) producedOf.set(g, net.id);

  const bad = new Set<string>();
  const owner = new Map<string, string>();
  for (const net of reference) {
    const ids = new Set(terminalGroupIds(net, index).map((g) => producedOf.get(g) ?? `missing:${g}`));
    if (ids.size > 1) bad.add(net.id);
    for (const pid of ids) {
      const previous = owner.get(pid);
      if (previous !== undefined && previous !== net.id) {
        bad.add(previous);
        bad.add(net.id);
      } else {
        owner.set(pid, net.id);
      }
    }
  }
  return [...bad].sort(compareIds);
}
