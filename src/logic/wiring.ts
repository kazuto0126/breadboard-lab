import { bodyRect, inputDir, inputPins, outputDir, outputPin, outputPins, type Facing, type GridXY } from './shapes';
import { signalOf, type LogicDiagram, type LogicWire } from './types';

/**
 * 子專案 26：元件可以轉向，所以每條線先轉到「來源的輸出朝右」的座標裡算，再轉回來。
 * q 是順時針轉幾個 90°（畫面座標，y 往下）；方向的編號：右 0、下 1、左 2、上 3。
 */
type Quarter = 0 | 1 | 2 | 3;
const INDEX: Record<Facing, Quarter> = { E: 0, S: 1, W: 2, N: 3 };

function rot(p: GridXY, q: number): GridXY {
  // + 0 把 -0 變成 0。
  switch (((q % 4) + 4) % 4) {
    case 1:
      return { x: -p.y + 0, y: p.x };
    case 2:
      return { x: -p.x + 0, y: -p.y + 0 };
    case 3:
      return { x: p.y, y: -p.x + 0 };
    default:
      return p;
  }
}

/** 把來源的輸出方向轉成朝右要轉幾個 90°。 */
const toCanonical = (out: Facing): Quarter => ((4 - INDEX[out]) % 4) as Quarter;

/**
 * 每個來源的匯流線位置（在來源自己的「朝右」座標裡是哪一欄）：輸出腳往外 1 格；同一條線上有好幾個同方向的來源
 * （例如 A、B、C 三個輸入端，或 IC 方塊的幾個輸出腳）時，依沿線的位置各往外多挪一格，線才不會疊在一起（像課本的圖 2-5）。
 * 鍵是訊號名稱（`signalOf`）。沒轉的來源就是畫面上的 x。
 */
export function busColumns(d: LogicDiagram): Map<string, number> {
  const sources = new Set(d.wires.map((w) => signalOf(w.from, w.fromPin)));
  const byLine = new Map<string, { x: number; list: Array<{ id: string; y: number }> }>();
  for (const node of d.nodes) {
    const q = toCanonical(outputDir(node));
    outputPins(node).forEach((pin, k) => {
      const id = signalOf(node.id, k);
      if (!sources.has(id)) return;
      const p = rot(pin, q);
      const key = `${q}:${p.x}`;
      const line = byLine.get(key) ?? { x: p.x, list: [] };
      line.list.push({ id, y: p.y });
      byLine.set(key, line);
    });
  }
  const bus = new Map<string, number>();
  for (const { x, list } of byLine.values()) {
    list.sort((a, b) => a.y - b.y || (a.id < b.id ? -1 : 1));
    list.forEach((s, k) => bus.set(s.id, x + 1 + k));
  }
  return bus;
}

/** 去掉重複的點（同一列時中間兩點重疊）。 */
function dedupe(pts: GridXY[]): GridXY[] {
  return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
}

type Rect = { x0: number; x1: number; y0: number; y1: number };

/** 一段水平或垂直的線穿過元件的本體（端點剛好在邊上，例如接到輸入腳，不算）。 */
function hitsRect(p: GridXY, q: GridXY, r: Rect): boolean {
  if (p.y === q.y) return r.y0 < p.y && p.y < r.y1 && Math.min(p.x, q.x) < r.x1 && Math.max(p.x, q.x) > r.x0;
  return r.x0 < p.x && p.x < r.x1 && Math.min(p.y, q.y) < r.y1 && Math.max(p.y, q.y) > r.y0;
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
function isClear(rects: Rect[], pts: GridXY[], signal: string, drawn: Drawn[]): boolean {
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1];
    const q = pts[i];
    if (rects.some((r) => hitsRect(p, q, r))) return false;
    for (const other of drawn) {
      if (other.signal === signal) continue;
      for (let k = 1; k < other.pts.length; k++) if (sharesStretch(p, q, other.pts[k - 1], other.pts[k])) return false;
    }
  }
  return true;
}

