import { resolveFootprint } from '../../core/circuit/footprint';
import { getComponentDefinition } from '../../core/circuit/library';
import type { ComponentDefinition, ComponentInstance } from '../../types/component';
import type { GridPoint } from '../../types/geometry';

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function definitionOf(instance: ComponentInstance): ComponentDefinition {
  const def = getComponentDefinition(instance.defId);
  if (!def) throw new Error(`Unknown component definition: ${instance.defId}`);
  return def;
}

/** 元件範圍：腳 ∪ 本體擋住的格點；two-lead 再加上兩腳連線上的格點。 */
export function componentCells(instance: ComponentInstance, def: ComponentDefinition = definitionOf(instance)): GridPoint[] {
  const fp = resolveFootprint(instance, def);
  const cells = new Map<string, GridPoint>();
  const add = (p: GridPoint) => {
    const key = `${p.x},${p.y}`;
    if (!cells.has(key)) cells.set(key, p);
  };
  for (const pin of fp.pins) add(pin.point);
  for (const cell of fp.blocked) add(cell);
  if (def.package.type === 'two-lead') {
    const [a, b] = fp.pins.map((p) => p.point);
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    for (let i = 1; i < steps; i++) {
      add({ boardId: a.boardId, x: a.x + Math.sign(b.x - a.x) * i, y: a.y + Math.sign(b.y - a.y) * i });
    }
  }
  return [...cells.values()];
}

export function boundsOf(points: Array<{ x: number; y: number }>): Bounds {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

export function boundsCenter(b: Bounds): { x: number; y: number } {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}
