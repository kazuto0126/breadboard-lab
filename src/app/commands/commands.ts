import { getComponentDefinition } from '../../core/circuit/library';
import { applyRouting } from '../../core/routing/apply';
import type { Circuit, Wire } from '../../types/circuit';
import type { ComponentDefinition, ComponentInstance, ComponentProps, LedColor, Rotation } from '../../types/component';
import type { GridPoint } from '../../types/geometry';
import type { RoutingResult } from '../../types/routing';
import { checkPlacement, isFreeHole } from '../geometry/placement';
import { rotateClockwise } from '../geometry/rotate';
import { snapAnchor } from '../geometry/snap';
import { flippedPath, lPath } from '../geometry/wirePath';
import type { Selection } from '../model/editorTypes';
import { nextComponentId, nextWireId } from '../model/ids';
import { BOARD_ID, circuitSignature, type ProjectFile } from '../model/projectFile';

export type CommandResult = { ok: true; doc: ProjectFile; select?: Selection | null } | { ok: false; reason: string };

const fail = (reason: string): CommandResult => ({ ok: false, reason });
const withCircuit = (doc: ProjectFile, circuit: Circuit): ProjectFile => ({ ...doc, circuit });
const samePoint = (a: GridPoint, b: GridPoint) => a.boardId === b.boardId && a.x === b.x && a.y === b.y;

export function placeComponent(
  doc: ProjectFile,
  defId: string,
  anchor: { x: number; y: number },
  props: ComponentProps = {},
  rotation: Rotation = 0,
): CommandResult {
  const def = getComponentDefinition(defId);
  if (!def) return fail(`未知的元件 ${defId}`);
  const instance: ComponentInstance = {
    id: nextComponentId(doc.circuit, def.category),
    defId,
    boardId: BOARD_ID,
    anchor: snapAnchor(def, rotation, anchor),
    rotation,
    props: { ...props },
  };
  const check = checkPlacement(doc.circuit, instance);
  if (!check.ok) return fail(check.reason);
  return {
    ok: true,
    doc: withCircuit(doc, { ...doc.circuit, components: [...doc.circuit.components, instance] }),
    select: { kind: 'component', id: instance.id },
  };
}

function updateComponent(
  doc: ProjectFile,
  id: string,
  update: (current: ComponentInstance, def: ComponentDefinition) => ComponentInstance | string,
): CommandResult {
  const current = doc.circuit.components.find((c) => c.id === id);
  if (!current) return fail(`找不到元件 ${id}`);
  const def = getComponentDefinition(current.defId);
  if (!def) return fail(`未知的元件 ${current.defId}`);
  const next = update(current, def);
  if (typeof next === 'string') return fail(next);
  const check = checkPlacement(doc.circuit, next, id);
  if (!check.ok) return fail(check.reason);
  return {
    ok: true,
    doc: withCircuit(doc, { ...doc.circuit, components: doc.circuit.components.map((c) => (c.id === id ? next : c)) }),
  };
}

export function moveComponent(doc: ProjectFile, id: string, anchor: { x: number; y: number }): CommandResult {
  return updateComponent(doc, id, (c, def) => ({ ...c, anchor: snapAnchor(def, c.rotation, anchor) }));
}

export function rotateComponent(doc: ProjectFile, id: string): CommandResult {
  return updateComponent(doc, id, (c, def) => rotateClockwise(c, def));
}

export function deleteComponent(doc: ProjectFile, id: string): CommandResult {
  if (!doc.circuit.components.some((c) => c.id === id)) return fail(`找不到元件 ${id}`);
  return {
    ok: true,
    doc: withCircuit(doc, { ...doc.circuit, components: doc.circuit.components.filter((c) => c.id !== id) }),
    select: null,
  };
}

export function deleteWire(doc: ProjectFile, id: string): CommandResult {
  if (!doc.circuit.wires.some((w) => w.id === id)) return fail(`找不到導線 ${id}`);
  return { ok: true, doc: withCircuit(doc, { ...doc.circuit, wires: doc.circuit.wires.filter((w) => w.id !== id) }), select: null };
}

export function addWire(doc: ProjectFile, start: GridPoint, end: GridPoint, horizontalFirst: boolean, color: string): CommandResult {
  if (samePoint(start, end)) return fail('起點和終點不能是同一個孔');
  if (!isFreeHole(doc.circuit, start)) return fail('起點要接在空孔上');
  if (!isFreeHole(doc.circuit, end)) return fail('終點要接在空孔上');
  const wire: Wire = {
    id: nextWireId(doc.circuit),
    color,
    source: 'manual',
    start,
    end,
    path: lPath(start, end, horizontalFirst),
  };
  return {
    ok: true,
    doc: withCircuit(doc, { ...doc.circuit, wires: [...doc.circuit.wires, wire] }),
    select: { kind: 'wire', id: wire.id },
  };
}

export function flipWire(doc: ProjectFile, id: string): CommandResult {
  const wire = doc.circuit.wires.find((w) => w.id === id);
  if (!wire) return fail(`找不到導線 ${id}`);
  const path = flippedPath(wire);
  if (!path) return fail('只有一個轉角的導線才能翻轉');
  return { ok: true, doc: withCircuit(doc, { ...doc.circuit, wires: doc.circuit.wires.map((w) => (w.id === id ? { ...w, path } : w)) }) };
}

export interface PropsPatch {
  resistance?: number;
  color?: LedColor;
  voltage?: number;
  span?: number;
}

export function updateComponentProps(doc: ProjectFile, id: string, patch: PropsPatch): CommandResult {
  return updateComponent(doc, id, (c, def) => {
    if (patch.span !== undefined && (def.package.type !== 'two-lead' || !Number.isInteger(patch.span))) {
      return '只有兩腳元件可以調整兩腳距離';
    }
    if (patch.voltage !== undefined && !(patch.voltage > 0)) return '電壓必須大於 0';
    const next: ComponentInstance = { ...c, props: { ...c.props } };
    if (patch.resistance !== undefined) next.props.resistance = patch.resistance;
    if (patch.color !== undefined) next.props.color = patch.color;
    if (patch.voltage !== undefined) next.props.voltage = patch.voltage;
    if (patch.span !== undefined) next.span = patch.span;
    return next;
  });
}

export function applyRoutingResult(doc: ProjectFile, result: RoutingResult, beforeScore: number): CommandResult {
  if (result.status !== 'success') return fail('只有完整成功的佈線結果才能套用');
  const circuit = applyRouting(doc.circuit, result);
  return {
    ok: true,
    doc: {
      ...doc,
      circuit,
      routing: {
        before: doc.circuit.wires,
        beforeScore,
        metrics: result.metrics,
        score: result.score,
        signature: circuitSignature(circuit),
        checklist: {},
      },
    },
    select: null,
  };
}

export function setChecklistItem(doc: ProjectFile, wireId: string, done: boolean): ProjectFile {
  if (!doc.routing) return doc;
  return { ...doc, routing: { ...doc.routing, checklist: { ...doc.routing.checklist, [wireId]: done } } };
}

export function clearChecklist(doc: ProjectFile): ProjectFile {
  if (!doc.routing) return doc;
  return { ...doc, routing: { ...doc.routing, checklist: {} } };
}
