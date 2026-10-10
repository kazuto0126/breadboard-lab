# 新的自動佈線標準 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 自動佈線只輸出水平 / 垂直的直線導線，轉彎靠轉接排，一孔一線，最優先避免交叉。

**Architecture:** 新的三個檔案取代舊的 A*：`straightState.ts`（已放的線與衝突、歷史成本）、`straightSearch.ts`（孔與排之間的 Dijkstra，
狀態是 `IN(孔)` / `OUT(孔)`）、`straightNet.ts`（一個 Net 的 Prim 生成樹）。`autoRoute.ts` 的協商迴圈、改善階段改用新的 state；
`legality.ts` 改成檢查直線規則。`problem.ts` 加上「有元件腳的排」與「排的擁有者」。

**Tech Stack:** TypeScript、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-10-routing-standard-design.md`

## Global Constraints

- 輸出的每條線：`straight: true`、`source: 'auto'`、`netId`、水平或垂直、`path = [start, end]`。
- 轉接排：空的五孔排（`kind !== 'rail'` 且沒有元件腳、不是別的 Net 的終端排）或這個 Net 自己的排（終端排、自己用過的轉接排）。空的電源軌不用。
- 每個孔最多一個線端；元件腳、本體的孔不能插；線不能經過元件腳、本體、任何線端；不能共線重疊；交叉允許但成本最高。
- 權重起始值：`distance 1, wire 6, via 3, crossing 1000, congestion 20`（可在 Task 5 校準，記 Ruling）。
- `src/core` 不能用 DOM；註解繁中；每個任務 commit + push；推送前 `npm run typecheck && npm test`。

## Review Focus

1. 只有一個空孔的終端排（線進來就沒地方出去）：同一個孔不能同時當進來與出去的端點。→ Task 2 測試「never reuses the arrival hole」。
2. 電源 Net 用自己的電源軌當「轉接排」（從 IC 的 VCC 排拉到 T+，再從 T+ 拉到另一顆 IC）：要能把軌當成已連上的排。→ Task 3 測試「uses its own rail as a bus」。
3. 兩個 Net 搶同一個空的五孔排當轉接排：協商後不能共用（共用會把兩個 Net 接在一起）。→ Task 4 由合法性檢查 NET_MISMATCH 與 fixtures 測試保證。
4. 跨 Board Group 接縫的直線：經過的格子在兩塊板上，端點換算要正確。→ Task 5 的 multiBoard 測試。
5. 線經過別的 Net 轉接排中間沒插線的孔：要允許（不然常常找不到路）。→ Task 2 測試「passes over the empty middle holes of another net's strip」。

---

### Task 1: 佈線問題加上「有元件腳的排」與「排的擁有者」；權重改名

**Files:**
- Modify: `src/core/routing/problem.ts`（`RoutingProblem.pinGroups: Set<string>`、`groupOwner: Map<string, string>`、`railGroups: Set<string>`）、
  `src/types/routing.ts`（`RoutingWeights` = `{ distance; wire; via; crossing; congestion }`；刪掉 `RoutingNode`）、`src/core/routing/config.ts`、`src/index.ts`（不再匯出 `RoutingNode`）
- Test: `tests/routing/problem.test.ts`

- [ ] **Step 1: Failing test**（加到 `tests/routing/problem.test.ts` 的 acceptance describe 裡）

```ts
  it('knows which groups hold pins, which are rails, and which net owns each terminal group', () => {
    expect(problem.pinGroups.has('b1:c10-bot')).toBe(true); // U1 第 1 腳 F10
    expect(problem.pinGroups.has('b1:c40-top')).toBe(false);
    expect(problem.railGroups.has('b1:rail-T+')).toBe(true);
    expect(problem.railGroups.has('b1:c10-bot')).toBe(false);
    for (const net of problem.nets) for (const g of net.terminalGroups) expect(problem.groupOwner.get(g)).toBe(net.netId);
  });
```

並把 `fills defaults and applies partial overrides` 裡對 `weights` 的期望改成新的鍵（`{ distance: 1, wire: 6, via: 3, crossing: 1000, congestion: 20 }`，覆寫的那個鍵照原本的測試改名）。

- [ ] **Step 2: Run** `npx vitest run tests/routing/problem.test.ts` → FAIL。

- [ ] **Step 3: Implement**

`types/routing.ts`：

```ts
export interface RoutingWeights {
  /** 每格。 */
  distance: number;
  /** 每條線（一條直線跳線）。 */
  wire: number;
  /** 每用一個新的轉接排。 */
  via: number;
  /** 每次交叉。 */
  crossing: number;
  /** 經過別的 Net 的終端空孔（保留給它們接線）。 */
  congestion: number;
}
```

刪掉 `RoutingNode`（只有舊的 A* 用）。`config.ts`：`weights: { distance: 1, wire: 6, via: 3, crossing: 1000, congestion: 20 }`。

`problem.ts` `RoutingProblem` 加：

```ts
  /** 有元件腳的排（不能當別的 Net 的轉接排）。 */
  pinGroups: Set<string>;
  /** 電源軌（空的電源軌不當轉接排）。 */
  railGroups: Set<string>;
  /** 終端排 → 擁有它的 Net（這張格子上的所有 Net，包括不需要佈線的）。 */
  groupOwner: Map<string, string>;
```

`buildCanvasProblem` 裡：

```ts
  const pinGroups = new Set<string>();
  for (const pc of index.placed) for (const pin of pc.footprint.pins) {
    const g = groupOfPoint(index, pin.point);
    if (g) pinGroups.add(g);
  }
  const railGroups = new Set(groupIds.filter(isRail));
  const groupOwner = new Map<string, string>();
  for (const net of nets) for (const g of net.terminalGroups) groupOwner.set(g, net.netId);
