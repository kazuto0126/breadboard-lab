import { buildLattice } from '../breadboard/lattice';
import { getNode, nodeIdOf } from '../breadboard/naming';
import { groupInfo, groupOfPoint, indexCircuit } from '../circuit/circuitIndex';
import { resolveFootprint } from '../circuit/footprint';
import { compareIds, netByPin, pinKey } from '../circuit/nets';
import type { Circuit, Net } from '../../types/circuit';
import type { Rotation } from '../../types/component';
import type { IcPlacement } from '../../types/routing';
import { placeAt } from './relocate';

const ROTATIONS: Rotation[] = [0, 180];

/**
 * 規格 2026-10-10 ic-placement 3.1：一顆 IC 的所有合法位置。其他元件固定在 circuit 裡的位置；導線不管（佈線時會換掉）。
 * 同一個 Board Group 的每塊板、每個孔當錨點、旋轉 0 / 180 度：每支腳插在沒被佔用的五孔排、各在不同的排，本體不碰其他元件，
 * 同一排裡其他元件的腳必須和這支腳屬於原本的同一個 Net（nets）。順序：板子 ID、y、x、旋轉。
 */
export function icCandidates(circuit: Circuit, nets: Net[], componentId: string): IcPlacement[] {
  const index = indexCircuit(circuit);
  const self = index.placedById.get(componentId);
  if (!self) throw new Error(`Unknown component ${componentId}`);
  const lattice = buildLattice(circuit.boards);
  const group = lattice.groupOf.get(self.instance.boardId);
  const boardIds = circuit.boards.map((b) => b.id).filter((id) => lattice.groupOf.get(id) === group).sort(compareIds);

  const netOf = netByPin(nets);
  const taken = new Set<string>();
  const netsInGroup = new Map<string, Set<string>>();
  for (const pc of index.placed) {
    if (pc.instance.id === componentId) continue;
    for (const cell of pc.footprint.blocked) taken.add(nodeIdOf(cell));
    for (const pin of pc.footprint.pins) {
      taken.add(nodeIdOf(pin.point));
      const g = groupOfPoint(index, pin.point);
      const net = netOf.get(pinKey({ componentId: pc.instance.id, pinNumber: pin.pinNumber }));
      if (!g || !net) continue;
      const set = netsInGroup.get(g) ?? new Set<string>();
      set.add(net.id);
      netsInGroup.set(g, set);
    }
  }

  const fits = (p: IcPlacement): boolean => {
    const board = index.boards.get(p.boardId)!;
    const fp = resolveFootprint(placeAt(self.instance, p), self.def);
    const used = new Set<string>();
    for (const pin of fp.pins) {
      const node = getNode(board, pin.point.x, pin.point.y);
      if (!node || node.kind !== 'hole' || !node.groupId || taken.has(node.id) || used.has(node.groupId)) return false;
      if (groupInfo(index, node.groupId)?.kind !== 'terminal') return false;
      used.add(node.groupId);
      const mine = netOf.get(pinKey({ componentId, pinNumber: pin.pinNumber }))?.id;
      for (const other of netsInGroup.get(node.groupId) ?? []) if (other !== mine) return false;
    }
    for (const cell of fp.blocked) {
      const node = getNode(board, cell.x, cell.y);
      if (!node || taken.has(node.id)) return false;
    }
    return true;
  };

  const out: IcPlacement[] = [];
  for (const boardId of boardIds) {
    for (const node of index.boards.get(boardId)!.nodes) {
      if (node.kind !== 'hole') continue;
      for (const rotation of ROTATIONS) {
        const p: IcPlacement = { boardId, anchor: { x: node.x, y: node.y }, rotation };
        if (fits(p)) out.push(p);
      }
    }
  }
  return out;
}
