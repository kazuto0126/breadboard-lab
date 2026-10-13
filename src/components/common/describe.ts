import { buildLattice } from '../../core/breadboard/lattice';
import { getNode } from '../../core/breadboard/naming';
import { getBoard } from '../../core/breadboard/registry';
import { cellsUnder, countBends, isStraight, wireLength } from '../../core/circuit/wireGeometry';
import { describeGroup } from '../../core/routing/problem';
import type { CircuitAnalysis } from '../../editor/analysis';
import { holeLabel, occupancyOf } from '../../editor/analysis';
import type { BoardGroup } from '../../types/board';
import type { Circuit, CircuitError, Wire } from '../../types/circuit';
import type { PinRole } from '../../types/component';
import type { GridPoint } from '../../types/geometry';
import type { FailureReason, IcMove, IcPlacement } from '../../types/routing';
import { getComponentDefinition } from '../../core/circuit/library';
import { resolveFootprint } from '../../core/circuit/footprint';

export const ROLE_NAMES: Record<PinRole, string> = {
  input: '輸入',
  output: '輸出',
  bidir: '雙向',
  power: '電源 VCC',
  ground: '接地 GND',
  nc: '未使用（NC）',
  passive: '被動',
  anode: '陽極 +',
  cathode: '陰極 −',
  'vcc-source': '電源端子',
  'gnd-source': '接地端子',
};

export { FAILURE_NAMES } from '../../editor/explain/routing';

export { holeLabel } from '../../editor/analysis';

/** 導通群組的說明；withBoard 為 true 時加上板子 ID（多塊板時使用）。 */
export function groupLabel(groupId: string | null, withBoard = false): string {
  return groupId ? describeGroup(groupId, withBoard) : '板面（沒有孔）';
}

/** 「Board Group 2 · 3 Boards」（需求文件 38.10）；index 從 0 起算。 */
export function boardGroupTitle(group: BoardGroup, index: number): string {
  return `Board Group ${index + 1} · ${group.boardIds.length} Boards`;
}

export function groupOf(circuit: Circuit, p: GridPoint): string | null {
  const instance = circuit.boards.find((b) => b.id === p.boardId);
  if (!instance) return null;
  return getNode(getBoard(instance.layoutId, instance.id), p.x, p.y)?.groupId ?? null;
}

export function pinLabel(circuit: Circuit, componentId: string, pinNumber: number): string {
  const c = circuit.components.find((x) => x.id === componentId);
  const def = c ? getComponentDefinition(c.defId) : undefined;
  const pin = def?.pins.find((p) => p.number === pinNumber);
  return pin ? `${componentId} 腳 ${pinNumber}（${pin.name}）` : `${componentId} 腳 ${pinNumber}`;
}

/** 孔上目前有什麼（給提示與屬性面板）。 */
export function holeContents(circuit: Circuit, p: GridPoint): string[] {
  const id = `${p.boardId}:${p.x},${p.y}`;
  const out: string[] = [];
  for (const c of circuit.components) {
    if (c.boardId !== p.boardId) continue;
    const def = getComponentDefinition(c.defId);
    if (!def) continue;
    const fp = resolveFootprint(c, def);
    const pin = fp.pins.find((x) => x.point.x === p.x && x.point.y === p.y);
    if (pin) out.push(`插著 ${pinLabel(circuit, c.id, pin.pinNumber)}`);
    else if (fp.blocked.some((b) => b.x === p.x && b.y === p.y)) out.push(`被 ${c.id}（${def.name}）的本體蓋住`);
  }
  for (const w of circuit.wires) {
    if (`${w.start.boardId}:${w.start.x},${w.start.y}` === id || `${w.end.boardId}:${w.end.x},${w.end.y}` === id) out.push(`導線 ${w.id} 的端點`);
    else if (cellsUnder(w, buildLattice(circuit.boards)).some((q) => q.boardId === p.boardId && q.x === p.x && q.y === p.y)) out.push(`導線 ${w.id} 從上面經過`);
  }
  const occ = occupancyOf(circuit, p.boardId);
  if (out.length === 0 && occ.board && getNode(occ.board, p.x, p.y)?.kind === 'hole') out.push('空孔：可以從這裡拖曳接線');
  return out;
}

export function wireSummary(wire: Wire, circuit: Pick<Circuit, 'boards'>): string {
  const lattice = buildLattice(circuit.boards);
  const boards = new Set(wire.path.map((p) => p.boardId));
  const across = boards.size > 1 ? ` · 跨 ${[...boards].join('、')}` : '';
  if (isStraight(wire)) return `直線 · ${Math.round(wireLength(wire, lattice) * 10) / 10} 格${across}`;
  return `${wire.path.length - 1} 格 · ${countBends(wire.path, lattice)} 個轉彎${across}`;
}

export function issuesAtPoint(analysis: CircuitAnalysis, p: GridPoint): CircuitError[] {
  return analysis.issues.filter(
    (e) => e.severity !== 'info' && e.points.some((q) => q.boardId === p.boardId && q.x === p.x && q.y === p.y),
  );
}

export function issuesOfComponent(analysis: CircuitAnalysis, id: string): CircuitError[] {
  return analysis.issues.filter((e) => e.severity !== 'info' && e.componentIds.includes(id));
}

export function issuesOfWire(analysis: CircuitAnalysis, id: string): CircuitError[] {
  return analysis.issues.filter((e) => e.severity !== 'info' && e.wireIds.includes(id));
}

/** 「U1：F10 → F22（轉 180 度）」：第 1 腳所在的孔；多塊板時加板子 ID。 */
export function describeMove(circuit: Pick<Circuit, 'boards'>, m: IcMove): string {
  const at = (p: IcPlacement) => holeLabel(circuit, { boardId: p.boardId, x: p.anchor.x, y: p.anchor.y });
  const turned = m.from.rotation !== m.to.rotation ? '（轉 180 度）' : '';
  return `${m.componentId}：${at(m.from)} → ${at(m.to)}${turned}`;
}
