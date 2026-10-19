import { logicSet, newLabFile } from '../../src/mcp/tools';
import type { LogicDiagram } from '../../src/logic/types';

/**
 * 子專案 36（規格 2026-10-20 conversion-placement）：使用者給的三個實驗電路（A 一位元比較器、B 3 對 8 線解碼器、C 8 對 3 線編碼器）的邏輯圖，
 * 用來量「轉成麵包板」的擺法與佈線。用 MCP 的 logic_set 建立（沒給位置時自動排版）。
 */
type Wire = { id: string; from: string; fromPin?: number; to: { node: string; pin: number } };
const w = (id: string, from: string, node: string, pin: number, fromPin?: number): Wire => ({ id, from, ...(fromPin !== undefined ? { fromPin } : {}), to: { node, pin } });

function diagram(nodes: Array<Record<string, unknown>>, wires: Wire[]): LogicDiagram {
  const r = logicSet(newLabFile('lab', 'MB102'), { diagram: { nodes, wires } });
  if (r.error || !r.file) throw new Error(r.text);
  return r.file.logic;
}

/** A：一位元比較器，只用 NOR（74LS02）：N = (A + B)'、GT = (B + N)'、LT = (A + N)'、EQ = (GT + LT)'。 */
export function comparator(): LogicDiagram {
  return diagram(
    [
      { id: 'iA', kind: 'INPUT', name: 'A' }, { id: 'iB', kind: 'INPUT', name: 'B' },
      { id: 'n', kind: 'NOR', inputs: 2 }, { id: 'gt', kind: 'NOR', inputs: 2 }, { id: 'lt', kind: 'NOR', inputs: 2 }, { id: 'eq', kind: 'NOR', inputs: 2 },
      { id: 'oEQ', kind: 'OUTPUT', name: 'EQ' }, { id: 'oGT', kind: 'OUTPUT', name: 'GT' }, { id: 'oLT', kind: 'OUTPUT', name: 'LT' },
    ],
    [
      w('1', 'iA', 'n', 0), w('2', 'iB', 'n', 1), w('3', 'iB', 'gt', 0), w('4', 'n', 'gt', 1), w('5', 'iA', 'lt', 0), w('6', 'n', 'lt', 1),
      w('7', 'gt', 'eq', 0), w('8', 'lt', 'eq', 1), w('9', 'eq', 'oEQ', 0), w('10', 'gt', 'oGT', 0), w('11', 'lt', 'oLT', 0),
    ],
  );
}

/** B：3 對 8 線解碼器（74LS138，x 是最高位元）；8 個輸出端直接接 /Y0…/Y7。activeLow：輸出端設成低態致動（子專案 37）。 */
export function decoder(activeLow = false): LogicDiagram {
  return diagram(
    [
      { id: 'ix', kind: 'INPUT', name: 'x' }, { id: 'iy', kind: 'INPUT', name: 'y' }, { id: 'iz', kind: 'INPUT', name: 'z' },
      { id: 'k1', kind: 'HIGH' }, { id: 'k0', kind: 'LOW' }, { id: 'u', kind: 'BLOCK', chip: '74LS138' },
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: `o${n}`, kind: 'OUTPUT', name: `D${n}`, ...(activeLow ? { activeLow: true } : {}) })),
    ],
    [
      w('a', 'iz', 'u', 0), w('b', 'iy', 'u', 1), w('c', 'ix', 'u', 2), w('g1', 'k1', 'u', 3), w('g2a', 'k0', 'u', 4), w('g2b', 'k0', 'u', 5),
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((n) => w(`y${n}`, 'u', `o${n}`, 0, n)),
    ],
  );
}

/** C：8 對 3 線編碼器（三個 4 輸入 OR → 3 顆 74LS32）：X = E + F + G + H、Y = C + D + G + H、Z = B + D + F + H。 */
export function encoder(): LogicDiagram {
  const ins = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const feed: Record<string, string[]> = { gx: ['E', 'F', 'G', 'H'], gy: ['C', 'D', 'G', 'H'], gz: ['B', 'D', 'F', 'H'] };
  return diagram(
    [
      ...ins.map((n) => ({ id: `i${n}`, kind: 'INPUT', name: n })),
      { id: 'gx', kind: 'OR', inputs: 4 }, { id: 'gy', kind: 'OR', inputs: 4 }, { id: 'gz', kind: 'OR', inputs: 4 },
      { id: 'oX', kind: 'OUTPUT', name: 'X' }, { id: 'oY', kind: 'OUTPUT', name: 'Y' }, { id: 'oZ', kind: 'OUTPUT', name: 'Z' },
    ],
    [...Object.entries(feed).flatMap(([g, srcs]) => srcs.map((s, pin) => w(`${g}${pin}`, `i${s}`, g, pin))), w('x', 'gx', 'oX', 0), w('y', 'gy', 'oY', 0), w('z', 'gz', 'oZ', 0)],
  );
}
