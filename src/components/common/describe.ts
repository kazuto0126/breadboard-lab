import { getNode, holeName } from '../../core/breadboard/naming';
import { getBoard } from '../../core/breadboard/registry';
import { countBends } from '../../core/circuit/wireGeometry';
import { describeGroup } from '../../core/routing/problem';
import type { CircuitAnalysis } from '../../editor/analysis';
import { occupancyOf } from '../../editor/analysis';
import type { Circuit, CircuitError, Wire } from '../../types/circuit';
import type { PinRole } from '../../types/component';
import type { GridPoint } from '../../types/geometry';
import type { FailureReason } from '../../types/routing';
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

export const FAILURE_NAMES: Record<FailureReason, string> = {
  NO_FREE_HOLE: '沒有空孔可以接線',
  UNROUTABLE: '找不到可以走的路徑',
  ITERATION_LIMIT: '協商多輪仍無法避開其他導線',
  TIME_LIMIT: '超過計算時間',
  LEGALITY_CHECK: '沒有通過合法性檢查',
};

export function holeLabel(circuit: Circuit, p: GridPoint): string {
  const instance = circuit.boards.find((b) => b.id === p.boardId);
  if (!instance) return `(${p.x}, ${p.y})`;
  return holeName(getBoard(instance.layoutId, instance.id), p) ?? `(${p.x}, ${p.y})`;
}

export function groupLabel(groupId: string | null): string {
  return groupId ? describeGroup(groupId) : '板面（沒有孔）';
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
    else if (w.path.slice(1, -1).some((q) => q.boardId === p.boardId && q.x === p.x && q.y === p.y)) out.push(`導線 ${w.id} 從上面經過`);
  }
  const occ = occupancyOf(circuit, p.boardId);
  if (out.length === 0 && occ.board && getNode(occ.board, p.x, p.y)?.kind === 'hole') out.push('空孔：可以從這裡拖曳接線');
  return out;
}

export function wireSummary(wire: Wire): string {
  return `${wire.path.length - 1} 格 · ${countBends(wire.path)} 個轉彎`;
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
