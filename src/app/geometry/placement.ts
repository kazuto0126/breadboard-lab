import { getNode, nodeIdOf } from '../../core/breadboard/naming';
import { getBoard } from '../../core/breadboard/registry';
import { effectiveSpan, resolveFootprint } from '../../core/circuit/footprint';
import { getComponentDefinition } from '../../core/circuit/library';
import type { Circuit } from '../../types/circuit';
import type { ComponentInstance } from '../../types/component';
import type { GridPoint } from '../../types/geometry';

export type PlacementCheck = { ok: true } | { ok: false; reason: string };

/** 規格第 6.3 節：腳都在孔上；腳不落在其他元件的腳、本體或導線端點；本體不蓋到其他元件。 */
export function checkPlacement(circuit: Circuit, instance: ComponentInstance, ignoreId?: string): PlacementCheck {
  const def = getComponentDefinition(instance.defId);
  if (!def) return { ok: false, reason: `未知的元件 ${instance.defId}` };
  if (def.package.type === 'two-lead' && effectiveSpan(instance, def) < def.package.minSpan) {
    return { ok: false, reason: '兩腳距離太小' };
  }
  const boardInstance = circuit.boards.find((b) => b.id === instance.boardId);
  if (!boardInstance) return { ok: false, reason: '找不到這塊麵包板' };
  const board = getBoard(boardInstance.layoutId, boardInstance.id);
  const fp = resolveFootprint(instance, def);

  for (const pin of fp.pins) {
    const node = getNode(board, pin.point.x, pin.point.y);
    if (!node || node.kind !== 'hole') return { ok: false, reason: `第 ${pin.pinNumber} 腳沒有插在孔上` };
  }

  const occupiedBy = new Map<string, string>();
  for (const other of circuit.components) {
    if (other.id === ignoreId || other.id === instance.id) continue;
    const otherDef = getComponentDefinition(other.defId);
    if (!otherDef) continue;
    const otherFp = resolveFootprint(other, otherDef);
    for (const p of otherFp.pins) occupiedBy.set(nodeIdOf(p.point), other.id);
    for (const c of otherFp.blocked) occupiedBy.set(nodeIdOf(c), other.id);
  }
  const wireEnds = new Set(circuit.wires.flatMap((w) => [nodeIdOf(w.start), nodeIdOf(w.end)]));

  for (const pin of fp.pins) {
    const id = nodeIdOf(pin.point);
    const other = occupiedBy.get(id);
    if (other) return { ok: false, reason: `第 ${pin.pinNumber} 腳會壓到 ${other}` };
    if (wireEnds.has(id)) return { ok: false, reason: `第 ${pin.pinNumber} 腳的位置已經插了導線` };
  }
  for (const cell of fp.blocked) {
    const other = occupiedBy.get(nodeIdOf(cell));
    if (other) return { ok: false, reason: `會壓到 ${other}` };
  }
  return { ok: true };
}

/** 是孔，而且沒有元件腳、不在元件本體下、不是導線端點。 */
export function isFreeHole(circuit: Circuit, point: GridPoint): boolean {
  const boardInstance = circuit.boards.find((b) => b.id === point.boardId);
  if (!boardInstance) return false;
  const node = getNode(getBoard(boardInstance.layoutId, boardInstance.id), point.x, point.y);
  if (!node || node.kind !== 'hole') return false;
  for (const c of circuit.components) {
    const def = getComponentDefinition(c.defId);
    if (!def) continue;
    const fp = resolveFootprint(c, def);
    if (fp.pins.some((p) => nodeIdOf(p.point) === node.id) || fp.blocked.some((b) => nodeIdOf(b) === node.id)) return false;
  }
  return !circuit.wires.some((w) => nodeIdOf(w.start) === node.id || nodeIdOf(w.end) === node.id);
}
