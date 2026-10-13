import { getComponentDefinition } from '../core/circuit/library';
import type { Circuit, Wire } from '../types/circuit';
import type { ComponentInstance, ComponentProps, Rotation } from '../types/component';
import type { GridPoint } from '../types/geometry';
import { nextComponentId, nextWireId } from './ids';
import { checkPlacement, rotatedPlacement } from './placement';

/**
 * 所有編輯動作都是純函式：輸入舊的 Circuit，回傳新的 Circuit，不修改原本的物件。
 * 沒有改變的部分沿用原本的參照（例如只改導線時 components 陣列不變），
 * 讓畫面與快取可以用參照判斷「哪些東西變了」。
 */

/** 要放到板上的元件（來自元件庫）。 */
export interface PlaceSpec {
  defId: string;
  rotation: Rotation;
  props: ComponentProps;
  span?: number;
}

function definitionOf(defId: string) {
  const def = getComponentDefinition(defId);
  if (!def) throw new Error(`Unknown component definition: ${defId}`);
  return def;
}

export function makeInstance(spec: PlaceSpec, id: string, boardId: string, anchor: { x: number; y: number }): ComponentInstance {
  const instance: ComponentInstance = {
    id,
    defId: spec.defId,
    boardId,
    anchor: { x: anchor.x, y: anchor.y },
    rotation: spec.rotation,
    props: { ...spec.props },
  };
  if (spec.span !== undefined) instance.span = spec.span;
  return instance;
}

export function addComponent(
  circuit: Circuit,
  spec: PlaceSpec,
  boardId: string,
  anchor: { x: number; y: number },
): { circuit: Circuit; id: string } {
  const id = nextComponentId(circuit, definitionOf(spec.defId).category);
  return { circuit: { ...circuit, components: [...circuit.components, makeInstance(spec, id, boardId, anchor)] }, id };
}

function updateComponent(circuit: Circuit, id: string, update: (c: ComponentInstance) => ComponentInstance): Circuit {
  if (!circuit.components.some((c) => c.id === id)) return circuit;
  return { ...circuit, components: circuit.components.map((c) => (c.id === id ? update(c) : c)) };
}

/** 移動（可以換到另一塊板）並可同時改變方向。 */
export function moveComponent(circuit: Circuit, id: string, anchor: { x: number; y: number }, rotation?: Rotation, boardId?: string): Circuit {
  return updateComponent(circuit, id, (c) => ({
    ...c,
    boardId: boardId ?? c.boardId,
    anchor: { x: anchor.x, y: anchor.y },
    rotation: rotation ?? c.rotation,
  }));
}

/** 旋轉並吸附到合法位置；轉不了（四周都放不下）時回傳 null。 */
export function rotateComponent(circuit: Circuit, id: string): Circuit | null {
  const instance = circuit.components.find((c) => c.id === id);
  if (!instance) return null;
  const placed = rotatedPlacement(circuit, instance);
  return placed ? moveComponent(circuit, id, placed.anchor, placed.rotation) : null;
}

export function removeItems(circuit: Circuit, items: { componentIds?: string[]; wireIds?: string[] }): Circuit {
  const componentIds = new Set(items.componentIds ?? []);
  const wireIds = new Set(items.wireIds ?? []);
  return {
    ...circuit,
    components: componentIds.size > 0 ? circuit.components.filter((c) => !componentIds.has(c.id)) : circuit.components,
    wires: wireIds.size > 0 ? circuit.wires.filter((w) => !wireIds.has(w.id)) : circuit.wires,
  };
}

export function updateComponentProps(circuit: Circuit, id: string, patch: ComponentProps): Circuit {
  return updateComponent(circuit, id, (c) => ({ ...c, props: { ...c.props, ...patch } }));
}

/** 子專案 14：開關、LED 名稱的長度上限。 */
export const LABEL_MAX = 8;

/** 名稱可以設幾個：指撥開關每個開關一個、LED 一個，其他元件沒有。 */
export function labelSlots(instance: ComponentInstance): number {
  const def = definitionOf(instance.defId);
  if (def.category === 'led') return 1;
  if (def.category === 'dip-switch') return (instance.props.switchStates ?? def.defaultProps.switchStates ?? []).length;
  return 0;
}

