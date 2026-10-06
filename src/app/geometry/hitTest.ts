import { getNode } from '../../core/breadboard/naming';
import { getBoard } from '../../core/breadboard/registry';
import { resolveFootprint } from '../../core/circuit/footprint';
import { getComponentDefinition } from '../../core/circuit/library';
import type { Circuit } from '../../types/circuit';
import type { ComponentDefinition, ComponentInstance } from '../../types/component';
import type { GridPoint } from '../../types/geometry';
import { componentCells } from './componentShape';

export type Hit =
  | { kind: 'pin'; componentId: string; pinNumber: number }
  | { kind: 'component'; componentId: string }
  | { kind: 'wire'; wireId: string }
  | { kind: 'hole'; point: GridPoint }
  | { kind: 'empty'; point: GridPoint };

function samePoint(a: GridPoint, b: GridPoint): boolean {
  return a.boardId === b.boardId && a.x === b.x && a.y === b.y;
}

/** 依「腳 → 元件範圍 → 導線 → 孔 → 空白」判斷；後放的元件、後畫的導線在上層，優先命中。 */
export function hitTest(circuit: Circuit, point: GridPoint): Hit {
  const placed: Array<{ instance: ComponentInstance; def: ComponentDefinition }> = [];
  for (const instance of circuit.components) {
    const def = getComponentDefinition(instance.defId);
    if (def) placed.push({ instance, def });
  }
  placed.reverse();
  for (const { instance, def } of placed) {
    const pin = resolveFootprint(instance, def).pins.find((p) => samePoint(p.point, point));
    if (pin) return { kind: 'pin', componentId: instance.id, pinNumber: pin.pinNumber };
  }
  for (const { instance, def } of placed) {
    if (componentCells(instance, def).some((c) => samePoint(c, point))) return { kind: 'component', componentId: instance.id };
  }
  for (let i = circuit.wires.length - 1; i >= 0; i--) {
    if (circuit.wires[i].path.some((p) => samePoint(p, point))) return { kind: 'wire', wireId: circuit.wires[i].id };
  }
  const boardInstance = circuit.boards.find((b) => b.id === point.boardId);
  const node = boardInstance ? getNode(getBoard(boardInstance.layoutId, boardInstance.id), point.x, point.y) : undefined;
  return node?.kind === 'hole' ? { kind: 'hole', point } : { kind: 'empty', point };
}
