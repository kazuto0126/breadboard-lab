import { buildLattice } from '../breadboard/lattice';
import { nodeIdOf } from '../breadboard/naming';
import type { Circuit, NodeState } from '../../types/circuit';
import type { GridPoint } from '../../types/geometry';
import { indexCircuit, nodeAt } from './circuitIndex';
import { cellsUnder } from './wireGeometry';

/** 需求文件第二章要求的節點狀態，依目前的電路即時計算。點不在板上時回傳 null。 */
export function getNodeState(circuit: Circuit, point: GridPoint): NodeState | null {
  const index = indexCircuit(circuit);
  const node = nodeAt(index, point);
  if (!node) return null;
  const pins = index.pinsAt.get(node.id) ?? [];
  const blockedBy = [...(index.bodiesAt.get(node.id) ?? [])];
  const wireEnds: string[] = [];
  const wirePasses: string[] = [];
  const lattice = buildLattice(circuit.boards);
  for (const w of circuit.wires) {
    if (nodeIdOf(w.start) === node.id || nodeIdOf(w.end) === node.id) wireEnds.push(w.id);
    else if (cellsUnder(w, lattice).some((p) => nodeIdOf(p) === node.id)) wirePasses.push(w.id);
  }
  return {
    nodeId: node.id,
    kind: node.kind,
    name: node.name,
    groupId: node.groupId,
    pin: pins[0] ?? null,
    blockedBy,
    wireEnds,
    wirePasses,
    occupied: pins.length > 0 || blockedBy.length > 0 || wireEnds.length > 0 || wirePasses.length > 0,
    routable: pins.length === 0 && blockedBy.length === 0 && wireEnds.length === 0,
  };
}