/** 繞路最多往外找幾列、目的腳旁邊最多試幾欄。 */
const DETOUR_ROWS = 20;
const DETOUR_LANES = 3;

/**
 * 在「來源朝右」的座標裡（A 是輸出腳，匯流線在 x = busX）產生到目的腳 B 的路線。approach 是 B 朝外的方向
 * （線從那一側接進來）：
 * - 朝左 / 朝右：規格 2.2 的走法——沿匯流線到 B 那一列、橫著接進去；擋到時沿匯流線走到上下沒有東西的一列，
 *   繞到 B 的左邊（右邊）再轉進去。
 * - 朝上 / 朝下：沿匯流線走到 B 上面（下面）一列、橫走到 B 的正上方（正下方）、直直接進去；擋到時再往外找列。
 * `preferred` 的 `tail` 是離開匯流線之後的部分（判斷要不要繞路只看這段）。
 */
function candidates(A: GridXY, busX: number, B: GridXY, approach: Quarter): { preferred: GridXY[]; tail: GridXY[]; detours: () => Generator<GridXY[]> } {
  const head = [A, { x: busX, y: A.y }];
  if (approach === 2 || approach === 0) {
    const side = approach === 2 ? -1 : 1;
    const tail = [{ x: busX, y: B.y }, B];
    return {
      preferred: dedupe([...head, ...tail]),
      tail,
      *detours() {
        const toward = Math.sign(A.y - B.y) || -1;
        for (let dist = 1; dist <= DETOUR_ROWS; dist++) {
          for (const y of [B.y + toward * dist, B.y - toward * dist]) {
            for (let k = 1; k <= DETOUR_LANES; k++) {
              const lane = B.x + side * k;
              // 匯流線本來就在目的腳的那一側時，繞的那一欄不能超過匯流線。
              if ((B.x - busX) * side < 0 && (lane - busX) * side >= 0) break;
              yield dedupe([...head, { x: busX, y }, { x: lane, y }, { x: lane, y: B.y }, B]);
            }
          }
        }
      },
    };
  }
  const side = approach === 3 ? -1 : 1;
  const tail = [{ x: busX, y: B.y + side }, { x: B.x, y: B.y + side }, B];
  return {
    preferred: dedupe([...head, ...tail]),
    tail,
    *detours() {
      for (let dist = 2; dist <= DETOUR_ROWS; dist++) yield dedupe([...head, { x: busX, y: B.y + side * dist }, { x: B.x, y: B.y + side * dist }, B]);
    },
  };
}

/**
 * 所有線的走法（線的 ID → 轉折點）。先照規格 2.2 的走法；離開匯流線之後那一段會穿過元件、或沿著別的輸出短線走的線，
 * 再依序找不穿過元件、不和別的訊號疊在一起的繞法。
 */