```

（`groupOwner` 在 `nets` 建好之後計算；回傳物件加上這三個欄位。）

- [ ] **Step 4: Run** → PASS（舊的 astar / netTree 測試會因為 `weights.bend` 不存在而型別錯誤：它們在 Task 4 刪掉；這一步只跑 problem.test）。

- [ ] **Step 5: Commit** — `refactor(routing): weights for straight wires; problem knows pin groups, rails and group owners`

---

### Task 2: 直線佈線的狀態與搜尋（`straightState.ts`、`straightSearch.ts`）

**Files:**
- Create: `src/core/routing/straightState.ts`、`src/core/routing/straightSearch.ts`
- Test: `tests/routing/straightSearch.test.ts`

**Interfaces:**
- Produces（state）：`PlacedWire { id; netId; a: number; b: number; o: 0 | 1; cells: number[] }`、`Conflict`、
  `class StraightState(problem)`：`ends`、`lines`、`histEnd`、`histLine`、`histVia`、`owns(netId, group)`、`viaOthers(netId, group)`、
  `addWire`、`removeWire`、`removeNet`、`wiresOf`、`conflicts()`、`netsIn(conflicts)`、`bumpHistory(conflicts, inc)`
- Produces（search）：`OverlapMode`、`SearchParams`、`StraightLine { a; b; o; cells }`、`FoundRoute { wires: StraightLine[]; cost }`、
  `lineBetween(problem, a, b): StraightLine`、`findRoute(problem, state, net, sources: Set<string>, targets: Set<string>, params): FoundRoute | null`、
  `wireCost(problem, state, net, line, params): number`

- [ ] **Step 1: Failing tests** — `tests/routing/straightSearch.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { nodeIdOf } from '../../src/core/breadboard/naming';
import { DEFAULT_ROUTING_CONFIG } from '../../src/core/routing/config';
import { buildRoutingProblem, toIndex, toPoint, type RoutingProblem } from '../../src/core/routing/problem';
import { findRoute, lineBetween, wireCost, type SearchParams } from '../../src/core/routing/straightSearch';
import { StraightState } from '../../src/core/routing/straightState';
import { circuit, comp, hole, wire } from '../fixtures/build';

const hard: SearchParams = { weights: DEFAULT_ROUTING_CONFIG.weights, overlap: { kind: 'hard' } };
const W = DEFAULT_ROUTING_CONFIG.weights;
const at = (p: RoutingProblem, name: string) => toIndex(p, hole(name).x, hole(name).y);
const names = (p: RoutingProblem, cells: number[]) => cells.map((i) => nodeIdOf(toPoint(p, i)));
const ends = (p: RoutingProblem, wires: Array<{ a: number; b: number }>) => wires.map((w) => [nodeIdOf(toPoint(p, w.a)), nodeIdOf(toPoint(p, w.b))]);
const id = (name: string) => nodeIdOf(hole(name));

/** 兩顆 LED：D1 陽極 C10、D2 陽極 C30，使用者用一條線接起來 → NET_1 有兩簇（第 10、30 欄上半）。 */
const twoLeds = () => buildRoutingProblem(circuit([comp('D1', 'led', 'C10'), comp('D2', 'led', 'C30')], [wire('u1', 'A10', 'A30')]), DEFAULT_ROUTING_CONFIG);
const netOf = (p: RoutingProblem, netId = 'NET_1') => p.nets.find((n) => n.netId === netId)!;

describe('straight-wire search', () => {
  it('connects two strips in the same row band with one horizontal wire', () => {
    const p = twoLeds();
    const net = netOf(p);
    const state = new StraightState(p);
    const r = findRoute(p, state, net, new Set(net.clusters[0]), new Set(net.clusters[1]), hard)!;
    expect(r.wires).toHaveLength(1);
    const [w] = r.wires;
    expect(w.o).toBe(0);
    expect(p.groupAt[w.a]).toBe('b1:c10-top');
    expect(p.groupAt[w.b]).toBe('b1:c30-top');
    expect(r.cost).toBe(W.wire + 20 * W.distance);
  });

  it('turns through a free strip when the straight way is blocked', () => {
    // 第 10 欄上半 ↔ 第 30 欄下半：沒有同一列可以直達，要經過一個轉接排。
    const c = circuit([comp('D1', 'led', 'C10'), comp('D2', 'led', 'H30')], [wire('u1', 'A10', 'J30')]);
    const p = buildRoutingProblem(c, DEFAULT_ROUTING_CONFIG);
    const net = p.nets.find((n) => n.clusters.length === 2)!;
    const r = findRoute(p, new StraightState(p), net, new Set(net.clusters[0]), new Set(net.clusters[1]), hard)!;
    expect(r.wires.length).toBeGreaterThanOrEqual(2);
    for (const w of r.wires) expect(w.cells.length + 1).toBe(Math.abs(w.b - w.a) / (w.o === 0 ? 1 : p.width));
    const vias = r.wires.slice(0, -1).map((w) => p.groupAt[w.b]!);
    for (const g of vias) {
      expect(p.pinGroups.has(g)).toBe(false);
      expect(p.railGroups.has(g)).toBe(false);
    }
  });

  it('never ends on a pin, never passes over a pin or body, and never reuses the arrival hole', () => {
    const c = circuit([comp('U1', '74LS00', 'F10'), comp('D1', 'led', 'C5'), comp('D2', 'led', 'H25')], [wire('u1', 'A5', 'J25')]);
    const p = buildRoutingProblem(c, DEFAULT_ROUTING_CONFIG);
    const net = p.nets.find((n) => n.clusters.length === 2)!;
    const r = findRoute(p, new StraightState(p), net, new Set(net.clusters[0]), new Set(net.clusters[1]), hard)!;
    const used = r.wires.flatMap((w) => [w.a, w.b]);
    expect(new Set(used).size).toBe(used.length);
    for (const w of r.wires) for (const cell of [w.a, w.b, ...w.cells]) expect(p.blocked[cell]).toBe(0);
  });

  it('refuses to end on a hole that has a wire end or under another wire, and to pass over a wire end, in hard mode', () => {
    const p = twoLeds();
    const net = netOf(p);
    const state = new StraightState(p);
    // 別的 Net 的一條直線佔住第 4 列（A 列）第 15～25 欄。
    state.addWire({ id: 'x', netId: 'OTHER', ...lineBetween(p, at(p, 'A15'), at(p, 'A25')) });
    const r = findRoute(p, state, net, new Set(net.clusters[0]), new Set(net.clusters[1]), hard)!;
    for (const w of r.wires) {
      expect(w.cells).not.toContain(at(p, 'A15'));
      expect(w.cells).not.toContain(at(p, 'A25'));
      expect(w.o === 0 && w.cells.some((cell) => cell > at(p, 'A15') && cell < at(p, 'A25'))).toBe(false);
    }
  });

  it('passes over the empty middle holes of another net\'s strip', () => {
    const p = twoLeds();
    const net = netOf(p);
    const state = new StraightState(p);
    // OTHER 用第 20 欄上半當轉接排：線端在 A20 與 E20，中間 B20～D20 空著。
    state.addWire({ id: 'x1', netId: 'OTHER', ...lineBetween(p, at(p, 'A20'), at(p, 'T+20') === -1 ? at(p, 'A20') : at(p, 'A20')) });
    state.removeWire('x1');
    state.addWire({ id: 'x1', netId: 'OTHER', ...lineBetween(p, at(p, 'E20'), at(p, 'E22')) });
    const r = findRoute(p, state, net, new Set(net.clusters[0]), new Set(net.clusters[1]), hard)!;
    expect(r.wires).toHaveLength(1);
    expect([id('B20'), id('C20'), id('D20')]).toContain(names(p, r.wires[0].cells).find((n) => n.endsWith(',20') === false && false) ?? id('C20'));
  });

  it('prices an existing wire exactly like the search', () => {
    const p = twoLeds();
    const net = netOf(p);
    const state = new StraightState(p);
    const r = findRoute(p, state, net, new Set(net.clusters[0]), new Set(net.clusters[1]), hard)!;
    expect(r.wires.reduce((sum, w) => sum + wireCost(p, state, net, w, hard), 0)).toBe(r.cost);
  });
});

