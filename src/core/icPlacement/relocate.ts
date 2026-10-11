import { parseNodeId } from '../breadboard/naming';
import { indexCircuit, type CircuitIndex } from '../circuit/circuitIndex';
import { pinKey, terminalGroupIds } from '../circuit/nets';
import type { Circuit, Net, Wire } from '../../types/circuit';
import type { ComponentInstance } from '../../types/component';
import type { GridPoint } from '../../types/geometry';
import type { IcMove, IcPlacement } from '../../types/routing';

/** 元件目前的位置。 */
export function placementOf(c: ComponentInstance): IcPlacement {
  return { boardId: c.boardId, anchor: { x: c.anchor.x, y: c.anchor.y }, rotation: c.rotation };
}

export function samePlacement(a: IcPlacement, b: IcPlacement): boolean {
  return a.boardId === b.boardId && a.anchor.x === b.anchor.x && a.anchor.y === b.anchor.y && a.rotation === b.rotation;
}

/** 把元件放到 p（回傳新物件）。 */
export function placeAt(c: ComponentInstance, p: IcPlacement): ComponentInstance {
  return { ...c, boardId: p.boardId, anchor: { x: p.anchor.x, y: p.anchor.y }, rotation: p.rotation };
}

/** 套用搬移：搬過的元件換成新物件，其他沿用原本的參照；沒有搬移時回傳同一個陣列。 */
export function applyMoves(components: ComponentInstance[], moves: IcMove[]): ComponentInstance[] {
  if (moves.length === 0) return components;
  const to = new Map(moves.map((m) => [m.componentId, m.to]));
  return components.map((c) => {
    const p = to.get(c.id);
    return p ? placeAt(c, p) : c;
  });
}

/** 群組的第一個格點（描述連接關係的導線端點）。 */
function groupPoint(index: CircuitIndex, groupId: string): GridPoint {
  const nodeId = index.boards.get(groupId.slice(0, groupId.indexOf(':')))?.groups[groupId]?.nodeIds[0];
  if (!nodeId) throw new Error(`Unknown group ${groupId}`);
  return parseNodeId(nodeId);
}

/**
 * 規格 2026-10-10 ic-placement 2.2：IC 搬到新位置後的電路。導線換成「描述連接關係的導線」：每個原本的 Net
 * 把它在新位置的終端排（腳所在的排＋它的電源軌）依序串起來。這些線只告訴佈線器哪些排要接在一起，不會出現在結果裡。
 */
export function relocatedCircuit(circuit: Circuit, nets: Net[], moves: IcMove[]): Circuit {
  const moved: Circuit = { ...circuit, components: applyMoves(circuit.components, moves), wires: [] };
  const index = indexCircuit(moved);
  const wires: Wire[] = [];
  for (const net of nets) {
    const groups = terminalGroupIds(net, index);
    for (let i = 1; i < groups.length; i++) {
      const start = groupPoint(index, groups[i - 1]);
      const end = groupPoint(index, groups[i]);
      wires.push({ id: `link_${net.id}_${i}`, color: '#888888', source: 'manual', straight: true, start, end, path: [{ ...start }, { ...end }] });
    }
  }
  return { ...moved, wires };
}

/** 規格 2.3：兩組 Net 是否把腳分成完全相同的組（以腳為準，不管 Net 的名稱與群組）。 */
export function samePinPartition(a: Net[], b: Net[]): boolean {
  const key = (nets: Net[]) => nets.map((n) => n.pins.map(pinKey).join(',')).sort().join('|');
  return key(a) === key(b);
}
