import { nodeIdOf } from '../../core/breadboard/naming';
import { getBoard } from '../../core/breadboard/registry';
import { resolveFootprint } from '../../core/circuit/footprint';
import { getComponentDefinition } from '../../core/circuit/library';
import type { Circuit, PinRef } from '../../types/circuit';
import type { ComponentDefinition, ComponentInstance, PinDefinition, PinRole } from '../../types/component';
import type { GridPoint } from '../../types/geometry';
import { analyzeCircuit, groupIdAt, holeLabel, occupancyOf } from '../analysis';
import { isFreeHoleWith, planWirePath } from '../manualWire';
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

export type Rail = 'T+' | 'T-' | 'B+' | 'B-';

export const RAIL_TEXT: Record<Rail, string> = {
  'T+': '上方的 + 電源軌',
  'T-': '上方的 − 電源軌',
  'B+': '下方的 + 電源軌',
  'B-': '下方的 − 電源軌',
};

const railGroupId = (boardId: string, rail: Rail) => `${boardId}:rail-${rail}`;

/** 這條電源軌所在的 Net 有沒有 role 這種電源腳（vcc-source / gnd-source）。 */
export function railCarries(circuit: Circuit, boardId: string, rail: Rail, role: PinRole): boolean {
  const net = analyzeCircuit(circuit).netByGroup.get(railGroupId(boardId, rail));
  return net !== undefined && net.pins.some((ref) => roleOf(circuit, ref) === role);
}

/** 規格第 3 節：上半部（A–E）用上方的軌、下半部用下方的軌；那條沒電而另一條同極性的有電時改用另一條。 */
export function chooseRail(circuit: Circuit, point: GridPoint, polarity: '+' | '-'): { rail: Rail; powered: boolean } {
  const role: PinRole = polarity === '+' ? 'vcc-source' : 'gnd-source';
  const top = point.y < 10;
  const near = `${top ? 'T' : 'B'}${polarity}` as Rail;
  const far = `${top ? 'B' : 'T'}${polarity}` as Rail;
  if (railCarries(circuit, point.boardId, near, role)) return { rail: near, powered: true };
  if (railCarries(circuit, point.boardId, far, role)) return { rail: far, powered: true };
  return { rail: near, powered: false };
}

/** 電源軌上和 x 最接近的空孔（同距離選 x 較小的）。 */
export function railHole(circuit: Circuit, boardId: string, rail: Rail, x: number, exclude: GridPoint[] = []): GridPoint | null {
  const occ = occupancyOf(circuit, boardId);
  const holes = holesOfGroup(circuit, boardId, railGroupId(boardId, rail)).filter(
    (p) => isFreeHoleWith(occ, p) && !exclude.some((e) => samePoint(e, p)),
  );
  holes.sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x) || a.x - b.x);
  return holes[0] ?? null;
}

export interface WirePlan {
  from: GridPoint;
  to: GridPoint;
  path: GridPoint[];
}

/** 從 point 那一排最靠近目標軌的空孔，拉到軌上 x 最接近的空孔。那一排或那條軌沒有空孔時回傳 null。 */
export function wireToRail(circuit: Circuit, point: GridPoint, rail: Rail, exclude: GridPoint[] = []): WirePlan | null {
  const holes = freeHolesInGroup(circuit, point);
  if (holes.length === 0) return null;
  const from = rail.startsWith('T') ? holes[0] : holes[holes.length - 1];
  const to = railHole(circuit, point.boardId, rail, from.x, exclude);
  return to ? { from, to, path: planWirePath(circuit, from, to, 'v') } : null;
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