describe('straight-wire state', () => {
  it('finds shared ends, collinear overlaps, wires over ends, and shared strips', () => {
    const p = twoLeds();
    const s = new StraightState(p);
    s.addWire({ id: 'a', netId: 'N1', ...lineBetween(p, at(p, 'A40'), at(p, 'A45')) });
    s.addWire({ id: 'b', netId: 'N2', ...lineBetween(p, at(p, 'A43'), at(p, 'A50')) });
    s.addWire({ id: 'c', netId: 'N3', ...lineBetween(p, at(p, 'A50'), at(p, 'E50')) });
    const kinds = s.conflicts().map((x) => x.kind).sort();
    expect(kinds).toContain('line'); // a 與 b 在 A44 共線
    expect(kinds).toContain('pass'); // b 經過 a 的端點 A45
    expect(kinds).toContain('end'); // b 與 c 都插 A50
    expect(kinds).toContain('via'); // N2 與 N3 都用第 50 欄上半
    expect([...s.netsIn(s.conflicts())].sort()).toEqual(['N1', 'N2', 'N3']);
    s.removeNet('N2');
    expect(s.conflicts()).toEqual([]);
  });

  it('owns its terminal groups and the strips its wires end in', () => {
    const p = twoLeds();
    const s = new StraightState(p);
    expect(s.owns('NET_1', 'b1:c10-top')).toBe(true);
    expect(s.owns('NET_1', 'b1:c50-top')).toBe(false);
    s.addWire({ id: 'a', netId: 'NET_1', ...lineBetween(p, at(p, 'A10'), at(p, 'A50')) });
    expect(s.owns('NET_1', 'b1:c50-top')).toBe(true);
    expect(s.viaOthers('NET_2', 'b1:c50-top')).toBe(1);
  });
});
```

（測試「passes over the empty middle holes」的寫法太繞，實作時改成：OTHER 在第 20 欄上半放兩個線端 A20、E20（各一條往右 2 格的短線），
再確認 NET_1 仍然只用一條 A～E 列的水平線接到第 30 欄、而且那條線經過 B20、C20 或 D20 之一。這是對計畫本身的修正，記 Ruling。）

- [ ] **Step 2: Run** → FAIL（檔案不存在）。

- [ ] **Step 3: Implement `straightState.ts`**

```ts
import type { RoutingProblem } from './problem';

/** 一條直線導線（格子索引）：a、b 是兩端，o = 0 水平、1 垂直；cells 是兩端之間經過的格子。 */
export interface PlacedWire {
  id: string;
  netId: string;
  a: number;
  b: number;
  o: 0 | 1;
  cells: number[];
}

/** end：一個孔插了兩個以上的線端；pass：線經過有線端的孔；line：同一格同方向有兩條線（共線重疊）；via：兩個 Net 用同一排轉接。 */
export type Conflict =
  | { kind: 'end'; cell: number }
  | { kind: 'pass'; cell: number }
  | { kind: 'line'; cell: number; o: 0 | 1 }
  | { kind: 'via'; group: string };

/** 協商佈線時已放的直線導線、每個資源的使用者，以及歷史擁擠成本。 */
export class StraightState {
  readonly ends: string[][];
  readonly lines: string[][];
  readonly histEnd: Float64Array;
  readonly histLine: Float64Array;
  readonly histVia = new Map<string, number>();
  private readonly viaUse = new Map<string, Map<string, number>>();
  private readonly wires = new Map<string, PlacedWire>();
  private readonly byNet = new Map<string, string[]>();
  private readonly terminals: Map<string, Set<string>>;

  constructor(private readonly problem: RoutingProblem) {
    this.ends = Array.from({ length: problem.size }, () => []);
    this.lines = Array.from({ length: problem.size * 2 }, () => []);
    this.histEnd = new Float64Array(problem.size);
    this.histLine = new Float64Array(problem.size * 2);
    this.terminals = new Map(problem.nets.map((n) => [n.netId, new Set(n.terminalGroups)]));
  }

  /** 這一排是不是這個 Net 的終端排，或它的線已經插在這一排（轉接排）。 */
  owns(netId: string, group: string): boolean {
    return this.terminals.get(netId)?.has(group) === true || (this.viaUse.get(group)?.get(netId) ?? 0) > 0;
  }

  /** 把這一排當轉接排的其他 Net 數。 */
  viaOthers(netId: string, group: string): number {
    let n = 0;
    for (const [id, count] of this.viaUse.get(group) ?? []) if (id !== netId && count > 0) n++;
    return n;
  }

  private bumpVia(netId: string, cell: number, delta: number): void {
    const g = this.problem.groupAt[cell];
    if (!g || this.terminals.get(netId)?.has(g)) return;
    const m = this.viaUse.get(g) ?? new Map<string, number>();
    const next = (m.get(netId) ?? 0) + delta;
    if (next > 0) m.set(netId, next);
    else m.delete(netId);
    if (m.size > 0) this.viaUse.set(g, m);
    else this.viaUse.delete(g);
  }

  addWire(w: PlacedWire): void {
    if (this.wires.has(w.id)) throw new Error(`Wire ${w.id} is already placed`);
    this.wires.set(w.id, w);
    const list = this.byNet.get(w.netId);
    if (list) list.push(w.id);
    else this.byNet.set(w.netId, [w.id]);
    for (const end of [w.a, w.b]) {
      this.ends[end].push(w.id);
      this.bumpVia(w.netId, end, 1);
    }
    for (const c of w.cells) this.lines[c * 2 + w.o].push(w.id);
  }

