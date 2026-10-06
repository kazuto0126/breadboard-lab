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

export function moveComponent(circuit: Circuit, id: string, anchor: { x: number; y: number }, rotation?: Rotation): Circuit {
  return updateComponent(circuit, id, (c) => ({ ...c, anchor: { x: anchor.x, y: anchor.y }, rotation: rotation ?? c.rotation }));
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

export function addWire(circuit: Circuit, path: GridPoint[], color: string): { circuit: Circuit; id: string } {
  if (path.length < 2) throw new Error('A wire needs at least two points');
  const id = nextWireId(circuit);
  const copy = path.map((p) => ({ boardId: p.boardId, x: p.x, y: p.y }));
  const wire: Wire = { id, color, source: 'manual', start: { ...copy[0] }, end: { ...copy[copy.length - 1] }, path: copy };
  return { circuit: { ...circuit, wires: [...circuit.wires, wire] }, id };
}

export function setWireColor(circuit: Circuit, ids: string[], color: string): Circuit {
  const set = new Set(ids);
  return { ...circuit, wires: circuit.wires.map((w) => (set.has(w.id) ? { ...w, color } : w)) };
}

export function replaceWires(circuit: Circuit, wires: Wire[]): Circuit {
  return { ...circuit, wires };
}
