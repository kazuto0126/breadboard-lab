import { inputPins, outputPin, outputPins, type GridXY } from './shapes';
import { signalOf, type LogicDiagram, type LogicWire } from './types';

/**
 * 每個來源的匯流線在哪一欄：輸出腳右邊 1 格；同一欄有好幾個來源（例如 A、B、C 三個輸入端，或 IC 方塊的幾個輸出腳）時，
 * 依輸出腳由上到下各往右多挪一格，線才不會疊在一起（像課本的圖 2-5）。鍵是訊號名稱（`signalOf`）。
 */
export function busColumns(d: LogicDiagram): Map<string, number> {
  const sources = new Set(d.wires.map((w) => signalOf(w.from, w.fromPin)));
  const byColumn = new Map<number, Array<{ id: string; y: number }>>();
  for (const node of d.nodes) {
    outputPins(node).forEach((pin, k) => {
      const id = signalOf(node.id, k);
      if (!sources.has(id)) return;
      byColumn.set(pin.x, [...(byColumn.get(pin.x) ?? []), { id, y: pin.y }]);
    });
  }
  const bus = new Map<string, number>();
  for (const [x, list] of byColumn) {
    list.sort((a, b) => a.y - b.y || (a.id < b.id ? -1 : 1));
    list.forEach((s, k) => bus.set(s.id, x + 1 + k));
  }
  return bus;
}

/** 規格 2.2：輸出腳 → 匯流線 → 目的那一列 → 目的腳。 */
export function wireRoute(d: LogicDiagram, wire: LogicWire, columns: Map<string, number> = busColumns(d)): GridXY[] {
  const source = d.nodes.find((n) => n.id === wire.from);
  const target = d.nodes.find((n) => n.id === wire.to.node);
  const a = source && outputPin(source, wire.fromPin ?? 0);
  const b = target && inputPins(target)[wire.to.pin];
  if (!a || !b) return [];
  const busX = columns.get(signalOf(wire.from, wire.fromPin)) ?? a.x + 1;
  const pts: GridXY[] = [a, { x: busX, y: a.y }, { x: busX, y: b.y }, b];
  // 去掉重複的點（同一列時中間兩點重疊）。
  return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
}

/** 匯流線上的分岔點：有兩條以上的線分出去、而且匯流線還繼續往外走的位置。 */
export function junctions(d: LogicDiagram, columns: Map<string, number> = busColumns(d)): GridXY[] {
  const dots: GridXY[] = [];
  const bySource = new Map<string, LogicWire[]>();
  for (const w of d.wires) {
    const key = signalOf(w.from, w.fromPin);
    bySource.set(key, [...(bySource.get(key) ?? []), w]);
  }
  for (const [key, wires] of bySource) {
    if (wires.length < 2) continue;
    const source = d.nodes.find((n) => n.id === wires[0].from);
    const a = source && outputPin(source, wires[0].fromPin ?? 0);
    if (!a) continue;
    const busX = columns.get(key) ?? a.x + 1;
    const ys = wires.map((w) => {
      const t = d.nodes.find((n) => n.id === w.to.node);
      return t ? (inputPins(t)[w.to.pin]?.y ?? a.y) : a.y;
    });
    const lo = Math.min(a.y, ...ys);
    const hi = Math.max(a.y, ...ys);
    const rows = new Set([a.y, ...ys]);
    for (const y of rows) if (y > lo && y < hi) dots.push({ x: busX, y });
    if (a.y === lo || a.y === hi) dots.push({ x: busX, y: a.y });
  }
  return dots;
}