  removeWire(id: string): void {
    const w = this.wires.get(id);
    if (!w) return;
    for (const end of [w.a, w.b]) {
      this.ends[end] = this.ends[end].filter((x) => x !== id);
      this.bumpVia(w.netId, end, -1);
    }
    for (const c of w.cells) this.lines[c * 2 + w.o] = this.lines[c * 2 + w.o].filter((x) => x !== id);
    this.wires.delete(id);
    const rest = (this.byNet.get(w.netId) ?? []).filter((x) => x !== id);
    if (rest.length > 0) this.byNet.set(w.netId, rest);
    else this.byNet.delete(w.netId);
  }

  removeNet(netId: string): void {
    for (const id of [...(this.byNet.get(netId) ?? [])]) this.removeWire(id);
  }

  wiresOf(netId: string): PlacedWire[] {
    return (this.byNet.get(netId) ?? []).map((id) => this.wires.get(id)!);
  }

  conflicts(): Conflict[] {
    const out: Conflict[] = [];
    for (let c = 0; c < this.ends.length; c++) {
      if (this.ends[c].length > 1) out.push({ kind: 'end', cell: c });
      if (this.ends[c].length > 0 && this.lines[c * 2].length + this.lines[c * 2 + 1].length > 0) out.push({ kind: 'pass', cell: c });
      for (const o of [0, 1] as const) if (this.lines[c * 2 + o].length > 1) out.push({ kind: 'line', cell: c, o });
    }
    for (const [group, m] of [...this.viaUse].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))) {
      if (m.size > 1) out.push({ kind: 'via', group });
    }
    return out;
  }

  netsIn(conflicts: Conflict[]): Set<string> {
    const nets = new Set<string>();
    const add = (ids: string[]) => ids.forEach((id) => nets.add(this.wires.get(id)!.netId));
    for (const x of conflicts) {
      if (x.kind === 'end') add(this.ends[x.cell]);
      else if (x.kind === 'pass') add([...this.ends[x.cell], ...this.lines[x.cell * 2], ...this.lines[x.cell * 2 + 1]]);
      else if (x.kind === 'line') add(this.lines[x.cell * 2 + x.o]);
      else for (const id of this.viaUse.get(x.group)?.keys() ?? []) nets.add(id);
    }
    return nets;
  }

  bumpHistory(conflicts: Conflict[], increment: number): void {
    for (const x of conflicts) {
      if (x.kind === 'end' || x.kind === 'pass') this.histEnd[x.cell] += increment;
      else if (x.kind === 'line') this.histLine[x.cell * 2 + x.o] += increment;
      else this.histVia.set(x.group, (this.histVia.get(x.group) ?? 0) + increment);
    }
  }
}
```

- [ ] **Step 4: Implement `straightSearch.ts`**

```ts
import type { RoutingWeights } from '../../types/routing';
import { MinHeap } from './minHeap';
import type { RoutingNet, RoutingProblem } from './problem';
import type { StraightState } from './straightState';

export type OverlapMode = { kind: 'negotiate'; overlapBase: number; presentFactor: number } | { kind: 'hard' };

export interface SearchParams {
  weights: RoutingWeights;
  overlap: OverlapMode;
}

/** 一條直線（格子索引）：a、b 兩端，o = 0 水平、1 垂直，cells 是中間經過的格子。 */
export interface StraightLine {
  a: number;
  b: number;
  o: 0 | 1;
  cells: number[];
}

export interface FoundRoute {
  wires: StraightLine[];
  cost: number;
}

/** a、b 在同一列或同一欄時，兩點之間的直線。 */
export function lineBetween(problem: Pick<RoutingProblem, 'width'>, a: number, b: number): StraightLine {
  const w = problem.width;
  const o: 0 | 1 = Math.floor(a / w) === Math.floor(b / w) ? 0 : 1;
  const step = o === 0 ? Math.sign(b - a) : Math.sign(b - a) * w;
  if (o === 1 && a % w !== b % w) throw new Error('Cells are not in one row or column');
  const cells: number[] = [];
  for (let c = a + step; c !== b; c += step) cells.push(c);
  return { a, b, o, cells };
}

/** 已經有 count 個使用者時再用一次的成本：協商時越擠、歷史越多越貴；嚴格模式不允許。 */
function conflictCost(params: SearchParams, count: number, history: number): number {
  if (count === 0) return params.overlap.kind === 'negotiate' ? history : 0;
  if (params.overlap.kind === 'hard') return Infinity;
  return (params.overlap.overlapBase + history) * (1 + params.overlap.presentFactor * count);
}

/** 把線端插在 cell：孔上已有的線端、從上面經過的線都算衝突。 */
function endCost(state: StraightState, cell: number, params: SearchParams): number {
  const users = state.ends[cell].length + state.lines[cell * 2].length + state.lines[cell * 2 + 1].length;
  return conflictCost(params, users, state.histEnd[cell]);
}

/** 線從 cell 上方經過（方向 o）：別條線的端點、同方向的線是衝突；垂直的線是交叉；別的 Net 的終端空孔加擁擠成本。 */
function passCost(problem: RoutingProblem, state: StraightState, netId: string, cell: number, o: 0 | 1, params: SearchParams): number {
  let cost = conflictCost(params, state.ends[cell].length + state.lines[cell * 2 + o].length, state.histLine[cell * 2 + o]);
  cost += params.weights.crossing * state.lines[cell * 2 + (1 - o)].length;
  const g = problem.groupAt[cell];
  if (problem.terminalHole[cell] && !(g && state.owns(netId, g))) cost += params.weights.congestion;
  return cost;
}

/** 線端可以插在 group 嗎：自己的排（終端排、用過的轉接排），或空的五孔排（新的轉接排）。 */
function groupUse(problem: RoutingProblem, state: StraightState, netId: string, group: string): 'own' | 'via' | null {
  if (state.owns(netId, group)) return 'own';
  if (problem.railGroups.has(group) || problem.pinGroups.has(group)) return null;
  const owner = problem.groupOwner.get(group);
  return owner === undefined || owner === netId ? 'via' : null;
}

function viaCost(state: StraightState, netId: string, group: string, params: SearchParams): number {
  return params.weights.via + conflictCost(params, state.viaOthers(netId, group), state.histVia.get(group) ?? 0);
}

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

