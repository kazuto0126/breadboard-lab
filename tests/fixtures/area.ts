import { buildLattice, latticeOf } from '../../src/core/breadboard/lattice';
import { resolveFootprint } from '../../src/core/circuit/footprint';
import { getComponentDefinition } from '../../src/core/circuit/library';
import type { Circuit } from '../../src/types/circuit';

/**
 * 子專案 60（指南 3.6）：佔用面積 = 元件（腳與本體）和導線實際佔用的範圍（全域格子的外框）。
 * 電源符號也算（它也佔一個孔）。
 */
export function occupiedArea(circuit: Circuit): { columns: number; rows: number; cells: number } {
  const lattice = buildLattice(circuit.boards);
  const xs: number[] = [];
  const ys: number[] = [];
  const add = (p: { boardId: string; x: number; y: number }) => {
    const at = latticeOf(lattice, p);
    if (!at) return;
    xs.push(at.x);
    ys.push(at.y);
  };
  for (const c of circuit.components) {
    const def = getComponentDefinition(c.defId);
    if (!def) continue;
    const fp = resolveFootprint(c, def);
    for (const p of [...fp.pins.map((q) => q.point), ...fp.blocked]) add(p);
  }
  for (const w of circuit.wires) for (const p of [w.start, w.end, ...w.path]) add(p);
  if (xs.length === 0) return { columns: 0, rows: 0, cells: 0 };
  const columns = Math.max(...xs) - Math.min(...xs) + 1;
  const rows = Math.max(...ys) - Math.min(...ys) + 1;
  return { columns, rows, cells: columns * rows };
}