export function wireRoutes(d: LogicDiagram, columns: Map<string, number> = busColumns(d)): Map<string, GridXY[]> {
  const routes = new Map<string, GridXY[]>();
  const rects = d.nodes.map(bodyRect);
  // 每個來源從輸出腳到匯流線的短線先畫上：別的線不能沿著它走（子專案 25：產生的邏輯圖常常碰到）。
  const stubs: Drawn[] = [];
  for (const node of d.nodes) {
    const q = toCanonical(outputDir(node));
    outputPins(node).forEach((pin, k) => {
      const signal = signalOf(node.id, k);
      const bus = columns.get(signal);
      if (bus !== undefined) stubs.push({ signal, pts: [pin, rot({ x: bus, y: rot(pin, q).y }, -q)] });
    });
  }
  const drawn: Drawn[] = [...stubs];
  const blocked: Array<{ id: string; signal: string; preferred: GridXY[]; detours: () => Generator<GridXY[]> }> = [];
  for (const wire of d.wires) {
    const source = d.nodes.find((n) => n.id === wire.from);
    const target = d.nodes.find((n) => n.id === wire.to.node);
    const a = source && outputPin(source, wire.fromPin ?? 0);
    const b = target && inputPins(target)[wire.to.pin];
    if (!source || !target || !a || !b) {
      routes.set(wire.id, []);
      continue;
    }
    const signal = signalOf(wire.from, wire.fromPin);
    const q = toCanonical(outputDir(source));
    const A = rot(a, q);
    const busX = columns.get(signal) ?? A.x + 1;
    const c = candidates(A, busX, rot(b, q), ((INDEX[inputDir(target)] + q) % 4) as Quarter);
    const back = (pts: GridXY[]) => pts.map((p) => rot(p, -q));
    const preferred = back(c.preferred);
    const tail = back(c.tail);
    const tailBlocked = tail.some((p, i) => i > 0 && (rects.some((r) => hitsRect(tail[i - 1], p, r)) || stubs.some((s) => s.signal !== signal && sharesStretch(tail[i - 1], p, s.pts[0], s.pts[1]))));
    if (tailBlocked) {
      blocked.push({
        id: wire.id,
        signal,
        preferred,
        detours: function* () {
          for (const pts of c.detours()) yield back(pts);
        },
      });
    } else {
      routes.set(wire.id, preferred);
      drawn.push({ signal, pts: preferred });
    }
  }
  for (const w of blocked) {
    let pts = w.preferred;
    for (const option of w.detours()) {
      if (isClear(rects, option, w.signal, drawn)) {
        pts = option;
        break;
      }
    }
    routes.set(w.id, pts);
    drawn.push({ signal: w.signal, pts });
  }
  return routes;
}

/** 一條線的走法（見 `wireRoutes`）；要畫整張圖時用 `wireRoutes` 一次算完。 */
export function wireRoute(d: LogicDiagram, wire: LogicWire, columns: Map<string, number> = busColumns(d)): GridXY[] {
  return wireRoutes(d, columns).get(wire.id) ?? [];
}

/**
 * 匯流線上的分岔點：有兩條以上的線分出去、而且匯流線還繼續往外走的位置（依線實際離開匯流線的位置）。
 * 在各來源自己的「朝右」座標裡算，再轉回來（朝下的輸出，匯流線是橫的）。
 */
export function junctions(d: LogicDiagram, routes: Map<string, GridXY[]> = wireRoutes(d)): GridXY[] {
  const dots: GridXY[] = [];
  const bySource = new Map<string, { q: Quarter; list: GridXY[][] }>();
  for (const w of d.wires) {
    const pts = routes.get(w.id);
    const source = d.nodes.find((n) => n.id === w.from);
    if (!pts || pts.length < 3 || !source) continue;
    const key = signalOf(w.from, w.fromPin);
    const q = toCanonical(outputDir(source));
    const entry = bySource.get(key) ?? { q, list: [] };
    entry.list.push(pts.map((p) => rot(p, q)));
    bySource.set(key, entry);
  }
  for (const { q, list } of bySource.values()) {
    if (list.length < 2) continue;
    const a = list[0][0];
    const busX = list[0][1].x;
    const dot = (y: number) => dots.push(rot({ x: busX, y }, -q));
    // 線離開匯流線的那一列：第 3 個點還在匯流線上就是那一列，否則是來源那一列（直接往外走）。
    const ys = list.map((pts) => (pts[2].x === busX ? pts[2].y : a.y));
    const lo = Math.min(a.y, ...ys);
    const hi = Math.max(a.y, ...ys);
    for (const y of new Set([a.y, ...ys])) if (y > lo && y < hi) dot(y);
    // 匯流線從來源那一列只往一個方向走時，那裡有線直接往外才是分岔，否則只是轉角。
    if ((a.y === lo || a.y === hi) && lo !== hi && ys.includes(a.y)) dot(a.y);
  }
  return dots;
}