/**
 * 規格 2.1：從 sources 那些排的空孔出發、到 targets 任一排為止，最便宜的一串直線（Dijkstra）。
 * 狀態 = 孔 × {IN, OUT}：IN(h) 是一條線停在 h；OUT(h) 是一條線從 h 出發。換孔（同一排）不花成本，所以不用估計函式。
 */
export function findRoute(
  problem: RoutingProblem,
  state: StraightState,
  net: RoutingNet,
  sources: Set<string>,
  targets: Set<string>,
  params: SearchParams,
): FoundRoute | null {
  const { width, height, size, blocked, groupAt } = problem;
  const dist = new Float64Array(size * 2).fill(Infinity);
  const parent = new Int32Array(size * 2).fill(-1);
  const heap = new MinHeap();
  const relax = (s: number, cost: number, from: number) => {
    if (!Number.isFinite(cost) || cost >= dist[s]) return;
    dist[s] = cost;
    parent[s] = from;
    heap.push(cost, s);
  };
  for (const g of [...sources].sort()) for (const c of problem.freeHoles.get(g) ?? []) relax(c * 2 + 1, endCost(state, c, params), -1);

  while (heap.size > 0) {
    const top = heap.pop()!;
    const s = top.value;
    if (top.key > dist[s]) continue;
    const c = s >> 1;
    const g = groupAt[c]!;
    if ((s & 1) === 0) {
      if (targets.has(g)) return { wires: reconstruct(problem, parent, s), cost: dist[s] };
      for (const h of problem.freeHoles.get(g) ?? []) if (h !== c) relax(h * 2 + 1, dist[s] + endCost(state, h, params), s);
      continue;
    }
    for (let d = 0; d < 4; d++) {
      const o: 0 | 1 = d % 2 === 0 ? 0 : 1;
      let x = c % width;
      let y = Math.floor(c / width);
      let acc = dist[s] + params.weights.wire;
      for (let len = 1; ; len++) {
        x += DX[d];
        y += DY[d];
        if (x < 0 || y < 0 || x >= width || y >= height) break;
        const q = y * width + x;
        if (blocked[q]) break;
        const gq = groupAt[q];
        if (gq !== null && gq !== g) {
          const use = groupUse(problem, state, net.netId, gq);
          if (use) {
            let cost = acc + params.weights.distance * len + endCost(state, q, params);
            if (use === 'via') cost += viaCost(state, net.netId, gq, params);
            relax(q * 2, cost, s);
          }
        }
        acc += passCost(problem, state, net.netId, q, o, params);
        if (!Number.isFinite(acc)) break;
      }
    }
  }
  return null;
}

/** 狀態鏈 OUT → IN → OUT → IN …：每一對 OUT → IN 是一條線。 */
function reconstruct(problem: RoutingProblem, parent: Int32Array, goal: number): StraightLine[] {
  const chain: number[] = [];
  for (let s = goal; s !== -1; s = parent[s]) chain.push(s);
  chain.reverse();
  const out: StraightLine[] = [];
  for (let i = 0; i + 1 < chain.length; i++) {
    if ((chain[i] & 1) === 1 && (chain[i + 1] & 1) === 0) out.push(lineBetween(problem, chain[i] >> 1, chain[i + 1] >> 1));
  }
  return out;
}

/** 用和 findRoute 相同的成本定義，計算在目前 state 下放一條線的成本（改善階段比較新舊用）。 */
export function wireCost(problem: RoutingProblem, state: StraightState, net: RoutingNet, line: StraightLine, params: SearchParams): number {
  let cost = endCost(state, line.a, params) + params.weights.wire + params.weights.distance * (line.cells.length + 1) + endCost(state, line.b, params);
  for (const c of line.cells) cost += passCost(problem, state, net.netId, c, line.o, params);
  const g = problem.groupAt[line.b];
  if (g && groupUse(problem, state, net.netId, g) === 'via') cost += viaCost(state, net.netId, g, params);
  return cost;
}
```

- [ ] **Step 5: Run** `npx vitest run tests/routing/straightSearch.test.ts` → PASS（成本測試若和預期差一個 `endCost` 的歷史值，檢查 hard 模式下 history 為 0）。

- [ ] **Step 6: Commit** — `feat(routing): state and search for straight wires joined through strips`

---

### Task 3: 一個 Net 的生成樹（`straightNet.ts`）

**Files:**
- Create: `src/core/routing/straightNet.ts`
- Test: `tests/routing/straightNet.test.ts`

**Interfaces:**
- Consumes: Task 2 全部
- Produces: `NetRouteResult = { ok: true; cost: number } | { ok: false; reason: FailureReason; detail: string }`、
  `routeNet(problem, state, net, params): NetRouteResult`（成功時線已加進 state，ID `${netId}#k`）

- [ ] **Step 1: Failing tests** — `tests/routing/straightNet.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTING_CONFIG } from '../../src/core/routing/config';
import { buildRoutingProblem } from '../../src/core/routing/problem';
import { routeNet } from '../../src/core/routing/straightNet';
import type { SearchParams } from '../../src/core/routing/straightSearch';
import { StraightState } from '../../src/core/routing/straightState';
import { circuit, comp, wire } from '../fixtures/build';
import { acceptanceCircuit } from '../fixtures/circuits';

const hard: SearchParams = { weights: DEFAULT_ROUTING_CONFIG.weights, overlap: { kind: 'hard' } };

describe('routeNet with straight wires', () => {
  it('connects every cluster of a net and leaves no conflicts', () => {
    const p = buildRoutingProblem(acceptanceCircuit(), DEFAULT_ROUTING_CONFIG);
    const s = new StraightState(p);
    for (const net of p.nets.filter((n) => n.clusters.length >= 2)) expect(routeNet(p, s, net, hard)).toMatchObject({ ok: true });
    expect(s.conflicts()).toEqual([]);
  });

  it('uses its own rail as a bus', () => {
    // VCC 在 T+；兩顆 LED 的陽極都要接 VCC：兩條線都插在 T+ 上，不需要別的轉接排。
    const c = circuit([comp('V1', 'vcc', 'T+3'), comp('D1', 'led', 'C10'), comp('D2', 'led', 'C40')], [wire('u1', 'T+10', 'A10'), wire('u2', 'T+40', 'A40')]);
    const p = buildRoutingProblem(c, DEFAULT_ROUTING_CONFIG);
    const s = new StraightState(p);
    const net = p.nets.find((n) => n.kind === 'power')!;
    expect(routeNet(p, s, net, hard)).toMatchObject({ ok: true });
    const wires = s.wiresOf(net.netId);
    expect(wires).toHaveLength(2);
    for (const w of wires) expect([p.groupAt[w.a], p.groupAt[w.b]]).toContain('b1:rail-T+');
  });

  it('reports a cluster without free holes', () => {
    const c = circuit(
      [comp('R1', 'resistor', 'A20', { rotation: 90, span: 1 }), comp('R2', 'resistor', 'C20', { rotation: 90, span: 1 }), comp('D1', 'led', 'E20'), comp('D2', 'led', 'C40')],
      [wire('u1', 'A20', 'A40')],
    );
    const p = buildRoutingProblem(c, DEFAULT_ROUTING_CONFIG);
    const net = p.nets.find((n) => n.clusters.length >= 2)!;
    expect(routeNet(p, new StraightState(p), net, hard)).toMatchObject({ ok: false, reason: 'NO_FREE_HOLE' });
  });
});
```

