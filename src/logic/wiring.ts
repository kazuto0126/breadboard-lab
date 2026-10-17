import { inputPins, nodeSize, outputPin, outputPins, type GridXY } from './shapes';
import { signalOf, type LogicDiagram, type LogicNode, type LogicWire } from './types';

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
function straightRoute(a: GridXY, busX: number, b: GridXY): GridXY[] {
  return dedupe([a, { x: busX, y: a.y }, { x: busX, y: b.y }, b]);
}

/** 去掉重複的點（同一列時中間兩點重疊）。 */
function dedupe(pts: GridXY[]): GridXY[] {
  return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
}

/** 一段水平或垂直的線穿過元件的方框（端點剛好在方框的邊上，例如接到輸入腳，不算）。 */
function hitsNode(p: GridXY, q: GridXY, n: LogicNode): boolean {
  const { w, h } = nodeSize(n);
  if (p.y === q.y) return p.y >= n.y && p.y <= n.y + h - 1 && Math.min(p.x, q.x) < n.x + w && Math.max(p.x, q.x) > n.x;
  return p.x > n.x && p.x < n.x + w && Math.min(p.y, q.y) <= n.y + h - 1 && Math.max(p.y, q.y) >= n.y;
}

/** 兩段線在同一條直線上而且有一段重疊（只碰到一點不算）。 */
function sharesStretch(p: GridXY, q: GridXY, s: GridXY, t: GridXY): boolean {
  if (p.y === q.y && s.y === t.y && p.y === s.y) return Math.min(Math.max(p.x, q.x), Math.max(s.x, t.x)) > Math.max(Math.min(p.x, q.x), Math.min(s.x, t.x));
  if (p.x === q.x && s.x === t.x && p.x === s.x) return Math.min(Math.max(p.y, q.y), Math.max(s.y, t.y)) > Math.max(Math.min(p.y, q.y), Math.min(s.y, t.y));
  return false;
}

interface Drawn {
  signal: string;
  pts: GridXY[];
}

/** 這條路不穿過任何元件，也不和別的訊號已經畫好的線疊在一起。 */
function isClear(d: LogicDiagram, pts: GridXY[], signal: string, drawn: Drawn[]): boolean {
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1];
    const q = pts[i];
    if (d.nodes.some((n) => hitsNode(p, q, n))) return false;
    for (const other of drawn) {
      if (other.signal === signal) continue;
      for (let k = 1; k < other.pts.length; k++) if (sharesStretch(p, q, other.pts[k - 1], other.pts[k])) return false;
    }
  }
  return true;
}

/** 繞路最多往上下找幾列、目的腳左邊最多試幾欄。 */
const DETOUR_ROWS = 20;
const DETOUR_LANES = 3;

/**
 * 水平走到目的腳會穿過元件時繞開：沿匯流線走到上面或下面沒有東西的一列，往目的腳的方向走到目的腳左邊，再轉進目的腳。
 * 先試離目的那一列近的、匯流線過來那一側的列；找不到就回傳 null（照原本的畫法）。
 */
function detour(d: LogicDiagram, a: GridXY, busX: number, b: GridXY, signal: string, drawn: Drawn[]): GridXY[] | null {
  const toward = Math.sign(a.y - b.y) || -1;
  for (let dist = 1; dist <= DETOUR_ROWS; dist++) {
    for (const y of [b.y + toward * dist, b.y - toward * dist]) {
      for (let lane = b.x - 1; lane >= b.x - DETOUR_LANES; lane--) {
        if (b.x > busX && lane <= busX) break;
        const pts = dedupe([a, { x: busX, y: a.y }, { x: busX, y }, { x: lane, y }, { x: lane, y: b.y }, b]);
        if (isClear(d, pts, signal, drawn)) return pts;
      }
    }
  }
  return null;
}

/**
 * 所有線的走法（線的 ID → 轉折點）。先照規格 2.2 的走法；最後水平那一段會穿過元件（也就會和那個元件的線疊在一起）的線，
 * 再依序找不穿過元件、不和別的訊號疊在一起的繞法。
 */
export function wireRoutes(d: LogicDiagram, columns: Map<string, number> = busColumns(d)): Map<string, GridXY[]> {
  const routes = new Map<string, GridXY[]>();
  const drawn: Drawn[] = [];
  const blocked: Array<{ id: string; a: GridXY; busX: number; b: GridXY; signal: string; straight: GridXY[] }> = [];
  for (const wire of d.wires) {
    const source = d.nodes.find((n) => n.id === wire.from);
    const target = d.nodes.find((n) => n.id === wire.to.node);
    const a = source && outputPin(source, wire.fromPin ?? 0);
    const b = target && inputPins(target)[wire.to.pin];
    if (!a || !b) {
      routes.set(wire.id, []);
      continue;
    }
    const signal = signalOf(wire.from, wire.fromPin);
    const busX = columns.get(signal) ?? a.x + 1;
    const straight = straightRoute(a, busX, b);
    const run = { x: busX, y: b.y };
    if (d.nodes.some((n) => hitsNode(run, b, n))) blocked.push({ id: wire.id, a, busX, b, signal, straight });
    else {
      routes.set(wire.id, straight);
      drawn.push({ signal, pts: straight });
    }
  }
  for (const w of blocked) {
    const pts = detour(d, w.a, w.busX, w.b, w.signal, drawn) ?? w.straight;
    routes.set(w.id, pts);
    drawn.push({ signal: w.signal, pts });
  }
  return routes;
}

/** 一條線的走法（見 `wireRoutes`）；要畫整張圖時用 `wireRoutes` 一次算完。 */
export function wireRoute(d: LogicDiagram, wire: LogicWire, columns: Map<string, number> = busColumns(d)): GridXY[] {
  return wireRoutes(d, columns).get(wire.id) ?? [];
}

/** 匯流線上的分岔點：有兩條以上的線分出去、而且匯流線還繼續往外走的位置（依線實際離開匯流線的那一列）。 */
export function junctions(d: LogicDiagram, routes: Map<string, GridXY[]> = wireRoutes(d)): GridXY[] {
  const dots: GridXY[] = [];
  const bySource = new Map<string, GridXY[][]>();
  for (const w of d.wires) {
    const pts = routes.get(w.id);
    if (!pts || pts.length < 3) continue;
    const key = signalOf(w.from, w.fromPin);
    bySource.set(key, [...(bySource.get(key) ?? []), pts]);
  }
  for (const list of bySource.values()) {
    if (list.length < 2) continue;
    const a = list[0][0];
    const busX = list[0][1].x;
    // 線離開匯流線的那一列：第 3 個點還在匯流線上就是那一列，否則是來源那一列（直接往右走）。
    const ys = list.map((pts) => (pts[2].x === busX ? pts[2].y : a.y));
    const lo = Math.min(a.y, ...ys);
    const hi = Math.max(a.y, ...ys);
    for (const y of new Set([a.y, ...ys])) if (y > lo && y < hi) dots.push({ x: busX, y });
    // 匯流線從來源那一列只往一個方向走時，那裡有線直接往右才是分岔，否則只是轉角。
    if ((a.y === lo || a.y === hi) && lo !== hi && ys.includes(a.y)) dots.push({ x: busX, y: a.y });
  }
  return dots;
}
