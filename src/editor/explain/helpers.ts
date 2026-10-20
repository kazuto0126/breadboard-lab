import { nodeIdOf } from '../../core/breadboard/naming';
import { getBoard, getLayout } from '../../core/breadboard/registry';
import { resolveFootprint } from '../../core/circuit/footprint';
import { getComponentDefinition } from '../../core/circuit/library';
import type { RailLabel } from '../../types/board';
import type { Circuit, PinRef, Wire } from '../../types/circuit';
import type { ComponentDefinition, ComponentInstance, PinDefinition, PinRole } from '../../types/component';
import type { GridPoint } from '../../types/geometry';
import { analyzeCircuit, groupIdAt, holeLabel, occupancyOf } from '../analysis';
import { isFreeHoleWith, straightWireProblem } from '../manualWire';
import type { ExplainStep, Explanation } from './types';

export interface PinHit {
  instance: ComponentInstance;
  def: ComponentDefinition;
  pin: PinDefinition;
  point: GridPoint;
}

export function samePoint(a: GridPoint, b: GridPoint): boolean {
  return a.boardId === b.boardId && a.x === b.x && a.y === b.y;
}

function hitOf(instance: ComponentInstance, def: ComponentDefinition, pinNumber: number): PinHit | null {
  const pin = def.pins.find((p) => p.number === pinNumber);
  const point = resolveFootprint(instance, def).pins.find((p) => p.pinNumber === pinNumber)?.point;
  return pin && point ? { instance, def, pin, point } : null;
}

/** 插在 point 的元件腳；沒有時丟出例外（explainIssue 會退回通用說明）。 */
export function pinAt(circuit: Circuit, point: GridPoint | undefined): PinHit {
  if (point) {
    for (const instance of circuit.components) {
      const def = getComponentDefinition(instance.defId);
      const fp = def && resolveFootprint(instance, def).pins.find((p) => samePoint(p.point, point));
      const hit = def && fp ? hitOf(instance, def, fp.pinNumber) : null;
      if (hit) return hit;
    }
  }
  throw new Error('No component pin at the issue point');
}

/** 同一個元件上某種角色的腳（例如 LED 的陰極）。 */
export function pinOfRole(hit: PinHit, role: PinRole): PinHit {
  const pin = hit.def.pins.find((p) => p.role === role);
  const other = pin ? hitOf(hit.instance, hit.def, pin.number) : null;
  if (!other) throw new Error(`No ${role} pin on ${hit.instance.id}`);
  return other;
}

export function pinLabel(hit: PinHit): string {
  return `${hit.instance.id} 第 ${hit.pin.number} 腳（${hit.pin.name}）`;
}

export function roleOf(circuit: Circuit, ref: PinRef): PinRole | undefined {
  const instance = circuit.components.find((c) => c.id === ref.componentId);
  return instance ? getComponentDefinition(instance.defId)?.pins.find((p) => p.number === ref.pinNumber)?.role : undefined;
}

function holesOfGroup(circuit: Circuit, boardId: string, groupId: string): GridPoint[] {
  const instance = circuit.boards.find((b) => b.id === boardId);
  if (!instance) return [];
  return getBoard(instance.layoutId, instance.id)
    .nodes.filter((n) => n.groupId === groupId && n.kind === 'hole')
    .map((n) => ({ boardId, x: n.x, y: n.y }));
}