- [ ] **Step 2: Run** → FAIL。

- [ ] **Step 3: Implement**

```ts
import type { FailureReason } from '../../types/routing';
import { describeGroup, type RoutingNet, type RoutingProblem } from './problem';
import { findRoute, type SearchParams } from './straightSearch';
import type { StraightState } from './straightState';

export type NetRouteResult = { ok: true; cost: number } | { ok: false; reason: FailureReason; detail: string };

/**
 * 規格 2.2：Prim 式生成樹。每次從「已連上的排」（終端排與用過的轉接排）找一串直線到任一還沒連上的簇，
 * 把線加進 state。呼叫前 state 裡不能有這個 Net 的線。
 */
export function routeNet(problem: RoutingProblem, state: StraightState, net: RoutingNet, params: SearchParams): NetRouteResult {
  const holesOf = (cluster: string[]) => cluster.flatMap((g) => problem.freeHoles.get(g) ?? []);
  const multiBoard = problem.boardIds.length > 1;
  const describe = (cluster: string[]) => cluster.map((g) => describeGroup(g, multiBoard)).join('＋');
  const full = net.clusters.find((cl) => holesOf(cl).length === 0);
  if (full) return { ok: false, reason: 'NO_FREE_HOLE', detail: `${describe(full)}沒有空孔可以接線` };

  const clusterOf = new Map<string, number>();
  net.clusters.forEach((cl, i) => cl.forEach((g) => clusterOf.set(g, i)));
  const connected = new Set(net.clusters[net.startCluster]);
  const remaining = new Set(net.clusters.map((_, i) => i).filter((i) => i !== net.startCluster));
  let cost = 0;
  let k = 0;
  while (remaining.size > 0) {
    const targets = new Set([...remaining].flatMap((i) => net.clusters[i]));
    const found = findRoute(problem, state, net, connected, targets, params);
    if (!found) {
      state.removeNet(net.netId);
      const missing = [...remaining].map((i) => describe(net.clusters[i])).join('、');
      return { ok: false, reason: 'UNROUTABLE', detail: `${net.netId} 無法連到 ${missing}` };
    }
    for (const line of found.wires) {
      state.addWire({ id: `${net.netId}#${k++}`, netId: net.netId, ...line });
      for (const end of [line.a, line.b]) {
        const g = problem.groupAt[end]!;
        if (!clusterOf.has(g)) connected.add(g);
      }
    }
    cost += found.cost;
    const reached = clusterOf.get(problem.groupAt[found.wires[found.wires.length - 1].b]!)!;
    for (const g of net.clusters[reached]) connected.add(g);
    remaining.delete(reached);
  }
  return { ok: true, cost };
}
```

- [ ] **Step 4: Run** → PASS。

- [ ] **Step 5: Commit** — `feat(routing): spanning tree of straight wires for one net`

---

### Task 4: `autoRoute` 換用新的狀態與搜尋；合法性檢查改寫；刪掉舊的 A*

**Files:**
- Modify: `src/core/routing/autoRoute.ts`、`src/core/routing/legality.ts`、`src/core/routing/score.ts`（`obstacleHits` 用 `cellsUnder`）
- Delete: `src/core/routing/astar.ts`、`src/core/routing/routeState.ts`、`src/core/routing/netTree.ts`、`tests/routing/astar.test.ts`、`tests/routing/netTree.test.ts`
- Modify tests: `tests/routing/legality.test.ts`（改寫）、`tests/routing/autoRoute.test.ts`、`tests/routing/specTests.test.ts`、`tests/routing/multiBoard.test.ts`
- Test: 同上

- [ ] **Step 1: Rewrite `tests/routing/legality.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { indexCircuit } from '../../src/core/circuit/circuitIndex';
import { extractNets } from '../../src/core/circuit/nets';
import { checkRoutingLegality, mismatchedNets } from '../../src/core/routing/legality';
import type { Wire } from '../../src/types/circuit';
import { circuit, comp, straightWire, wire, type Where } from '../fixtures/build';

// NET_1 = D1 陽極（第 10 欄上半）↔ D2 陽極（第 30 欄上半）；其他腳各自一個 Net。
const base = circuit([comp('D1', 'led', 'C10'), comp('D2', 'led', 'C30'), comp('D3', 'led', 'C50')], [wire('u1', 'A10', 'A30')]);
const NET = 'NET_1';
const auto = (id: string, from: Where, to: Where, netId: string | undefined = NET): Wire => ({ ...straightWire(id, from, to), source: 'auto', netId });
const codes = (wires: Wire[]) => checkRoutingLegality(base, wires).map((v) => v.code);

