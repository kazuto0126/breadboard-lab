import type { ComponentDefinition, ComponentInstance, Rotation } from '../../types/component';
import { boundsCenter, boundsOf, componentCells } from './componentShape';

/** DIP 在 0° / 180° 時 anchor（第 1 腳）的 y：讓兩排腳跨在凹槽上（規格第 6.3 節）。 */
export function trenchAnchorY(def: ComponentDefinition, rotation: Rotation): number | null {
  if (def.package.type !== 'dip') return null;
  const wide = def.package.rowSpacing === 6;
  if (rotation === 0) return wide ? 13 : 11;
  if (rotation === 180) return wide ? 7 : 8;
  return null;
}

export function snapAnchor(def: ComponentDefinition, rotation: Rotation, desired: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.round(desired.x), y: trenchAnchorY(def, rotation) ?? Math.round(desired.y) };
}

/** 讓元件範圍的中心落在 point（格子座標，可為小數）的 anchor，已吸附。 */
export function anchorCenteredAt(
  def: ComponentDefinition,
  rotation: Rotation,
  span: number | undefined,
  point: { x: number; y: number },
  boardId = 'b1',
): { x: number; y: number } {
  const probe: ComponentInstance = { id: '__probe__', defId: def.id, boardId, anchor: { x: 0, y: 0 }, rotation, props: {} };
  if (span !== undefined) probe.span = span;
  const center = boundsCenter(boundsOf(componentCells(probe, def)));
  return snapAnchor(def, rotation, { x: point.x - center.x, y: point.y - center.y });
}