/** 和 point 同一條導通排的空孔（沒有腳、沒被蓋住、沒有導線端點或經過），依 y、x 排序。 */
export function freeHolesInGroup(circuit: Circuit, point: GridPoint): GridPoint[] {
  const groupId = groupIdAt(circuit, point);
  if (!groupId) return [];
  const occ = occupancyOf(circuit, point.boardId);
  return holesOfGroup(circuit, point.boardId, groupId)
    .filter((p) => isFreeHoleWith(occ, p))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

/** point 所在的那一排整排沒有任何元件腳與導線端點（新的一排，不會接到別的東西）。 */
export function groupIsEmpty(circuit: Circuit, point: GridPoint): boolean {
  const groupId = groupIdAt(circuit, point);
  if (!groupId) return false;
  const occ = occupancyOf(circuit, point.boardId);
  return holesOfGroup(circuit, point.boardId, groupId).every((p) => !occ.pins.has(nodeIdOf(p)) && !occ.wireEnds.has(nodeIdOf(p)));
}

/** point 所在的那一排插了幾隻元件腳。 */
export function pinCountInGroup(circuit: Circuit, point: GridPoint): number {
  const groupId = groupIdAt(circuit, point);
  if (!groupId) return 0;
  const occ = occupancyOf(circuit, point.boardId);
  return holesOfGroup(circuit, point.boardId, groupId).filter((p) => occ.pins.has(nodeIdOf(p))).length;
}

export type Rail = RailLabel;

/** 電源軌的說法：MB-102 是「上方的 + 電源軌」，EIC-1106 是「P3 的 + 電源軌」。 */
export const RAIL_TEXT: Record<Rail, string> = {
  'T+': '上方的 + 電源軌',
  'T-': '上方的 − 電源軌',
  'B+': '下方的 + 電源軌',
  'B-': '下方的 − 電源軌',
  ...Object.fromEntries([1, 2, 3, 4, 5].flatMap((n) => [[`P${n}+`, `P${n} 的 + 電源軌`], [`P${n}-`, `P${n} 的 − 電源軌`]])),
} as Record<Rail, string>;

const railGroupId = (boardId: string, rail: Rail) => `${boardId}:rail-${rail}`;

/** 這條電源軌所在的 Net 有沒有 role 這種電源腳（vcc-source / gnd-source）。 */
export function railCarries(circuit: Circuit, boardId: string, rail: Rail, role: PinRole): boolean {
  const net = analyzeCircuit(circuit).netByGroup.get(railGroupId(boardId, rail));
  if (!net) return false;
  const source = role === 'vcc-source' ? 'vcc' : 'gnd';
  return net.pins.some((ref) => roleOf(circuit, ref) === role) || net.groupIds.some((g) => groupSourceOf(circuit, g) === source);
}

/** 群組是不是接線柱電源（EIC-1106 的紅 = vcc、黑 = gnd）。 */
function groupSourceOf(circuit: Circuit, groupId: string): 'vcc' | 'gnd' | undefined {
  const instance = circuit.boards.find((b) => b.id === groupId.slice(0, groupId.indexOf(':')));
  return instance ? getBoard(instance.layoutId, instance.id).groups[groupId]?.source : undefined;
}

/** 這塊板上某個極性的電源軌，依和 y 的距離排序（同距離上面的先）。 */
function railsNear(circuit: Circuit, boardId: string, polarity: '+' | '-', y: number): Array<{ rail: Rail; y: number }> {
  const instance = circuit.boards.find((b) => b.id === boardId);
  if (!instance) return [];
  return getLayout(instance.layoutId)
    .rows.flatMap((r) => (r.kind === 'rail' && r.label.endsWith(polarity) ? [{ rail: r.label, y: r.y }] : []))
    .sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y) || a.y - b.y);
}

/**
 * 規格第 3 節：用離那一排最近的同極性電源軌（MB-102：上半部用上方的軌、下半部用下方的軌）；
 * 有電的軌優先，都沒電時用最近的那條。
 */
export function chooseRail(circuit: Circuit, point: GridPoint, polarity: '+' | '-'): { rail: Rail; powered: boolean } {
  const role: PinRole = polarity === '+' ? 'vcc-source' : 'gnd-source';
  const rails = railsNear(circuit, point.boardId, polarity, point.y);
  const powered = rails.find((r) => railCarries(circuit, point.boardId, r.rail, role));
  if (powered) return { rail: powered.rail, powered: true };
  return { rail: rails[0]?.rail ?? (polarity === '+' ? 'T+' : 'B-'), powered: false };
}

/** 接線柱的孔（EIC-1106 的紅 = vcc、黑 = gnd）；板上沒有接線柱時回傳 null。 */
export function postHole(circuit: Circuit, boardId: string, source: 'vcc' | 'gnd'): GridPoint | null {
  const instance = circuit.boards.find((b) => b.id === boardId);
  const post = instance ? getLayout(instance.layoutId).posts?.find((p) => p.source === source) : undefined;
  return post ? { boardId, x: post.x, y: post.y } : null;
}

/** 電源軌上的空孔，依和 x 的距離排序（同距離 x 小的先）。 */
export function railHoles(circuit: Circuit, boardId: string, rail: Rail, x: number, exclude: GridPoint[] = []): GridPoint[] {
  const occ = occupancyOf(circuit, boardId);
  return holesOfGroup(circuit, boardId, railGroupId(boardId, rail))
    .filter((p) => isFreeHoleWith(occ, p) && !exclude.some((e) => samePoint(e, p)))
    .sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x) || a.x - b.x);
}

/** 電源軌上和 x 最接近的空孔（同距離選 x 較小的）。 */
export function railHole(circuit: Circuit, boardId: string, rail: Rail, x: number, exclude: GridPoint[] = []): GridPoint | null {
  return railHoles(circuit, boardId, rail, x, exclude)[0] ?? null;
}

