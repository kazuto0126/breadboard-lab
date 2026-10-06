import type { ComponentDefinition, ComponentInstance, Rotation } from '../../types/component';
import { boundsCenter, boundsOf, componentCells, definitionOf } from './componentShape';
import { trenchAnchorY } from './snap';

/** 以元件範圍外接矩形的中心順時針轉 90°；新中心取最接近原中心的格點，平手時取較小者。 */
export function rotateClockwise(instance: ComponentInstance, def: ComponentDefinition = definitionOf(instance)): ComponentInstance {
  const rotation = ((instance.rotation + 90) % 360) as Rotation;
  const before = boundsCenter(boundsOf(componentCells(instance, def)));
  const turned: ComponentInstance = { ...instance, rotation };
  const after = boundsCenter(boundsOf(componentCells(turned, def)));
  const shift = (v: number) => Math.ceil(v - 0.5);
  const x = instance.anchor.x + shift(before.x - after.x);
  const y = instance.anchor.y + shift(before.y - after.y);
  return { ...turned, anchor: { x, y: trenchAnchorY(def, rotation) ?? y } };
}
