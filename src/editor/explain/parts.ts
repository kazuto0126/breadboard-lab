import type { Circuit, CircuitError } from '../../types/circuit';
import { getComponentDefinition } from '../../core/circuit/library';
import type { ComponentInstance } from '../../types/component';
import type { GridPoint } from '../../types/geometry';
import { groupIdAt } from '../analysis';
import { straightWireProblem } from '../manualWire';
import { checkPlacement } from '../placement';
import { ISSUE_TEXT } from './generic';
import {
  chooseRail, explanation, freeHolesInGroup, groupIsEmpty, pinAt, pinCountInGroup, pinLabel, pinOfRole, RAIL_TEXT, railHole, samePoint, step, wirePlanStep, wireToRail,
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

/** 這個錯誤是不是 7 段顯示器的（共用 LED 的錯誤代碼，但修法不同）。 */
function isSevenSeg(circuit: Circuit, issue: CircuitError): boolean {
  const c = circuit.components.find((x) => x.id === issue.componentIds[0]);
  return !!c && getComponentDefinition(c.defId)?.category === 'seven-seg';
}

export function explainLedReversed(circuit: Circuit, issue: CircuitError): Explanation {
  if (isSevenSeg(circuit, issue)) {
    return explanation('共陽極 7 段顯示器的共陽極（CA，第 3、8 腳）要接 VCC，各段再經電阻接到低電位才會亮；CA 接到 GND 時整個顯示器都不會亮。', [
      step('把接在共陽極 {0} 那一排、通到 GND 的線拔掉，改從那一排的空孔拉到 VCC（+ 電源軌）。顯示器本身不用轉向。', issue.points[0]),
    ]);
  }
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
  if (isSevenSeg(circuit, issue)) {
    return explanation('7 段顯示器的每一段都是一顆 LED，直接接到 74LS47 或 GND 電流太大，會燒掉那一段或 IC 的輸出腳；每一段都要各串一顆電阻。', [
      step('在每一段（a–g，有用到小數點也算）和 74LS47 的輸出之間各串一顆 330 Ω 電阻：電阻一腳插在段那一排，另一腳插到新的一排，原本接段的線改接到新的那一排。'),
    ]);
  }
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
      // 改插的孔：直線拉到另一端要符合手動接線的規則。
      const targets = freeHolesInGroup(without, spot.far)
        .filter((p) => !used.some((u) => samePoint(u, p)))
        .sort((a, b) => distance(a, other) - distance(b, other) || a.y - b.y || a.x - b.x);
      const target = targets.find((p) => !straightWireProblem(without, p, other));
      // 子專案 39：只改插一端會變成斜線（或交叉）時，另一端也換到同一排（同一條軌）對齊的空孔，整條換成直的。
      const moved: [GridPoint, GridPoint] | null = target
        ? [target, other]
        : targets
            .flatMap((p) => freeHolesInGroup(without, other).filter((q) => q.x === p.x || q.y === p.y).map((q): [GridPoint, GridPoint] => [p, q]))
            .find(([p, q]) => !straightWireProblem(without, p, q)) ?? null;
      if (!moved) return fallback;
      used.push(moved[0]);
      if (samePoint(moved[1], other)) steps.push(step(`把 ${w.id} 插在 {0} 的那一端拔起來，改插到 {1}。`, end, moved[0]));
      else steps.push(step(`把 ${w.id} 拔起來，改成從 {0} 接到 {1}。`, moved[0], moved[1]));
      removeWireIds.push(w.id);
      wires.push(moved);
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
  steps.push(wirePlanStep(plan, '電阻另一腳那一排', RAIL_TEXT[rail]));
  return explanation(why, steps, plan.wires.map(([a, b]) => [a, b]));
}