export interface WirePlan {
  /** 那一排的空孔（第一條線的起點）。 */
  from: GridPoint;
  /** 軌上的孔（最後一條線的終點）。 */
  to: GridPoint;
  /** 要接的線（每條是兩端）：一條直線接得到時一條；要轉彎時兩條，中間經過一排空的孔。 */
  wires: Array<[GridPoint, GridPoint]>;
}

/** 建議的第一條線（還沒真的接上；放進電路裡，用來檢查第二條線會不會和它衝突）。 */
const suggested = (a: GridPoint, b: GridPoint): Wire => ({ id: '__suggested__', color: '', source: 'manual', straight: true, start: a, end: b, path: [a, b] });

/**
 * 從 point 那一排的空孔拉線到軌上的空孔：靠近軌的孔先試、軌上 x 近的先試，線要符合手動接線的規則。
 * 子專案 39（規格 2026-10-20 wiring-rules）：線只能水平或垂直、不能交叉、不能跨過 IC。一條直線接不到時（例如中間隔著 IC），
 * 先橫著接到旁邊一排空的孔（左右 4 欄內），再從那一排直的接到軌，挑總長最短的。找不到時回傳 null。
 */
export function wireToRail(circuit: Circuit, point: GridPoint, rail: Rail, exclude: GridPoint[] = []): WirePlan | null {
  const holes = freeHolesInGroup(circuit, point);
  const railY = railsNear(circuit, point.boardId, rail.endsWith('+') ? '+' : '-', point.y).find((r) => r.rail === rail)?.y ?? 0;
  const ordered = railY < point.y ? holes : [...holes].reverse();
  const toRail = (c: Circuit, from: GridPoint) =>
    railHoles(c, from.boardId, rail, from.x, exclude)
      .slice(0, 8)
      .find((to) => !straightWireProblem(c, from, to)) ?? null;
  for (const from of ordered) {
    const to = toRail(circuit, from);
    if (to) return { from, to, wires: [[from, to]] };
  }
  let best: WirePlan | null = null;
  let bestLength = Infinity;
  for (const from of ordered) {
    for (const dx of [-1, 1, -2, 2, -3, 3, -4, 4]) {
      const mid = { boardId: from.boardId, x: from.x + dx, y: from.y };
      if (!groupIdAt(circuit, mid) || !groupIsEmpty(circuit, mid) || straightWireProblem(circuit, from, mid)) continue;
      const withFirst: Circuit = { ...circuit, wires: [...circuit.wires, suggested(from, mid)] };
      for (const via of freeHolesInGroup(withFirst, mid)) {
        const to = toRail(withFirst, via);
        const length = Math.abs(dx) + (to ? Math.abs(to.y - via.y) + Math.abs(to.x - via.x) : 0);
        if (to && length < bestLength) {
          best = { from, to, wires: [[from, mid], [via, to]] };
          bestLength = length;
        }
      }
    }
  }
  return best;
}

/** 子專案 39：WirePlan 的那一步怎麼說（一條線，或轉彎的兩條線）；fromText 是「從」後面的說法（英文開頭時前面加空白），lead / tail 接在前後。 */
export function wirePlanStep(plan: WirePlan, fromText: string, railText: string, lead = '', tail = ''): ExplainStep {
  if (plan.wires.length === 1) return step(`${lead}從${fromText}的空孔 {0}，拉一條線到${railText} {1}${tail}。`, plan.from, plan.to);
  const [[a, b], [c, d]] = plan.wires;
  return step(`${lead}從${fromText}的空孔 {0} 拉一條線到旁邊空的一排 {1}，再從那一排的 {2} 拉一條線到${railText} {3}${tail}。`, a, b, c, d);
}

export function step(text: string, ...holes: GridPoint[]): ExplainStep {
  return { text, holes };
}

export function explanation(why: string, steps: ExplainStep[], wires: GridPoint[][] = [], removeWireIds: string[] = []): Explanation {
  const holes: GridPoint[] = [];
  for (const s of steps) for (const h of s.holes) if (!holes.some((x) => samePoint(x, h))) holes.push(h);
  return { why, steps, holes, wires, removeWireIds };
}

/** 把步驟裡的 {0}、{1} 換成孔位名稱。 */
export function plainText(circuit: Circuit, s: ExplainStep): string {
  return s.text.replace(/\{(\d+)\}/g, (_, i: string) => {
    const p = s.holes[Number(i)];
    return p ? holeLabel(circuit, p) : '';
  });
}