describe('checkRoutingLegality (straight wires)', () => {
  it('uses the expected reference net names', () => {
    expect(extractNets(base).map((n) => n.id)).toEqual(['NET_1', 'NET_2', 'NET_3', 'NET_4', 'NET_5']);
  });

  it('accepts one horizontal wire, and a turn through a free strip', () => {
    expect(codes([auto('a1', 'B10', 'B30')])).toEqual([]);
    expect(codes([auto('a1', 'A10', 'A20'), auto('a2', 'E20', 'E30')])).toEqual([]);
  });

  it('flags old path wires, diagonal wires and wires inside one strip', () => {
    expect(codes([{ ...wire('a1', 'B10', 'B30'), source: 'auto', netId: NET }])).toContain('PATH_INVALID');
    expect(codes([auto('a1', 'B10', 'D30')])).toContain('PATH_INVALID');
    expect(codes([auto('a1', 'A10', 'E10')])).toContain('PATH_INVALID');
  });

  it('flags endpoints on pins, in a foreign group, on a free rail, shared, or without a net', () => {
    expect(codes([auto('a1', 'C10', 'C30')])).toContain('ENDPOINT_INVALID');
    expect(codes([auto('a1', 'B10', 'B50')])).toContain('ENDPOINT_INVALID');
    expect(codes([auto('a1', 'A10', 'T+10'), auto('a2', 'T+30', 'A30')])).toContain('ENDPOINT_INVALID');
    expect(codes([auto('a1', 'B10', 'B30'), auto('a2', 'B10', 'B20')])).toContain('ENDPOINT_INVALID');
    expect(codes([auto('a1', 'B10', 'B30', undefined)])).toContain('ENDPOINT_INVALID');
  });

  it('flags wires that pass over a pin or another wire end', () => {
    expect(codes([auto('a1', 'C5', 'C15')])).toContain('THROUGH_OBSTACLE');
    expect(codes([auto('a1', 'B10', 'B30'), auto('a2', 'A20', 'E20')])).toContain('THROUGH_OBSTACLE');
  });

  it('flags overlapping wires', () => {
    expect(codes([auto('a1', 'B10', 'B30'), auto('a2', 'B12', 'B40')])).toContain('OVERLAP');
  });

  it('flags missing and merged connections, including a strip shared by two nets', () => {
    expect(codes([])).toContain('NET_MISMATCH');
    const index = indexCircuit(base);
    const reference = extractNets(base);
    expect(mismatchedNets(index, reference, [])).toEqual(['NET_1']);
    const merging: Wire[] = [auto('a1', 'B10', 'B30'), auto('a2', 'A50', 'A40', 'NET_4'), auto('a3', 'E40', 'E35', 'NET_4')];
    expect(mismatchedNets(index, reference, merging)).toEqual(['NET_4']);
    const sharing: Wire[] = [auto('a1', 'A10', 'A20'), auto('a2', 'E20', 'E30'), auto('a3', 'B50', 'B20', 'NET_4')];
    expect(codes(sharing)).toContain('NET_MISMATCH');
  });
});
```

（`merging` 的期望值實作時以 `extractNets` 實際的 Net 名稱核對；若 D3 陽極的 Net 不是 NET_4，改成正確的名稱並記 Ruling。）

- [ ] **Step 2: Rewrite `legality.ts` `checkRoutingLegality`**

```ts
/** 獨立於佈線器的檢查（規格第 3 節）：任何一項不通過，autoRoute 就不能輸出那個 Net 的線。 */
export function checkRoutingLegality(circuit: Circuit, wires: Wire[]): LegalityViolation[] {
  const index = indexCircuit(circuit);
  const reference = extractNetsWith(index, circuit.wires);
  const terminals = new Map(reference.map((net) => [net.id, new Set(terminalGroupIds(net, index))]));
  const lattice = buildLattice(circuit.boards);
  const isOnBoard = (p: GridPoint) => isRoutablePoint(lattice, p);
  const pinGroups = new Set(index.placed.flatMap((pc) => pc.footprint.pins.map((pin) => groupOfPoint(index, pin.point)).filter((g): g is string => g !== null)));
  const endsAt = new Map<string, string[]>();
  for (const w of wires) for (const p of [w.start, w.end]) pushTo(endsAt, nodeIdOf(p), w.id);
  const out: LegalityViolation[] = [];
  for (const w of wires) {
    const netIds = w.netId ? [w.netId] : [];
    const issues: string[] = pathIssues(w, isOnBoard, lattice);
    const a = latticeOf(lattice, w.start);
    const b = latticeOf(lattice, w.end);
    if (!isStraight(w)) issues.push('NOT_STRAIGHT');
    else if (a && b && a.x !== b.x && a.y !== b.y) issues.push('DIAGONAL');
    const groups = [w.start, w.end].map((p) => nodeAt(index, p)?.groupId ?? null);
    if (groups[0] !== null && groups[0] === groups[1]) issues.push('SAME_GROUP');
    if (issues.length > 0) out.push({ code: 'PATH_INVALID', wireIds: [w.id], netIds, detail: issues.join(', ') });
    const allowed = w.netId ? terminals.get(w.netId) : undefined;
    for (const end of [w.start, w.end]) {
      const node = nodeAt(index, end);
      const id = nodeIdOf(end);
      const g = node?.groupId ?? null;
      const groupOk = g !== null && allowed !== undefined && (allowed.has(g) || (groupInfo(index, g)?.kind !== 'rail' && !pinGroups.has(g)));
      const ok = node !== undefined && node.kind === 'hole' && groupOk && !index.pinsAt.has(id) && !index.bodiesAt.has(id) && (endsAt.get(id)?.length ?? 0) === 1;
      if (!ok) out.push({ code: 'ENDPOINT_INVALID', wireIds: [w.id], netIds, detail: node?.name ?? id });
    }
    const obstacle = cellsUnder(w, lattice).find((p) => {
      const id = nodeIdOf(p);
      return index.pinsAt.has(id) || index.bodiesAt.has(id) || endsAt.has(id);
    });
    if (obstacle) out.push({ code: 'THROUGH_OBSTACLE', wireIds: [w.id], netIds, detail: nodeIdOf(obstacle) });
  }
  const netOfWire = new Map(wires.map((w) => [w.id, w.netId]));
  for (const o of analyzeWireInteractions(wires, lattice).overlaps) {
    const netIds = [...new Set(o.wireIds.map((id) => netOfWire.get(id)).filter((n): n is string => n !== undefined))].sort(compareIds);
    out.push({ code: 'OVERLAP', wireIds: [...o.wireIds], netIds, detail: o.nodeId });
  }
  for (const netId of mismatchedNets(index, reference, wires)) {
    out.push({ code: 'NET_MISMATCH', wireIds: wires.filter((w) => w.netId === netId).map((w) => w.id), netIds: [netId], detail: `${netId} 的連接關係與原電路不同` });
  }
  return out;
}
```

（import：`groupInfo, groupOfPoint` from circuitIndex、`latticeOf`、`cellsUnder, isStraight`。保留檔案裡原本的 `mismatchedNets`。）

- [ ] **Step 3: `autoRoute.ts`** — import 改成 `StraightState`、`routeNet`（straightNet）、`wireCost` / `SearchParams`（straightSearch）；
  `routeCanvas` 裡：`new StraightState(problem)`；`state.conflictedNodes()` → `state.conflicts()`；
  `for (const node of conflicts) state.history[node] += …` → `state.bumpHistory(conflicts, config.negotiation.historyIncrement)`；
  `state.netsAt(conflicts)` → `state.netsIn(conflicts)`；`dropConflicts` 同樣改；`rerouteIfCheaper`：

```ts
function rerouteIfCheaper(problem: RoutingProblem, state: StraightState, net: RoutingNet, hard: SearchParams): boolean {
  const old = state.wiresOf(net.netId).map((w) => ({ ...w, cells: [...w.cells] }));
  state.removeNet(net.netId);
  let oldCost = 0;
  for (const w of old) {
    oldCost += wireCost(problem, state, net, w, hard);
    state.addWire(w);
  }
  state.removeNet(net.netId);
  const result = routeNet(problem, state, net, hard);
  if (result.ok && result.cost < oldCost - 1e-9) return true;
  state.removeNet(net.netId);
  for (const w of old) state.addWire(w);
  return false;
}

