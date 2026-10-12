import { inputPins, outputPin, type GridXY } from './shapes';
import type { LogicDiagram, LogicWire } from './types';

/** 規格 2.2：同一個來源的線共用輸出腳右邊 1 格的直線（匯流線）。 */
export function wireRoute(d: LogicDiagram, wire: LogicWire): GridXY[] {
  const source = d.nodes.find((n) => n.id === wire.from);
  const target = d.nodes.find((n) => n.id === wire.to.node);
  const a = source && outputPin(source);
  const b = target && inputPins(target)[wire.to.pin];
  if (!a || !b) return [];
  const busX = a.x + 1;
  const pts: GridXY[] = [a, { x: busX, y: a.y }, { x: busX, y: b.y }, b];
  // 去掉重複的點（同一列時中間兩點重疊）。
  return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
}

/** 匯流線上有兩條以上分出去的位置：來源那一列（往上下兩個方向或一條直走一條轉彎），以及中途分出去的列。 */
export function junctions(d: LogicDiagram): GridXY[] {
  const dots: GridXY[] = [];
  const bySource = new Map<string, LogicWire[]>();
  for (const w of d.wires) bySource.set(w.from, [...(bySource.get(w.from) ?? []), w]);
  for (const [from, wires] of bySource) {
    if (wires.length < 2) continue;
    const source = d.nodes.find((n) => n.id === from);
    const a = source && outputPin(source);
    if (!a) continue;
    const busX = a.x + 1;
    const ys = wires.map((w) => {
      const t = d.nodes.find((n) => n.id === w.to.node);
      return t ? (inputPins(t)[w.to.pin]?.y ?? a.y) : a.y;
    });
    const lo = Math.min(a.y, ...ys);
    const hi = Math.max(a.y, ...ys);
    // 匯流線上每個「有線離開、且匯流線還繼續往外走」的列：來源列一定是分岔點；中間的目的列也是。
    const rows = new Set([a.y, ...ys]);
    for (const y of rows) if (y > lo && y < hi) dots.push({ x: busX, y });
    if (a.y === lo || a.y === hi) dots.push({ x: busX, y: a.y });
  }
  return dots;
}
