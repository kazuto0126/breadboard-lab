import type { Circuit, CircuitError } from '../../types/circuit';
import type { ComponentInstance } from '../../types/component';
import type { GridPoint } from '../../types/geometry';
import { groupIdAt } from '../analysis';
import { straightWireProblem } from '../manualWire';
import { checkPlacement } from '../placement';
import { ISSUE_TEXT } from './generic';
import {
  chooseRail, explanation, freeHolesInGroup, groupIsEmpty, pinAt, pinCountInGroup, pinLabel, pinOfRole, RAIL_TEXT, railHole, samePoint, step, wireToRail,
} from './helpers';
import type { ExplainStep, Explanation } from './types';

/** 離中間凹槽（第 9.5 列）近的先；同一列（例如電源軌）時離 near 近的先。 */
const byChannel = (near: GridPoint) => (a: GridPoint, b: GridPoint) =>
  Math.abs(a.y - 9.5) - Math.abs(b.y - 9.5) || Math.abs(a.x - near.x) - Math.abs(b.x - near.x) || a.x - b.x;
const distance = (a: GridPoint, b: GridPoint) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export function explainPinUnconnected(circuit: Circuit, issue: CircuitError): Explanation {
  const hit = pinAt(circuit, issue.points[0]);
  const free = freeHolesInGroup(circuit, hit.point).sort(byChannel(hit.point))[0];
  return explanation(ISSUE_TEXT.PIN_UNCONNECTED.why, [
    free
      ? step(`從 ${pinLabel(hit)}那一排的空孔 {0} 拉線到要接的地方（電源軌，或另一個元件的腳所在的那一排）。`, free)
      : step(`${pinLabel(hit)}那一排已經沒有空孔，請先移開那一排上的導線或元件。`),
  ]);
}

export function explainLedReversed(circuit: Circuit, issue: CircuitError): Explanation {
  const anode = pinAt(circuit, issue.points[0]);
  const cathode = pinOfRole(anode, 'cathode');
  return explanation(ISSUE_TEXT.LED_REVERSED.why, [
    step('陽極（A）現在在 {0}、陰極（K）在 {1}：實體 LED 拔起來轉半圈再插回去，讓陽極改插 {1}、陰極改插 {0}。', anode.point, cathode.point),
    step(`畫面上：選取 ${anode.instance.id} 後按 R 旋轉，直到陽極在 {0}、陰極在 {1}。`, cathode.point, anode.point),
  ]);
}

interface ResistorSpot {
  instance: ComponentInstance;
  near: GridPoint;
  far: GridPoint;
}

/** 規格第 3.2 節第 1 步：電阻一腳在陰極那一排的空孔、另一腳往右（再往左）4 格，放得下而且另一排整排空著。 */
function resistorSpot(circuit: Circuit, cathode: GridPoint): ResistorSpot | null {
  for (const near of freeHolesInGroup(circuit, cathode).sort(byChannel(cathode))) {
    for (const dir of [1, -1]) {
      const instance: ComponentInstance = {
        id: '__suggested_resistor__',
        defId: 'resistor',
        boardId: near.boardId,
        anchor: { x: near.x, y: near.y },
        rotation: dir > 0 ? 0 : 180,
        props: { resistance: 220 },
      };
      const far = { boardId: near.boardId, x: near.x + 4 * dir, y: near.y };
      if (!checkPlacement(circuit, instance).ok) continue;
      if (groupIdAt(circuit, far) === groupIdAt(circuit, near) || !groupIsEmpty(circuit, far)) continue;
      return { instance, near, far };
    }
  }
  return null;
}

export function explainLedNoResistor(circuit: Circuit, issue: CircuitError): Explanation {
  const anode = pinAt(circuit, issue.points[0]);
  const cathode = pinOfRole(anode, 'cathode');
  const why = ISSUE_TEXT.LED_NO_RESISTOR.why;
  const fallback = explanation(why, [step(`先把 ${anode.instance.id} 移到旁邊空的位置，再在陰極那一側串一顆 220 Ω 電阻。`)]);
  const cathodeGroup = groupIdAt(circuit, cathode.point);
  const spot = resistorSpot(circuit, cathode.point);
  if (!spot || !cathodeGroup) return fallback;

  const withResistor: Circuit = { ...circuit, components: [...circuit.components, spot.instance] };
  const steps: ExplainStep[] = [step('電阻（元件庫的 220Ω）一腳插在 LED 陰極那一排的 {0}，另一腳插在 {1}。', spot.near, spot.far)];
  const wires: GridPoint[][] = [];
  const removeWireIds: string[] = [];
  const inCathodeRow = (p: GridPoint) => groupIdAt(circuit, p) === cathodeGroup;
  const attached = circuit.wires.filter((w) => inCathodeRow(w.start) || inCathodeRow(w.end));

  if (attached.length > 0) {
    const used: GridPoint[] = [];
    for (const w of attached) {
      const end = inCathodeRow(w.start) ? w.start : w.end;
      const other = end === w.start ? w.end : w.start;
      const without: Circuit = { ...withResistor, wires: withResistor.wires.filter((x) => x.id !== w.id) };
      // 改插的孔：直線拉到另一端不能經過障礙（手動接線的規則）。
      const target = freeHolesInGroup(without, spot.far)
        .filter((p) => !used.some((u) => samePoint(u, p)))
        .sort((a, b) => distance(a, other) - distance(b, other) || a.y - b.y || a.x - b.x)
        .find((p) => !straightWireProblem(without, p, other));
      if (!target) return fallback;
      used.push(target);
      steps.push(step(`把 ${w.id} 插在 {0} 的那一端拔起來，改插到 {1}。`, end, target));
      removeWireIds.push(w.id);
      wires.push([target, other]);
    }
    return explanation(why, steps, wires, removeWireIds);
  }

  // 陰極那一排除了陰極自己還插著其他元件的腳：沒有導線可以改接，要先移開 LED。
  if (pinCountInGroup(circuit, cathode.point) > 1) return fallback;
  const { rail, powered } = chooseRail(withResistor, spot.far, '-');
  const plan = wireToRail(withResistor, spot.far, rail);
  if (!plan) return fallback;
  if (!powered) {
    const at = railHole(withResistor, spot.far.boardId, rail, 0, [plan.to]);
    if (at) steps.push(step(`先從元件庫放一個 GND 到${RAIL_TEXT[rail]}，例如 {0}。`, at));
  }
  steps.push(step(`從電阻另一腳那一排的空孔 {0}，拉一條線到${RAIL_TEXT[rail]} {1}。`, plan.from, plan.to));
  return explanation(why, steps, [plan.path]);
}
