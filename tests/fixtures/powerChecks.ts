import { getBoard } from '../../src/core/breadboard/registry';
import { groupOfPoint, indexCircuit, pinPoint } from '../../src/core/circuit/circuitIndex';
import { nearestRailGroup } from '../../src/core/circuit/powerRails';
import type { Circuit } from '../../src/types/circuit';

/**
 * 子專案 34：轉換出來的麵包板的電源接法有哪些問題（空陣列代表沒問題）：
 * 兩端都在電源軌的線、接到電源軌但不是最近的同極性軌、用到的軌沒有同極性符號、軌上的符號沒有線用到。
 */
export function powerProblems(c: Circuit): string[] {
  const index = indexCircuit(c);
  const boards = new Map(c.boards.map((b) => [b.id, getBoard(b.layoutId, b.id)]));
  const isRail = (g: string) => g.includes(':rail-');
  const polarity = (g: string) => (g.endsWith('+') ? '+' : '-') as '+' | '-';
  const problems: string[] = [];
  const used = new Set<string>();
  // 子專案 47：沒有符號、沒有元件腳的軌是訊號通道（佈線借來接訊號），不算電源的接法。
  const powered = new Set(
    c.components.flatMap((x) => (index.placedById.get(x.id)?.footprint.pins ?? []).map((p) => groupOfPoint(index, p.point)).filter((g): g is string => g !== null && isRail(g))),
  );
  for (const w of c.wires) {
    const a = groupOfPoint(index, w.start)!;
    const b = groupOfPoint(index, w.end)!;
    if ((isRail(a) && !powered.has(a)) || (isRail(b) && !powered.has(b))) continue;
    if (isRail(a) && isRail(b)) problems.push(`${w.id}: ${a} → ${b} 兩端都在電源軌`);
    else if (isRail(a) || isRail(b)) {
      const [rail, group] = isRail(a) ? [a, b] : [b, a];
      used.add(rail);
      const nearest = nearestRailGroup(boards.get(rail.slice(0, rail.indexOf(':')))!, group, polarity(rail));
      if (nearest !== rail) problems.push(`${w.id}: ${group} 接到 ${rail}，最近的是 ${nearest}`);
    }
  }
  // 子專案 36：直接插在電源軌上的元件腳（例如直立的上 / 下拉電阻）也算用到那條軌。
  for (const x of c.components) {
    if (x.defId === 'vcc' || x.defId === 'gnd') continue;
    for (const p of index.placedById.get(x.id)?.footprint.pins ?? []) {
      const g = groupOfPoint(index, p.point);
      if (g && isRail(g)) used.add(g);
    }
  }
  const symbolAt = new Map<string, string>();
  for (const x of c.components) {
    if (x.defId !== 'vcc' && x.defId !== 'gnd') continue;
    const g = groupOfPoint(index, pinPoint(index, { componentId: x.id, pinNumber: 1 })!)!;
    symbolAt.set(g, x.defId);
    if (isRail(g) && !used.has(g)) problems.push(`${x.id}: ${g} 沒有線用到`);
  }
  for (const rail of used) if (symbolAt.get(rail) !== (polarity(rail) === '+' ? 'vcc' : 'gnd')) problems.push(`${rail} 沒有符號`);
  return problems;
}
