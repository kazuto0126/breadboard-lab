import { buildLattice } from '../core/breadboard/lattice';
import { getNode, holeName, nodeIdOf } from '../core/breadboard/naming';
import { getBoard } from '../core/breadboard/registry';
import { indexCircuit, nodeAt } from '../core/circuit/circuitIndex';
import { cellsUnder, segmentOverlap, wireSegments } from '../core/circuit/wireGeometry';
import type { Circuit, Wire } from '../types/circuit';
import type { GridPoint } from '../types/geometry';
import { holeLabel } from './analysis';
import { buildOccupancy, type Occupancy } from './placement';

export interface WireColor {
  id: string;
  name: string;
  value: string;
}

/** 實體跳線常見的 10 種顏色；紅、黑、黃…與自動佈線的配色一致。 */
export const WIRE_COLORS: WireColor[] = [
  { id: 'red', name: '紅', value: '#d32f2f' },
  { id: 'black', name: '黑', value: '#212121' },
  { id: 'yellow', name: '黃', value: '#f9a825' },
  { id: 'green', name: '綠', value: '#2e7d32' },
  { id: 'blue', name: '藍', value: '#1565c0' },
  { id: 'orange', name: '橘', value: '#ef6c00' },
  { id: 'white', name: '白', value: '#f5f5f5' },
  { id: 'purple', name: '紫', value: '#6a1b9a' },
  { id: 'brown', name: '棕', value: '#6d4c41' },
  { id: 'gray', name: '灰', value: '#9e9e9e' },
];

export const DEFAULT_WIRE_COLOR = '#1565c0';

/** 空孔：孔上沒有元件腳、沒被本體蓋住、不是別條線的端點，也沒有別條線經過。 */
export function isFreeHoleWith(occ: Occupancy, p: GridPoint): boolean {
  if (!occ.board || occ.board.id !== p.boardId) return false;
  const node = getNode(occ.board, p.x, p.y);
  if (!node || node.kind !== 'hole') return false;
  const id = node.id;
  return !occ.pins.has(id) && !occ.bodies.has(id) && !occ.wireEnds.has(id) && !occ.wirePaths.has(id);
}

export function isFreeHole(circuit: Circuit, p: GridPoint): boolean {
  return isFreeHoleWith(buildOccupancy(circuit, p.boardId), p);
}

export type StraightProblem =
  | { kind: 'not-hole' }
  | { kind: 'same-hole' }
  | { kind: 'pin'; point: GridPoint }
  | { kind: 'other-group' }
  | { kind: 'obstacle'; point: GridPoint }
  | { kind: 'overlap'; wireId: string }
  | { kind: 'covered'; wireId: string; point: GridPoint };

/**
 * 規格（2026-10-10 straight-wires）第 1 節：手動直線（新拉的線、拖曳端點後的線）合不合法；不合法時回傳第一個原因。
 * 一孔多線可以；端點不能是元件腳或本體；線不能和別條線重疊，不能經過元件腳、本體、別條線的端點；
 * 端點也不能落在別條線經過的孔上（那條線就會變成經過障礙）。ignoreWireId：拖曳端點時忽略被移動的那條線。
 */
export function straightWireProblem(circuit: Circuit, start: GridPoint, end: GridPoint, ignoreWireId?: string): StraightProblem | null {
  const index = indexCircuit(circuit);
  for (const p of [start, end]) {
    const node = nodeAt(index, p);
    if (!node || node.kind !== 'hole') return { kind: 'not-hole' };
  }
  if (nodeIdOf(start) === nodeIdOf(end)) return { kind: 'same-hole' };
  for (const p of [start, end]) {
    const id = nodeIdOf(p);
    if (index.pinsAt.has(id) || index.bodiesAt.has(id)) return { kind: 'pin', point: p };
  }
  const lattice = buildLattice(circuit.boards);
  if (lattice.groupOf.get(start.boardId) !== lattice.groupOf.get(end.boardId)) return { kind: 'other-group' };

  const probe: Wire = { id: '__new', color: '', source: 'manual', straight: true, start, end, path: [start, end] };
  const others = circuit.wires.filter((w) => w.id !== ignoreWireId);
  const [mine] = wireSegments(probe, lattice);
  // 重疊比「經過端點」更具體，先檢查。
  for (const w of others) if (wireSegments(w, lattice).some((s) => segmentOverlap(mine, s))) return { kind: 'overlap', wireId: w.id };
  const ends = new Set(others.flatMap((w) => [nodeIdOf(w.start), nodeIdOf(w.end)]));
  for (const p of cellsUnder(probe, lattice)) {
    const id = nodeIdOf(p);
    if (index.pinsAt.has(id) || index.bodiesAt.has(id) || ends.has(id)) return { kind: 'obstacle', point: p };
  }
  const endIds = new Set([nodeIdOf(start), nodeIdOf(end)]);
  for (const w of others) {
    const under = cellsUnder(w, lattice).find((p) => endIds.has(nodeIdOf(p)));
    if (under) return { kind: 'covered', wireId: w.id, point: under };
  }
  return null;
}

export function straightProblemText(circuit: Circuit, problem: StraightProblem): string {
  const label = (p: GridPoint) => holeLabel(circuit, p);
  switch (problem.kind) {
    case 'not-hole':
      return '導線的兩端要插在孔上';
    case 'same-hole':
      return '起點和終點是同一個孔';
    case 'pin':
      return `導線不能接在元件腳或被元件蓋住的孔（${label(problem.point)}）`;
    case 'other-group':
      return '兩端要在同一塊板，或貼在一起的板子上';
    case 'obstacle':
      return `直線不能經過元件或其他導線的端點（經過 ${label(problem.point)}）`;
    case 'overlap':
      return `直線不能和導線 ${problem.wireId} 重疊`;
    case 'covered':
      return `${label(problem.point)} 上面有導線 ${problem.wireId} 經過，不能接在這裡`;
  }
}

/** 預設顏色：一端在 + 電源軌用紅色、在 − 電源軌用黑色，否則用 fallback。 */
export function defaultWireColor(circuit: Circuit, start: GridPoint, end: GridPoint, fallback = DEFAULT_WIRE_COLOR): string {
  const names = [start, end].map((p) => {
    const instance = circuit.boards.find((b) => b.id === p.boardId);
    return instance ? (holeName(getBoard(instance.layoutId, instance.id), p) ?? '') : '';
  });
  // + 軌（MB-102 的 T+ / B+、EIC-1106 的 P1+…）與紅色接線柱用紅色；− 軌與黑色接線柱用黑色。
  if (names.some((n) => /^([TB]|P[1-5])\+/.test(n) || n === '紅')) return WIRE_COLORS[0].value;
  if (names.some((n) => /^([TB]|P[1-5])-/.test(n) || n === '黑')) return WIRE_COLORS[1].value;
  return fallback;
}
