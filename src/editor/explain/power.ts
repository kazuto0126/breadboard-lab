import type { Circuit, CircuitError } from '../../types/circuit';
import type { GridPoint } from '../../types/geometry';
import { ISSUE_TEXT } from './generic';
import {
  chooseRail, explanation, freeHolesInGroup, pinAt, pinLabel, postHole, RAIL_TEXT, railHole, step, wireToRail,
  type PinHit, type Rail,
} from './helpers';
import type { ExplainStep, Explanation } from './types';

interface Connection {
  steps: ExplainStep[];
  wires: GridPoint[][];
  /** 起點（那一排的空孔）；那一排插滿時是 null。 */
  from: GridPoint | null;
}

/**
 * 規格第 3 節：把一隻腳接到某個極性的電源軌。沒有那種電源時先放一個（那個孔不再當導線終點）；
 * lead / tail 是接在拉線那一步前後的文字。
 */
function connectToRail(circuit: Circuit, hit: PinHit, polarity: '+' | '-', lead = '', tail = ''): Connection {
  const { rail, powered } = chooseRail(circuit, hit.point, polarity);
  const steps: ExplainStep[] = [];
  const exclude: GridPoint[] = [];
  if (!powered) {
    const source = polarity === '+' ? 'VCC' : 'GND';
    const post = postHole(circuit, hit.point.boardId, polarity === '+' ? 'vcc' : 'gnd');
    const at = railHole(circuit, hit.point.boardId, rail, post?.x ?? 0);
    if (at) exclude.push(at);
    if (post && at) steps.push(step(`${lead}先從${polarity === '+' ? '紅' : '黑'}色接線柱 {0} 拉一條線到${RAIL_TEXT[rail]} {1}。`, post, at));
    else steps.push(at ? step(`${lead}先從元件庫放一個 ${source} 到${RAIL_TEXT[rail]}，例如 {0}。`, at) : step(`${lead}先從元件庫放一個 ${source} 到${RAIL_TEXT[rail]}。`));
    lead = '';
  }
  if (freeHolesInGroup(circuit, hit.point).length === 0) {
    steps.push(step(`${lead}${pinLabel(hit)}那一排已經沒有空孔，請先移開那一排上的導線或元件，再拉線到${RAIL_TEXT[rail]}。`));
    return { steps, wires: [], from: null };
  }
  const plan = wireToRail(circuit, hit.point, rail as Rail, exclude);
  if (!plan) {
    steps.push(step(`${lead}${RAIL_TEXT[rail]}已經沒有空孔，請先移開軌上的導線。`));
    return { steps, wires: [], from: null };
  }
  steps.push(step(`${lead}從 ${pinLabel(hit)}那一排的空孔 {0}，拉一條線到${RAIL_TEXT[rail]} {1}${tail}。`, plan.from, plan.to));
  return { steps, wires: [plan.path], from: plan.from };
}

export function explainPowerMissing(circuit: Circuit, issue: CircuitError): Explanation {
  const hit = pinAt(circuit, issue.points[0]);
  const { steps, wires } = connectToRail(circuit, hit, hit.pin.role === 'ground' ? '-' : '+');
  return explanation(ISSUE_TEXT.IC_POWER_MISSING.why, steps, wires);
}

export function explainNoPowerSource(circuit: Circuit): Explanation {
  const boardId = circuit.components[0]?.boardId ?? circuit.boards[0].id;
  const red = postHole(circuit, boardId, 'vcc');
  const black = postHole(circuit, boardId, 'gnd');
  if (red && black) {
    const plus = chooseRail(circuit, red, '+').rail;
    const minus = chooseRail(circuit, black, '-').rail;
    const toPlus = railHole(circuit, boardId, plus, red.x);
    const toMinus = railHole(circuit, boardId, minus, black.x);
    return explanation(ISSUE_TEXT.NO_POWER_SOURCE.why, [
      toPlus ? step(`從紅色接線柱 {0} 拉一條線到${RAIL_TEXT[plus]} {1}（紅柱接電源供應器的 +5 V）。`, red, toPlus) : step('從紅色接線柱拉一條線到 + 電源軌。'),
      toMinus ? step(`從黑色接線柱 {0} 拉一條線到${RAIL_TEXT[minus]} {1}（黑柱接電源供應器的 GND）。`, black, toMinus) : step('從黑色接線柱拉一條線到 − 電源軌。'),
      step('再把 IC 的 VCC 腳接到 + 軌、GND 腳接到 − 軌；其他元件也從這兩條軌拿電。'),
    ]);
  }
  // MB-102：放 VCC / GND 符號。
  const vcc = railHole(circuit, boardId, 'T+', 0);
  const gnd = railHole(circuit, boardId, 'B-', 0);
  return explanation(ISSUE_TEXT.NO_POWER_SOURCE.why, [
    vcc ? step('從元件庫放一個 VCC 到上方的 + 電源軌，例如 {0}。', vcc) : step('從元件庫放一個 VCC 到 + 電源軌。'),
    gnd ? step('從元件庫放一個 GND 到下方的 − 電源軌，例如 {0}。', gnd) : step('從元件庫放一個 GND 到 − 電源軌。'),
    step('再把 IC 的 VCC 腳接到 + 軌、GND 腳接到 − 軌；其他元件也從這兩條軌拿電。'),
  ]);
}

export function explainInputFloating(circuit: Circuit, issue: CircuitError): Explanation {
  const hit = pinAt(circuit, issue.points[0]);
  const tie = connectToRail(circuit, hit, '+', '如果用不到：', '，讓它固定是 HIGH');
  if (!tie.from) return explanation(ISSUE_TEXT.INPUT_FLOATING.why, tie.steps, tie.wires);
  const use = step('如果這隻腳要用：從 {0} 拉線到開關，或其他閘的輸出腳所在的那一排。', tie.from);
  return explanation(ISSUE_TEXT.INPUT_FLOATING.why, [use, ...tie.steps], tie.wires);
}
