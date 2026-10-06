import type { Hit } from '../geometry/hitTest';
import type { Selection } from '../model/editorTypes';

export const CLICK_TOLERANCE_PX = 5;
export const LONG_PRESS_MS = 500;

export type DragAction = 'move' | 'wire' | 'pan';

export interface PressPlan {
  click: Selection | null;
  drag: DragAction;
  componentId: string | null;
}

/** 規格第 6.2 節：按下的位置決定「點一下」與「拖曳」各做什麼。 */
export function planPress(hit: Hit, freeHole: boolean): PressPlan {
  switch (hit.kind) {
    case 'pin':
      return { click: { kind: 'pin', componentId: hit.componentId, pinNumber: hit.pinNumber }, drag: 'move', componentId: hit.componentId };
    case 'component':
      return { click: { kind: 'component', id: hit.componentId }, drag: 'move', componentId: hit.componentId };
    case 'wire':
      return { click: { kind: 'wire', id: hit.wireId }, drag: 'pan', componentId: null };
    case 'hole':
      return freeHole
        ? { click: { kind: 'hole', point: hit.point }, drag: 'wire', componentId: null }
        : { click: null, drag: 'pan', componentId: null };
    case 'empty':
      return { click: null, drag: 'pan', componentId: null };
  }
}

/** 唯讀時（佈線中、比較模式）拖曳一律變成平移；不可選取時點擊不做事。 */
export function restrictPlan(plan: PressPlan, editable: boolean, selectable: boolean): PressPlan {
  if (editable && selectable) return plan;
  return {
    click: selectable ? plan.click : null,
    drag: editable ? plan.drag : 'pan',
    componentId: editable ? plan.componentId : null,
  };
}

/** 指標第一次在某個軸向移動到半格以上時決定轉角方向：true = 先水平再垂直。 */
export function wireOrientation(dx: number, dy: number): boolean | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < 0.5 && ay < 0.5) return null;
  return ax >= ay;
}
