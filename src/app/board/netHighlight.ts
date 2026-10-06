import { groupOfPoint, indexCircuit, pinPoint } from '../../core/circuit/circuitIndex';
import { extractNetsWith } from '../../core/circuit/nets';
import type { Circuit } from '../../types/circuit';
import type { GridPoint } from '../../types/geometry';
import type { Selection } from '../model/editorTypes';

export interface NetHighlight {
  netId: string;
  wireIds: Set<string>;
  pinPoints: GridPoint[];
}

/** 選取腳或導線時，找出同一個 Net 的所有導線與腳。 */
export function netHighlightFor(selection: Selection | null, circuit: Circuit): NetHighlight | null {
  if (!selection || (selection.kind !== 'pin' && selection.kind !== 'wire')) return null;
  const index = indexCircuit(circuit);
  let groupId: string | null = null;
  if (selection.kind === 'pin') {
    const p = pinPoint(index, { componentId: selection.componentId, pinNumber: selection.pinNumber });
    groupId = p ? groupOfPoint(index, p) : null;
  } else {
    const w = circuit.wires.find((x) => x.id === selection.id);
    groupId = w ? groupOfPoint(index, w.start) : null;
  }
  if (!groupId) return null;
  const net = extractNetsWith(index, circuit.wires).find((n) => n.groupIds.includes(groupId!));
  if (!net) return null;
  const groups = new Set(net.groupIds);
  const wireIds = new Set(
    circuit.wires
      .filter((w) => {
        const g = groupOfPoint(index, w.start);
        return g !== null && groups.has(g);
      })
      .map((w) => w.id),
  );
  const pinPoints = net.pins.map((ref) => pinPoint(index, ref)).filter((p): p is GridPoint => p !== undefined);
  return { netId: net.id, wireIds, pinPoints };
}