function toWire(problem: RoutingProblem, placed: PlacedWire, net: RoutingNet, k: number): Wire {
  const start = toPoint(problem, placed.a);
  const end = toPoint(problem, placed.b);
  return { id: `w_${net.netId}_${k + 1}`, color: net.color, source: 'auto', netId: net.netId, straight: true, start, end, path: [{ ...start }, { ...end }] };
}
```

`score.ts`：`obstacleHits` 的 `w.path.slice(1, -1)` 改 `cellsUnder(w, lattice)`。

刪掉 `astar.ts`、`routeState.ts`、`netTree.ts` 與 `tests/routing/astar.test.ts`、`tests/routing/netTree.test.ts`。

- [ ] **Step 4: Update routing tests**

`autoRoute.test.ts`：`uses one wire per extra terminal group` 改成：

```ts
  it('routes with straight horizontal or vertical wires only, one wire end per hole', () => {
    const r = autoRoute(acceptanceCircuit());
    expect(r.metrics.wireCount).toBeGreaterThanOrEqual(7);
    for (const w of r.wires) {
      expect(w.straight).toBe(true);
      expect(w.start.x === w.end.x || w.start.y === w.end.y).toBe(true);
    }
    const ends = r.wires.flatMap((w) => [nodeIdOf(w.start), nodeIdOf(w.end)]);
    expect(new Set(ends).size).toBe(ends.length);
  });
```

`specTests.test.ts`：Test 1 改成檢查每條線 `straight`、同 x 或同 y（可以有多條線）；Test 4 改成：

```ts
    const icCells = new Set(indexCircuit(c).placedById.get('U1')!.footprint.blocked.map(nodeIdOf));
    const lattice = buildLattice(c.boards);
    expect(r.wires.flatMap((w) => [w.start, w.end, ...cellsUnder(w, lattice)]).some((p) => icCells.has(nodeIdOf(p)))).toBe(false);
```

`multiBoard.test.ts` #9 #10：`stepDirection` 迴圈改成「每條線 straight、全域座標同 x 或同 y」（用 `latticeOf`）。

- [ ] **Step 5: Run** `npx vitest run tests/routing tests/circuit` → 期望全部通過；`fixtures.test.ts` 若有電路沒佈完或分數不到 90，進入 Task 5 校準。

- [ ] **Step 6: Commit** — `feat(routing): auto-route with straight wires joined through strips; legality checks the new standard`

---

### Task 5: 校準與範例電路

**Files:**
- Modify: `src/core/routing/config.ts`（必要時）、`tests/routing/fixtures.test.ts`（必要時調整完成標準，記 Ruling）
- Test: `tests/routing/fixtures.test.ts`、`tests/routing/performance.test.ts`、新增 `tests/routing/examples.test.ts`

- [ ] **Step 1: Failing test** — `tests/routing/examples.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { validateCircuit } from '../../src/core/circuit/validate';
import { applyRouting } from '../../src/core/routing/apply';
import { autoRoute } from '../../src/core/routing/autoRoute';
import { checkRoutingLegality } from '../../src/core/routing/legality';
import { EXAMPLES } from '../../src/editor/examples';

describe.each(EXAMPLES.map((ex) => [ex.name, ex] as const))('example %s', (_name, ex) => {
  it('routes fully with straight wires and stays error-free', () => {
    const c = ex.build();
    const r = autoRoute(c);
    expect(r.failedNets).toEqual([]);
    expect(checkRoutingLegality(c, r.wires)).toEqual([]);
    expect(r.wires.every((w) => w.straight === true)).toBe(true);
    expect(validateCircuit(applyRouting(c, r)).filter((e) => e.severity === 'error')).toEqual([]);
  });
});
```

（`EXAMPLES` 的匯出名稱以 `src/editor/examples.ts` 為準。）

- [ ] **Step 2: Run** `npx vitest run tests/routing` → 看哪些電路失敗、分數、時間。

- [ ] **Step 3: Calibrate** — 依失敗原因調整：`via`（太高 → 找不到路時多用轉接排）、`wire`、`negotiation.maxIterations`、`timeBudgetMs`；
  只動 `config.ts` 的數字。每次調整記一條 Ruling（改了什麼、為什麼、結果）。完成標準中「分數 ≥ 90」若因為新標準本質上的線數增加而無法達到，
  改成新標準下合理的門檻並記 Ruling（說明原因與實際分數）。

- [ ] **Step 4: Run** `npm test`（全部）→ PASS；`performance.test.ts` 在預算內。

- [ ] **Step 5: Commit** — `test(routing): every example routes with straight wires; calibrate weights`

---

### Task 6: 端對端與文件

- [ ] **Step 1:** `e2e/acceptance.spec.ts` 按「AI 標準佈線」之後加：讀存檔，每條線 `straight === true`、兩端同 x 或同 y。其他既有 e2e 照跑。
- [ ] **Step 2:** Edge 跑全部 e2e → PASS（若接線清單、比較等 e2e 依賴舊的線數，依新標準更新期望並記 Ruling）。
- [ ] **Step 3:** 文件：README 功能表「AI 標準佈線」那一列改寫（直線跳線、轉接排、一孔一線）；路線圖 7 → ✅；CHANGELOG 子專案 7 區段；
  PROGRESS；規格狀態；操作說明對話框裡的佈線說明（`Dialogs.tsx` `HelpDialog` 的段落）改成新標準。
- [ ] **Step 4:** Commit — `docs: sub-project 7 (straight-wire routing standard) is done`；之後在本機發布網站（`npm run publish:site`）要等 PR 合併後才做。
