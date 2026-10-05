import { getNode, nodeIdOf } from '../breadboard/naming';
import { getBoard } from '../breadboard/registry';
import type { Breadboard, BreadboardGroup, BreadboardNode } from '../../types/board';
import type { Circuit, PinRef } from '../../types/circuit';
import type { ComponentDefinition, ComponentInstance, ComponentProps, Footprint, PinDefinition } from '../../types/component';
import type { GridPoint } from '../../types/geometry';
import { resolveFootprint } from './footprint';
import { getComponentDefinition } from './library';

export interface PlacedComponent {
  instance: ComponentInstance;
  def: ComponentDefinition;
  footprint: Footprint;
}

export interface CircuitIndex {
  boards: Map<string, Breadboard>;
  placed: PlacedComponent[];
  placedById: Map<string, PlacedComponent>;
  /** 格點 ID → 插在這裡的元件腳（超過一個代表衝突）。 */
  pinsAt: Map<string, PinRef[]>;
  /** 格點 ID → 本體蓋住這裡的元件 ID。 */
  bodiesAt: Map<string, string[]>;
}

export function pushTo<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function indexCircuit(circuit: Circuit): CircuitIndex {
  const boards = new Map<string, Breadboard>(circuit.boards.map((b) => [b.id, getBoard(b.layoutId, b.id)]));
  const placed: PlacedComponent[] = [];
  const pinsAt = new Map<string, PinRef[]>();
  const bodiesAt = new Map<string, string[]>();
  for (const instance of circuit.components) {
    const def = getComponentDefinition(instance.defId);
    if (!def) throw new Error(`Unknown component definition: ${instance.defId}`);
    const footprint = resolveFootprint(instance, def);
    placed.push({ instance, def, footprint });
    for (const pin of footprint.pins) {
      pushTo(pinsAt, nodeIdOf(pin.point), { componentId: instance.id, pinNumber: pin.pinNumber });
    }
    for (const cell of footprint.blocked) pushTo(bodiesAt, nodeIdOf(cell), instance.id);
  }
  return { boards, placed, placedById: new Map(placed.map((p) => [p.instance.id, p])), pinsAt, bodiesAt };
}

export function nodeAt(index: CircuitIndex, p: GridPoint): BreadboardNode | undefined {
  const board = index.boards.get(p.boardId);
  return board ? getNode(board, p.x, p.y) : undefined;
}

export function groupOfPoint(index: CircuitIndex, p: GridPoint): string | null {
  return nodeAt(index, p)?.groupId ?? null;
}

export function groupInfo(index: CircuitIndex, groupId: string): BreadboardGroup | undefined {
  return index.boards.get(groupId.slice(0, groupId.indexOf(':')))?.groups[groupId];
}

export function pinPoint(index: CircuitIndex, ref: PinRef): GridPoint | undefined {
  return index.placedById.get(ref.componentId)?.footprint.pins.find((p) => p.pinNumber === ref.pinNumber)?.point;
}

export function pinDefinition(index: CircuitIndex, ref: PinRef): PinDefinition | undefined {
  return index.placedById.get(ref.componentId)?.def.pins.find((p) => p.number === ref.pinNumber);
}

export function propsOf(pc: PlacedComponent): ComponentProps {
  return { ...pc.def.defaultProps, ...pc.instance.props };
}

export function componentLabel(pc: PlacedComponent): string {
  return `${pc.def.name} (${pc.instance.id})`;
}
