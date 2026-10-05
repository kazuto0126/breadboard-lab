import { nodeIdOf } from '../breadboard/naming';
import { indexCircuit, nodeAt, pushTo, type CircuitIndex } from '../circuit/circuitIndex';
import { compareIds, extractNetsWith, terminalGroupIds } from '../circuit/nets';
import { analyzeWireInteractions, pathIssues } from '../circuit/wireGeometry';
import type { Circuit, Net, Wire } from '../../types/circuit';
import type { GridPoint } from '../../types/geometry';
import type { LegalityViolation } from '../../types/routing';

/** 獨立於佈線器的檢查：任何一項不通過，autoRoute 就不能輸出那個 Net 的線。 */
export function checkRoutingLegality(circuit: Circuit, wires: Wire[]): LegalityViolation[] {
  const index = indexCircuit(circuit);
  const reference = extractNetsWith(index, circuit.wires);
  const terminals = new Map(reference.map((net) => [net.id, new Set(terminalGroupIds(net, index))]));
  const isOnBoard = (p: GridPoint) => nodeAt(index, p) !== undefined;
  const endsAt = new Map<string, string[]>();
  for (const w of wires) for (const p of [w.start, w.end]) pushTo(endsAt, nodeIdOf(p), w.id);
  const out: LegalityViolation[] = [];

  for (const w of wires) {
    const netIds = w.netId ? [w.netId] : [];
    const issues = pathIssues(w, isOnBoard);
    if (issues.length > 0) out.push({ code: 'PATH_INVALID', wireIds: [w.id], netIds, detail: issues.join(', ') });

    const allowed = w.netId ? terminals.get(w.netId) : undefined;
    for (const end of [w.start, w.end]) {
      const node = nodeAt(index, end);
      const id = nodeIdOf(end);
      const ok =
        node !== undefined &&
        node.kind === 'hole' &&
        node.groupId !== null &&
        allowed !== undefined &&
        allowed.has(node.groupId) &&
        !index.pinsAt.has(id) &&
        !index.bodiesAt.has(id) &&
        (endsAt.get(id)?.length ?? 0) === 1;
      if (!ok) out.push({ code: 'ENDPOINT_INVALID', wireIds: [w.id], netIds, detail: node?.name ?? id });
    }

    const obstacle = w.path.slice(1, -1).find((p) => {
      const id = nodeIdOf(p);
      return index.pinsAt.has(id) || index.bodiesAt.has(id) || endsAt.has(id);
    });
    if (obstacle) out.push({ code: 'THROUGH_OBSTACLE', wireIds: [w.id], netIds, detail: nodeIdOf(obstacle) });
  }

  const netOfWire = new Map(wires.map((w) => [w.id, w.netId]));
  for (const o of analyzeWireInteractions(wires).overlaps) {
    const netIds = [...new Set(o.wireIds.map((id) => netOfWire.get(id)).filter((n): n is string => n !== undefined))].sort(compareIds);
    out.push({ code: 'OVERLAP', wireIds: [...o.wireIds], netIds, detail: o.nodeId });
  }

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