/** 設定第 index 個名稱（去掉前後空白、最多 LABEL_MAX 個字）；全部空白時拿掉 labels。 */
export function setLabel(circuit: Circuit, id: string, index: number, text: string): Circuit {
  const instance = circuit.components.find((c) => c.id === id);
  if (!instance || index < 0 || index >= labelSlots(instance)) return circuit;
  const labels = [...(instance.props.labels ?? [])];
  while (labels.length <= index) labels.push('');
  labels[index] = text.trim().slice(0, LABEL_MAX);
  while (labels.length > 0 && labels[labels.length - 1] === '') labels.pop();
  if ((instance.props.labels ?? []).join('\u0000') === labels.join('\u0000')) return circuit;
  return updateComponent(circuit, id, (c) => {
    const { labels: _old, ...rest } = c.props;
    return { ...c, props: labels.length > 0 ? { ...rest, labels } : rest };
  });
}

/** 改變兩腳元件的跨距；新的位置有硬性問題（例如超出板子、腳插到別人的孔）時回傳 null。 */
export function setComponentSpan(circuit: Circuit, id: string, span: number): Circuit | null {
  const instance = circuit.components.find((c) => c.id === id);
  if (!instance || !Number.isInteger(span)) return null;
  const def = definitionOf(instance.defId);
  if (def.package.type !== 'two-lead' || span < def.package.minSpan) return null;
  const next: ComponentInstance = { ...instance, span };
  if (!checkPlacement(circuit, next).ok) return null;
  return updateComponent(circuit, id, () => next);
}

/** 切換指撥開關第 index 個開關（0 起算）。只是狀態，不影響 Net 與佈線。 */
export function toggleSwitch(circuit: Circuit, id: string, index: number): Circuit {
  const instance = circuit.components.find((c) => c.id === id);
  if (!instance) return circuit;
  const def = definitionOf(instance.defId);
  const current = instance.props.switchStates ?? def.defaultProps.switchStates ?? [];
  if (index < 0 || index >= current.length) return circuit;
  const switchStates = current.map((on, i) => (i === index ? !on : on));
  return updateComponentProps(circuit, id, { switchStates });
}

/** 手動接線：兩孔之間的一條直線導線（可以斜）。 */
export function addWire(circuit: Circuit, start: GridPoint, end: GridPoint, color: string): { circuit: Circuit; id: string } {
  const id = nextWireId(circuit);
  const a = { boardId: start.boardId, x: start.x, y: start.y };
  const b = { boardId: end.boardId, x: end.x, y: end.y };
  const wire: Wire = { id, color, source: 'manual', straight: true, start: a, end: b, path: [{ ...a }, { ...b }] };
  return { circuit: { ...circuit, wires: [...circuit.wires, wire] }, id };
}

/** 拖曳端點：這條線改成直線，which 那一端換到 point；顏色與 ID 不變，來源變成手動。 */
export function moveWireEnd(circuit: Circuit, id: string, which: 'start' | 'end', point: GridPoint): Circuit {
  const w = circuit.wires.find((x) => x.id === id);
  if (!w) return circuit;
  const p = { boardId: point.boardId, x: point.x, y: point.y };
  const start = which === 'start' ? p : { ...w.start };
  const end = which === 'end' ? p : { ...w.end };
  const moved: Wire = { id: w.id, color: w.color, source: 'manual', straight: true, start, end, path: [{ ...start }, { ...end }] };
  return { ...circuit, wires: circuit.wires.map((x) => (x.id === id ? moved : x)) };
}

export function setWireColor(circuit: Circuit, ids: string[], color: string): Circuit {
  const set = new Set(ids);
  return { ...circuit, wires: circuit.wires.map((w) => (set.has(w.id) ? { ...w, color } : w)) };
}

export function replaceWires(circuit: Circuit, wires: Wire[]): Circuit {
  return { ...circuit, wires };
}
