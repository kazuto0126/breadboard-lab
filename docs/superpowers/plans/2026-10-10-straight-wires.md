# 直線導線 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手動接線變成兩個孔之間的直線（可以斜），經過障礙或重疊不允許、一孔多線可以，選取導線後可以拖曳端點改接。

**Architecture:** `Wire.straight?: true` 標記直線導線（`path` 固定 `[start, end]`）。幾何集中在 `core/circuit/wireGeometry.ts`
（線段、經過的孔、長度、重疊、交叉），檢查、統計、佔用都改用它。`editor/manualWire.ts` 的 `straightWireProblem` 是拉線與拖曳端點共用的規則；
store 的 `addWire(start, end)` / `moveWireEnd` 先檢查再 commit。畫面的預覽沿用 `PathPreview`，選取的導線多兩個把手。

**Tech Stack:** TypeScript、React 19、Zustand、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-10-straight-wires-design.md`

## Global Constraints

- 直線導線：`straight: true`、`path` 恰好是 `[start, end]`；舊的路徑導線（沒有 `straight`）行為不變，自動佈線輸出不變。
- 「經過」：全域格子座標下，線段穿過以孔為中心、半邊長 `HOLE_HALF = 0.45` 的正方形；兩端的孔不算。
- 重疊：共線且共用長度 > 0；交叉（只交一點）不算錯。
- 手動接線允許一孔多線；元件腳、被本體蓋住的孔不能當端點。
- `src/core`、`src/editor` 不能用 DOM；介面文字、註解繁體中文；每個任務 commit + push，更新 PROGRESS / CHANGELOG。
- 推送前 `npm run typecheck && npm test`；畫面改動跑 e2e（本機用 Edge：`PLAYWRIGHT_CHROMIUM_EXECUTABLE="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"`）。

## Review Focus

1. 斜線剛好從兩個孔之間的對角穿過：不能把兩邊的孔都算「經過」。→ Task 1 測試「a diagonal through the gap between holes touches none」。
2. 線的端點落在另一條線經過的孔上（另一條線會變成經過障礙）：拉線時要擋下。→ Task 3 測試「refuses an end under another wire」。
3. 拖曳端點時忽略自己（不能因為「和自己重疊」被拒絕），放回原孔不產生 Undo。→ Task 4 store 測試。
4. 跨 Board Group 的直線（兩塊貼合的板子）：經過的孔要換算到正確的板子。→ Task 1 測試「maps cells to the right board across the seam」。
5. 錯誤解說的建議線改成直線後，照著拉線仍然要讓錯誤消失，且不能經過障礙。→ Task 5 沿用現有的「照著做錯誤消失」測試。

---

### Task 1: 直線幾何（`wireGeometry.ts`、`Wire.straight`、builder）

**Files:**
- Modify: `src/types/circuit.ts`（`Wire.straight?: true`）、`src/core/circuit/wireGeometry.ts`、`src/editor/builder.ts`（`straightWire`）
- Test: `tests/circuit/straightWires.test.ts`

**Interfaces:**
- Produces（`wireGeometry.ts`）：`HOLE_HALF`、`LPoint`、`Segment`、`isStraight(w)`、`wireSegments(w, lattice?)`、`wireLength(w, lattice?)`、
  `cellsUnder(w, lattice?)`、`segmentOverlap(s, t)`、`segmentCrossing(s, t)`；`PathIssue` 加 `'NOT_SAME_GROUP'`；
  `pathIssues`、`analyzeWireInteractions` 支援直線。
- Produces（builder）：`straightWire(id: string, from: Where, to: Where): Wire`

- [ ] **Step 1: Write the failing test** — `tests/circuit/straightWires.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { buildLattice } from '../../src/core/breadboard/lattice';
import { nodeIdOf } from '../../src/core/breadboard/naming';
import { analyzeWireInteractions, cellsUnder, pathIssues, segmentCrossing, segmentOverlap, wireLength, wireSegments } from '../../src/core/circuit/wireGeometry';
import { board, circuit, holeOn, hole, pt, straightWire, wire } from '../fixtures/build';

const ids = (points: Array<{ boardId: string; x: number; y: number }>) => points.map(nodeIdOf);
const seg = (ax: number, ay: number, bx: number, by: number) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });

describe('straight wire geometry', () => {
  const lattice = buildLattice(circuit([]).boards);

  it('builds a straight wire with exactly its two ends as the path', () => {
    const w = straightWire('s1', 'A10', 'C14');
    expect(w).toMatchObject({ id: 's1', straight: true, source: 'manual', start: hole('A10'), end: hole('C14') });
    expect(w.path).toEqual([hole('A10'), hole('C14')]);
  });

  it('lists the holes a horizontal or vertical wire passes over, without its ends', () => {
    expect(ids(cellsUnder(straightWire('h', 'A10', 'A13'), lattice))).toEqual(ids([hole('A11'), hole('A12')]));
    expect(ids(cellsUnder(straightWire('v', 'A10', 'T+10'), lattice))).toEqual(ids([pt(10, 3)]));
  });

  it('a diagonal through the gap between holes touches none, a steeper one touches both neighbours', () => {
    // (10,4) → (12,6)：正好穿過 (11,5) 的中心。
    expect(ids(cellsUnder(straightWire('d', 'A10', 'C12'), lattice))).toEqual(ids([hole('B11')]));
    // (10,4) → (11,5)：只經過兩個孔的角落之間，不算經過任何孔。
    expect(cellsUnder(straightWire('d2', 'A10', 'B11'), lattice)).toEqual([]);
    // (10,4) → (12,5)：在 x = 11 時 y = 4.5，兩邊的孔都被碰到。
    expect(ids(cellsUnder(straightWire('d3', 'A10', 'B12'), lattice))).toEqual(ids([hole('A11'), hole('B11')]));
  });

  it('maps cells to the right board across the seam of a board group', () => {
    const boards = [board('b1'), board('b2', 0, 20)];
    const l = buildLattice(boards);
    const cells = cellsUnder(straightWire('x', holeOn('b1', 'J12') as never, holeOn('b2', 'A12') as never), l);
    expect(new Set(cells.map((p) => p.boardId))).toEqual(new Set(['b1', 'b2']));
    expect(ids(cells)).toContain(nodeIdOf(holeOn('b1', 'B+12')));
  });

  it('measures length as the straight distance, and old path wires by their steps', () => {
    expect(wireLength(straightWire('a', 'A10', 'A13'), lattice)).toBe(3);
    expect(wireLength(straightWire('b', 'A10', 'D14'), lattice)).toBeCloseTo(5);
    expect(wireLength(wire('p', 'A10', 'A12', 'C12'))).toBe(4);
  });

  it('splits an old path wire into straight runs', () => {
    expect(wireSegments(wire('p', 'A10', 'A12', 'C12'))).toEqual([seg(10, 4, 12, 4), seg(12, 4, 12, 6)]);
  });

  it('finds collinear overlaps and single-point crossings', () => {
    expect(segmentOverlap(seg(0, 0, 4, 0), seg(2, 0, 6, 0))).toEqual({ x: 2, y: 0 });
    expect(segmentOverlap(seg(0, 0, 4, 0), seg(4, 0, 6, 0))).toBeNull(); // 只碰到端點
    expect(segmentOverlap(seg(0, 0, 4, 4), seg(2, 2, 6, 6))).toEqual({ x: 2, y: 2 });
    expect(segmentCrossing(seg(0, 0, 4, 4), seg(0, 4, 4, 0))).toEqual({ x: 2, y: 2 });
    expect(segmentCrossing(seg(0, 0, 4, 0), seg(4, 0, 4, 3))).toBeNull(); // 端點相接不算交叉
    expect(segmentCrossing(seg(0, 0, 4, 0), seg(2, 0, 6, 0))).toBeNull(); // 共線交給 segmentOverlap
  });

  it('reports overlaps and crossings that involve straight wires', () => {
    const wires = [straightWire('s1', 'A10', 'A20'), straightWire('s2', 'A15', 'A25'), straightWire('s3', 'B12', 'D14'), straightWire('s4', 'D12', 'B14'), wire('p1', 'E30', 'E40')];
    const { overlaps, crossings } = analyzeWireInteractions(wires, lattice);
    expect(overlaps.map((o) => o.wireIds)).toEqual([['s1', 's2']]);
    expect(crossings.map((o) => o.wireIds)).toEqual([['s3', 's4']]);
    expect(analyzeWireInteractions([straightWire('s5', 'E31', 'E35'), wire('p1', 'E30', 'E40')], lattice).overlaps.map((o) => o.wireIds)).toEqual([['p1', 's5']]);
  });

  it('checks a straight wire only by its two ends', () => {
    const onBoard = () => true;
    expect(pathIssues(straightWire('s', 'A10', 'J40'), onBoard, lattice)).toEqual([]);
    expect(pathIssues(straightWire('s', 'A10', 'A10'), onBoard, lattice)).toContain('TOO_SHORT');
    const apart = buildLattice([board('b1'), board('b2', 0, 40)]);
    expect(pathIssues(straightWire('s', holeOn('b1', 'A1') as never, holeOn('b2', 'A1') as never), onBoard, apart)).toContain('NOT_SAME_GROUP');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/circuit/straightWires.test.ts`
Expected: FAIL（`straightWire` / `cellsUnder` 不存在）。

- [ ] **Step 3: Implement**

`src/types/circuit.ts` 的 `Wire` 加：

```ts
  /** 直線導線（手動拉的線、拖曳端點後的線）：path 固定是 [start, end]，可以是斜的。沒有這個欄位的是相鄰格點組成的路徑導線。 */
  straight?: true;
```

`src/editor/builder.ts` 加：

```ts
/** 兩孔之間的一條直線導線（可以斜）。 */
export function straightWire(id: string, from: Where, to: Where): Wire {
  const start = toPoint(from);
  const end = toPoint(to);
  return { id, color: '#888888', source: 'manual', straight: true, start, end, path: [start, end] };
}
```

（`toPoint` 已經接受 `GridPoint` 以外的 `Where`；測試裡跨板用 `holeOn(...) as never` 傳入 GridPoint 時，把 `toPoint` 改成：`typeof where === 'string' ? hole(where) : Array.isArray(where) ? pt(where[0], where[1]) : where`，
並把 `Where` 型別改成 `string | [number, number] | GridPoint`。）

`src/core/circuit/wireGeometry.ts`：import 加 `latticeOf, pointAt`，`PathIssue` 加 `'NOT_SAME_GROUP'`，並加上：

```ts
/** 「經過」一個孔：線段穿過以孔為中心、半邊長 0.45 格的正方形（斜線從兩孔正中間的對角穿過時不算）。 */
export const HOLE_HALF = 0.45;

export interface LPoint {
  x: number;
  y: number;
}

export interface Segment {
  a: LPoint;
  b: LPoint;
}

export function isStraight(wire: Wire): boolean {
  return wire.straight === true;
}

/** 格點的全域座標；沒有 lattice（或板子不存在）時用板內座標。 */
function at(p: GridPoint, lattice?: Lattice): LPoint {
  return (lattice && latticeOf(lattice, p)) || { x: p.x, y: p.y };
}

/** 導線的直線段（全域座標）：直線導線一段；路徑導線把同方向的連續格點合成一段。 */
export function wireSegments(wire: Wire, lattice?: Lattice): Segment[] {
  if (isStraight(wire)) return [{ a: at(wire.start, lattice), b: at(wire.end, lattice) }];
  const pts = wire.path.map((p) => at(p, lattice));
  const out: Segment[] = [];
  let from = 0;
  for (let i = 1; i < pts.length; i++) {
    const last = i === pts.length - 1;
    const turns =
      !last && (pts[i + 1].x - pts[i].x !== pts[i].x - pts[i - 1].x || pts[i + 1].y - pts[i].y !== pts[i].y - pts[i - 1].y);
    if (last || turns) {
      out.push({ a: pts[from], b: pts[i] });
      from = i;
    }
  }
  return out;
}

/** 長度（格）：直線導線是兩端的直線距離，路徑導線是步數。 */
export function wireLength(wire: Wire, lattice?: Lattice): number {
  if (!isStraight(wire)) return Math.max(0, wire.path.length - 1);
  const [s] = wireSegments(wire, lattice);
  return Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
}

/** Liang–Barsky：線段是否穿過以 (cx, cy) 為中心、半邊長 h 的正方形。 */
function hitsSquare(s: Segment, cx: number, cy: number, h = HOLE_HALF): boolean {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, s.a.x - (cx - h)) && clip(dx, cx + h - s.a.x) && clip(-dy, s.a.y - (cy - h)) && clip(dy, cy + h - s.a.y) && t0 <= t1;
}

/** 導線經過的格點（不含兩端），沿線排序。路徑導線就是路徑中間的點；直線導線用 hitsSquare 判斷，跨板時換算到格點所在的板子。 */
export function cellsUnder(wire: Wire, lattice?: Lattice): GridPoint[] {
  if (!isStraight(wire)) return wire.path.slice(1, -1);
  const [s] = wireSegments(wire, lattice);
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const len2 = dx * dx + dy * dy;
  const found: Array<{ t: number; p: GridPoint }> = [];
  for (let x = Math.min(s.a.x, s.b.x); x <= Math.max(s.a.x, s.b.x); x++) {
    for (let y = Math.min(s.a.y, s.b.y); y <= Math.max(s.a.y, s.b.y); y++) {
      if ((x === s.a.x && y === s.a.y) || (x === s.b.x && y === s.b.y)) continue;
      if (!hitsSquare(s, x, y)) continue;
      const p = lattice ? pointAt(lattice, x, y) : { boardId: wire.start.boardId, x, y };
      if (p) found.push({ t: len2 === 0 ? 0 : ((x - s.a.x) * dx + (y - s.a.y) * dy) / len2, p });
    }
  }
  return found.sort((a, b) => a.t - b.t).map((f) => f.p);
}

const cross = (o: LPoint, a: LPoint, b: LPoint) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** 兩條線段共線且共用一段長度 > 0：回傳共用部分在 s 上的起點；否則 null。 */
export function segmentOverlap(s: Segment, t: Segment): LPoint | null {
  if (cross(s.a, s.b, t.a) !== 0 || cross(s.a, s.b, t.b) !== 0) return null;
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return null;
  const proj = (p: LPoint) => ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / len2;
  const lo = Math.max(0, Math.min(proj(t.a), proj(t.b)));
  const hi = Math.min(1, Math.max(proj(t.a), proj(t.b)));
  if (hi - lo <= 1e-9) return null;
  return { x: s.a.x + dx * lo, y: s.a.y + dy * lo };
}

/** 兩條線段在各自的中段交於一點（X 形交叉）：回傳交點；端點相接、共線都回傳 null。 */
export function segmentCrossing(s: Segment, t: Segment): LPoint | null {
  const d1 = cross(t.a, t.b, s.a);
  const d2 = cross(t.a, t.b, s.b);
  const d3 = cross(s.a, s.b, t.a);
  const d4 = cross(s.a, s.b, t.b);
  if (d1 * d2 < 0 && d3 * d4 < 0) {
    const r = d1 / (d1 - d2);
    return { x: s.a.x + (s.b.x - s.a.x) * r, y: s.a.y + (s.b.y - s.a.y) * r };
  }
  return null;
}
```

`pathIssues` 開頭加：

```ts
  if (isStraight(wire)) {
    const ends = [nodeIdOf(wire.start), nodeIdOf(wire.end)];
    if (wire.path.length !== 2 || nodeIdOf(wire.path[0]) !== ends[0] || nodeIdOf(wire.path[1]) !== ends[1]) issues.add('ENDPOINT_MISMATCH');
    if (ends[0] === ends[1]) issues.add('TOO_SHORT');
    if (!isOnBoard(wire.start) || !isOnBoard(wire.end)) issues.add('OUT_OF_BOARD');
    if (lattice && lattice.groupOf.get(wire.start.boardId) !== lattice.groupOf.get(wire.end.boardId)) issues.add('NOT_SAME_GROUP');
    return [...issues];
  }
```

`analyzeWireInteractions`：把現有內容改名為 `nodeInteractions(wires, lattice)`（只處理路徑導線），新的 `analyzeWireInteractions`：

```ts
/** 兩條路徑導線之間沿用格點規則；牽涉直線導線的用線段幾何：共線共用一段 = 重疊，中段交於一點 = 交叉。 */
export function analyzeWireInteractions(wires: Wire[], lattice?: Lattice): { overlaps: WireConflict[]; crossings: WireConflict[] } {
  const result = nodeInteractions(wires.filter((w) => !isStraight(w)), lattice);
  const segs = new Map(wires.map((w) => [w.id, wireSegments(w, lattice)]));
  const nodeOf = (p: LPoint, w: Wire) => {
    const q = lattice ? pointAt(lattice, Math.round(p.x), Math.round(p.y)) : null;
    return nodeIdOf(q ?? { boardId: w.start.boardId, x: Math.round(p.x), y: Math.round(p.y) });
  };
  for (let i = 0; i < wires.length; i++) {
    for (let j = i + 1; j < wires.length; j++) {
      const a = wires[i];
      const b = wires[j];
      if (!isStraight(a) && !isStraight(b)) continue;
      const wireIds: [string, string] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
      let overlap: LPoint | null = null;
      for (const s of segs.get(a.id)!) for (const t of segs.get(b.id)!) {
        overlap ??= segmentOverlap(s, t);
        const x = segmentCrossing(s, t);
        if (x) result.crossings.push({ nodeId: nodeOf(x, a), wireIds });
      }
      if (overlap) result.overlaps.push({ nodeId: nodeOf(overlap, a), wireIds });
    }
  }
  return result;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/circuit/straightWires.test.ts tests/circuit`
Expected: PASS（新檔 9 個；舊的 circuit 測試不受影響）。若某個孔位的預期值算錯（例如 `B+12` 不在線上），以實際幾何重新核對後修正測試，記一條 Ruling。

- [ ] **Step 5: Commit** — `feat(core): geometry for straight wires (cells passed over, length, overlaps, crossings)`

---

### Task 2: 檢查、統計、佔用、存檔、說明文字改用直線幾何

**Files:**
- Modify: `src/core/circuit/validate.ts`、`src/core/routing/metrics.ts`、`src/editor/placement.ts`、`src/core/circuit/nodeState.ts`、
  `src/components/common/describe.ts`、`src/editor/checklist.ts`、`src/debug/ascii.ts`、`src/editor/fileFormat.ts`
- Test: `tests/circuit/straightWires.test.ts`（新增 describe）、`tests/editor/fileFormat.test.ts`（若存在，否則加在 straightWires）

**Interfaces:**
- Consumes: Task 1 的 `cellsUnder`、`wireLength`、`isStraight`、`analyzeWireInteractions`
- Produces: Check Circuit 對直線導線的規則；`computeMetrics` 的 `totalLength` 四捨五入到小數一位

- [ ] **Step 1: Write the failing tests**（加到 `tests/circuit/straightWires.test.ts`）

```ts
import { validateCircuit } from '../../src/core/circuit/validate';
import { computeMetrics } from '../../src/core/routing/metrics';
import { buildOccupancy } from '../../src/editor/placement';
import { parseCircuitData, toCircuitFile } from '../../src/editor/fileFormat';
import { comp } from '../fixtures/build';

const codes = (c: ReturnType<typeof circuit>) => validateCircuit(c).map((e) => e.code);

describe('checking straight wires', () => {
  it('flags a straight wire that passes over an IC or another wire end, but not a crossing', () => {
    const ic = comp('U1', '74LS00', 'F10');
    expect(codes(circuit([ic], [straightWire('s1', 'D8', 'H14')]))).toContain('WIRE_THROUGH_OBSTACLE');
    expect(codes(circuit([], [straightWire('s1', 'A10', 'A20'), straightWire('s2', 'C15', 'A15')]))).toContain('WIRE_THROUGH_OBSTACLE');
    const crossing = codes(circuit([], [straightWire('s1', 'B12', 'D14'), straightWire('s2', 'D12', 'B14')]));
    expect(crossing).not.toContain('WIRE_OVERLAP');
    expect(crossing).not.toContain('WIRE_THROUGH_OBSTACLE');
  });

  it('flags collinear overlaps', () => {
    expect(codes(circuit([], [straightWire('s1', 'A10', 'A20'), straightWire('s2', 'A15', 'A25')]))).toContain('WIRE_OVERLAP');
  });

  it('allows several wires in one hole', () => {
    expect(codes(circuit([], [straightWire('s1', 'A10', 'A20'), straightWire('s2', 'A20', 'E25')]))).not.toContain('WIRE_ENDPOINT_INVALID');
  });

  it('counts straight length, no bends, and crossings in the metrics', () => {
    const m = computeMetrics([straightWire('s1', 'B12', 'D14'), straightWire('s2', 'D12', 'B14')]);
    expect(m.totalLength).toBeCloseTo(5.7, 5);
    expect(m.bends).toBe(0);
    expect(m.crossings).toBe(1);
  });

  it('marks the holes a straight wire passes over as wire paths', () => {
    const occ = buildOccupancy(circuit([], [straightWire('s1', 'A10', 'A13')]), 'b1');
    expect([...occ.wirePaths].sort()).toEqual([nodeIdOf(hole('A11')), nodeIdOf(hole('A12'))].sort());
  });

  it('saves and loads the straight flag', () => {
    const c = circuit([], [straightWire('s1', 'A10', 'C14')]);
    const text = JSON.stringify(toCircuitFile(c, 't'));
    const back = parseCircuitData(JSON.parse(text));
    expect(back.ok && back.circuit.wires[0]).toMatchObject({ straight: true, path: [hole('A10'), hole('C14')] });
    const raw = JSON.parse(text);
    raw.circuit.wires[0].path = [hole('A10'), hole('B10'), hole('C14')];
    const fixed = parseCircuitData(raw);
    expect(fixed.ok && fixed.circuit.wires[0].path).toEqual([hole('A10'), hole('C14')]);
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/circuit/straightWires.test.ts`；Expected: 新的 describe FAIL（經過、一孔多線、長度、佔用、存檔）。

- [ ] **Step 3: Implement**

`validate.ts` `checkWires`：
- import `cellsUnder` from `./wireGeometry`。
- 刪掉 `sharedEndReported` 與「同時插了多條導線」那個 `else if` 分支（`endsAt` 保留給經過檢查）。
- `const blockedAt = w.path.slice(1, -1).find(` 改成 `const blockedAt = cellsUnder(w, lattice).find(`。

`metrics.ts`：

```ts
    totalLength: Math.round(wires.reduce((sum, w) => sum + wireLength(w, lattice), 0) * 10) / 10,
```

（import `wireLength`。）

`placement.ts` `buildOccupancy`：在迴圈前 `const lattice = buildLattice(circuit.boards);`，`for (const p of w.path.slice(1, -1))` 改成 `for (const p of cellsUnder(w, lattice))`。

`nodeState.ts`：同樣用 `cellsUnder(w, buildLattice(circuit.boards))`。

`describe.ts`：`holeContents` 的 `w.path.slice(1, -1)` 改 `cellsUnder(w, buildLattice(circuit.boards))`；`wireSummary`：

```ts
export function wireSummary(wire: Wire, circuit: Pick<Circuit, 'boards'>): string {
  const lattice = buildLattice(circuit.boards);
  const boards = new Set(wire.path.map((p) => p.boardId));
  const across = boards.size > 1 ? ` · 跨 ${[...boards].join('、')}` : '';
  if (isStraight(wire)) return `直線 · ${Math.round(wireLength(wire, lattice) * 10) / 10} 格${across}`;
  return `${wire.path.length - 1} 格 · ${countBends(wire.path, lattice)} 個轉彎${across}`;
}
```

`checklist.ts`：`length: w.path.length - 1` 改成 `length: Math.round(wireLength(w, buildLattice(circuit.boards)) * 10) / 10`。

`ascii.ts`：畫導線的地方用 `[w.start, ...cellsUnder(w, lattice), w.end]`（直線導線）取代 `w.path`；路徑導線不變。

`fileFormat.ts` `parseWire`：

```ts
  if (w.straight !== undefined && w.straight !== true) fail(`${path}.straight`, '只能是 true');
  ...
  if (w.straight === true) {
    wire.straight = true;
    wire.path = [{ ...wire.start }, { ...wire.end }];
  }
```

- [ ] **Step 4: Run** — `npx vitest run` 全部；Expected: PASS。若既有測試因「一孔多線」不再報錯而失敗，改測試期望並記 Ruling（規格第 1 節已決定）。

- [ ] **Step 5: Commit** — `feat(core): check, measure and save straight wires; allow several manual wires per hole`

---

### Task 3: 直線導線的規則與指令（`manualWire.ts`、`commands.ts`）

**Files:**
- Modify: `src/editor/manualWire.ts`（加 `straightWireProblem`、`straightProblemText`；刪 `planWirePath`、`lShapePath`、`latticeLPath`、`MANUAL_*`、`Axis`、`pathIds`）、
  `src/editor/commands.ts`（`addWire(circuit, start, end, color)`、`moveWireEnd`）
- Modify tests: `tests/editor/manualWire.test.ts`、`tests/editor/commands.test.ts`、`tests/editor/boards.test.ts`
- Test: `tests/editor/manualWire.test.ts`

**Interfaces:**
- Produces:
  - `type StraightProblem = { kind: 'not-hole' } | { kind: 'same-hole' } | { kind: 'pin'; point: GridPoint } | { kind: 'other-group' } | { kind: 'obstacle'; point: GridPoint } | { kind: 'overlap'; wireId: string } | { kind: 'covered'; wireId: string; point: GridPoint }`
  - `straightWireProblem(circuit: Circuit, start: GridPoint, end: GridPoint, ignoreWireId?: string): StraightProblem | null`
  - `straightProblemText(circuit: Circuit, problem: StraightProblem): string`
  - `addWire(circuit: Circuit, start: GridPoint, end: GridPoint, color: string): { circuit: Circuit; id: string }`
  - `moveWireEnd(circuit: Circuit, id: string, which: 'start' | 'end', point: GridPoint): Circuit`

- [ ] **Step 1: Write the failing tests** — 把 `tests/editor/manualWire.test.ts` 的 `describe('planWirePath')` 整段換成：

```ts
describe('straightWireProblem', () => {
  const base = () => circuit([comp('U1', '74LS00', 'F10'), comp('R1', 'resistor', 'A30')], [straightWire('w1', 'C40', 'C45')]);

  it('accepts a clear straight or diagonal wire, also into a hole that already has a wire', () => {
    expect(straightWireProblem(base(), hole('A1'), hole('E5'))).toBeNull();
    expect(straightWireProblem(base(), hole('A40'), hole('C40'))).toBeNull();
  });

  it('refuses ends on pins, bodies, non-holes, the same hole and another group', () => {
    expect(straightWireProblem(base(), hole('A1'), hole('F10'))).toEqual({ kind: 'pin', point: hole('F10') });
    expect(straightWireProblem(base(), hole('A1'), hole('A31'))).toEqual({ kind: 'pin', point: hole('A31') });
    expect(straightWireProblem(base(), hole('A1'), pt(12, 9))).toEqual({ kind: 'not-hole' });
    expect(straightWireProblem(base(), hole('A1'), hole('A1'))).toEqual({ kind: 'same-hole' });
    const apart = circuit([], [], [board('b1'), board('b2', 0, 40)]);
    expect(straightWireProblem(apart, holeOn('b1', 'A1'), holeOn('b2', 'A1'))).toEqual({ kind: 'other-group' });
  });

  it('refuses passing over an IC, a wire end, or overlapping a wire', () => {
    expect(straightWireProblem(base(), hole('D8'), hole('H14'))?.kind).toBe('obstacle');
    expect(straightWireProblem(base(), hole('A40'), hole('E40'))).toEqual({ kind: 'obstacle', point: hole('C40') });
    expect(straightWireProblem(base(), hole('C42'), hole('C48'))).toEqual({ kind: 'overlap', wireId: 'w1' });
  });

  it('refuses an end under another wire', () => {
    expect(straightWireProblem(base(), hole('A42'), hole('C42'))).toEqual({ kind: 'covered', wireId: 'w1', point: hole('C42') });
  });

  it('ignores the wire whose end is being moved', () => {
    expect(straightWireProblem(base(), hole('C40'), hole('C47'), 'w1')).toBeNull();
  });

  it('explains every problem in Chinese', () => {
    const c = base();
    expect(straightProblemText(c, { kind: 'obstacle', point: hole('E12') })).toBe('直線不能經過元件或其他導線的端點（經過 E12）');
    expect(straightProblemText(c, { kind: 'overlap', wireId: 'w1' })).toBe('直線不能和導線 w1 重疊');
    expect(straightProblemText(c, { kind: 'covered', wireId: 'w1', point: hole('C42') })).toBe('C42 上面有導線 w1 經過，不能接在這裡');
    expect(straightProblemText(c, { kind: 'pin', point: hole('F10') })).toBe('導線不能接在元件腳或被元件蓋住的孔（F10）');
    expect(straightProblemText(c, { kind: 'other-group' })).toBe('兩端要在同一塊板，或貼在一起的板子上');
    expect(straightProblemText(c, { kind: 'not-hole' })).toBe('導線的兩端要插在孔上');
  });
});
```

並把 `isFreeHole` 的測試資料 `wire('w1', 'C40', 'C45')` 保持不變（路徑導線），import 改成
`import { defaultWireColor, isFreeHole, straightProblemText, straightWireProblem, WIRE_COLORS } from '../../src/editor/manualWire';`
與 `import { board, circuit, comp, hole, holeOn, pt, straightWire, wire } from '../fixtures/build';`，刪掉 `isOrthogonal`、`stepDirection`、`lShapePath` 相關測試。

`tests/editor/commands.test.ts` 的 `adds a manual wire from a planned path` 換成：

```ts
  it('adds a straight manual wire and moves its ends', () => {
    const c = circuit([]);
    const { circuit: after, id } = addWire(c, hole('A1'), hole('C4'), '#2e7d32');
    expect(id).toBe('w1');
    expect(after.wires[0]).toEqual({ id: 'w1', color: '#2e7d32', source: 'manual', straight: true, start: hole('A1'), end: hole('C4'), path: [hole('A1'), hole('C4')] });
    const moved = moveWireEnd(after, 'w1', 'end', hole('E9'));
    expect(moved.wires[0]).toMatchObject({ straight: true, start: hole('A1'), end: hole('E9'), path: [hole('A1'), hole('E9')] });
    const auto = { ...after, wires: [{ ...wire('w9', 'A1', 'A3', 'C3'), source: 'auto' as const }] };
    expect(moveWireEnd(auto, 'w9', 'start', hole('E1')).wires[0]).toMatchObject({ source: 'manual', straight: true, start: hole('E1'), end: hole('C3') });
    expect(moveWireEnd(after, 'nope', 'end', hole('E9'))).toBe(after);
  });
```

`tests/editor/boards.test.ts` 的兩個跨板測試改成：

```ts
  it('draws a straight wire from one board to the other across the seam', () => {
    const c = addWire(stacked, holeOn('b1', 'J12'), holeOn('b2', 'A12'), '#1565c0').circuit;
    expect(new Set(c.wires[0].path.map((p) => p.boardId))).toEqual(new Set(['b1', 'b2']));
    expect(straightWireProblem(stacked, holeOn('b1', 'J12'), holeOn('b2', 'A12'))).toBeNull();
    const codes = validateCircuit(c).map((e) => e.code);
    for (const code of ['WIRE_PATH_INVALID', 'WIRE_ENDPOINT_INVALID', 'WIRE_THROUGH_OBSTACLE']) expect(codes).not.toContain(code);
  });

  it('cannot wire boards that are not grouped', () => {
    const apart = moveBoards(stacked, ['b2'], 0, 10);
    const codes = validateCircuit(addWire(apart, holeOn('b1', 'J12'), holeOn('b2', 'A12'), '#1565c0').circuit).map((e) => e.code);
    expect(codes).toContain('WIRE_PATH_INVALID');
  });
```

- [ ] **Step 2: Run** — `npx vitest run tests/editor/manualWire.test.ts tests/editor/commands.test.ts tests/editor/boards.test.ts`；Expected: FAIL（函式不存在 / 簽名不同）。

- [ ] **Step 3: Implement**

`commands.ts`（import `moveWireEnd` 用不到的東西不加）：

```ts
/** 手動接線：兩孔之間的一條直線導線（可以斜）。 */
export function addWire(circuit: Circuit, start: GridPoint, end: GridPoint, color: string): { circuit: Circuit; id: string } {
  const id = nextWireId(circuit);
  const a = { boardId: start.boardId, x: start.x, y: start.y };
  const b = { boardId: end.boardId, x: end.x, y: end.y };
  const wire: Wire = { id, color, source: 'manual', straight: true, start: a, end: b, path: [{ ...a }, { ...b }] };
  return { circuit: { ...circuit, wires: [...circuit.wires, wire] }, id };
}

/** 拖曳端點：這條線改成直線，which 那一端換到 point；顏色與 ID 不變，來源變成手動。 */
export function moveWireEnd(circuit: Circuit, id: string, which: 'start' | 'end', point: GridPoint): Circuit {
  const w = circuit.wires.find((x) => x.id === id);
  if (!w) return circuit;
  const p = { boardId: point.boardId, x: point.x, y: point.y };
  const start = which === 'start' ? p : { ...w.start };
  const end = which === 'end' ? p : { ...w.end };
  const moved: Wire = { id: w.id, color: w.color, source: 'manual', straight: true, start, end, path: [{ ...start }, { ...end }] };
  return { ...circuit, wires: circuit.wires.map((x) => (x.id === id ? moved : x)) };
}
```

`manualWire.ts`：刪掉 `MANUAL_BEND_COST`、`MANUAL_OVERLAP_COST`、`Axis`、`lShapePath`、`latticeLPath`、`DX/DY/NO_DIRECTION`、`planWirePath`、`pathIds` 與用不到的 import，加上：

```ts
export type StraightProblem =
  | { kind: 'not-hole' }
  | { kind: 'same-hole' }
  | { kind: 'pin'; point: GridPoint }
  | { kind: 'other-group' }
  | { kind: 'obstacle'; point: GridPoint }
  | { kind: 'overlap'; wireId: string }
  | { kind: 'covered'; wireId: string; point: GridPoint };

/**
 * 規格第 1 節：手動直線（新拉的線、拖曳端點後的線）合不合法。不合法時回傳第一個原因。
 * 一孔多線可以；端點不能是元件腳或本體；線不能經過元件腳、本體、別條線的端點，不能和別條線重疊；
 * 端點也不能落在別條線經過的孔上（那條線就會變成經過障礙）。ignoreWireId：拖曳端點時忽略被移動的那條線。
 */
export function straightWireProblem(circuit: Circuit, start: GridPoint, end: GridPoint, ignoreWireId?: string): StraightProblem | null {
  const index = indexCircuit(circuit);
  for (const p of [start, end]) {
    const node = nodeAt(index, p);
    if (!node || node.kind !== 'hole') return { kind: 'not-hole' };
  }
  if (nodeIdOf(start) === nodeIdOf(end)) return { kind: 'same-hole' };
  for (const p of [start, end]) {
    const id = nodeIdOf(p);
    if (index.pinsAt.has(id) || index.bodiesAt.has(id)) return { kind: 'pin', point: p };
  }
  const lattice = buildLattice(circuit.boards);
  if (lattice.groupOf.get(start.boardId) !== lattice.groupOf.get(end.boardId)) return { kind: 'other-group' };

  const probe: Wire = { id: '__new', color: '', source: 'manual', straight: true, start, end, path: [start, end] };
  const others = circuit.wires.filter((w) => w.id !== ignoreWireId);
  const ends = new Set(others.flatMap((w) => [nodeIdOf(w.start), nodeIdOf(w.end)]));
  for (const p of cellsUnder(probe, lattice)) {
    const id = nodeIdOf(p);
    if (index.pinsAt.has(id) || index.bodiesAt.has(id) || ends.has(id)) return { kind: 'obstacle', point: p };
  }
  const [mine] = wireSegments(probe, lattice);
  for (const w of others) {
    if (wireSegments(w, lattice).some((s) => segmentOverlap(mine, s))) return { kind: 'overlap', wireId: w.id };
    const under = cellsUnder(w, lattice).find((p) => nodeIdOf(p) === nodeIdOf(start) || nodeIdOf(p) === nodeIdOf(end));
    if (under) return { kind: 'covered', wireId: w.id, point: under };
  }
  return null;
}

export function straightProblemText(circuit: Circuit, problem: StraightProblem): string {
  const label = (p: GridPoint) => holeLabel(circuit, p);
  switch (problem.kind) {
    case 'not-hole':
      return '導線的兩端要插在孔上';
    case 'same-hole':
      return '起點和終點是同一個孔';
    case 'pin':
      return `導線不能接在元件腳或被元件蓋住的孔（${label(problem.point)}）`;
    case 'other-group':
      return '兩端要在同一塊板，或貼在一起的板子上';
    case 'obstacle':
      return `直線不能經過元件或其他導線的端點（經過 ${label(problem.point)}）`;
    case 'overlap':
      return `直線不能和導線 ${problem.wireId} 重疊`;
    case 'covered':
      return `${label(problem.point)} 上面有導線 ${problem.wireId} 經過，不能接在這裡`;
  }
}
```

import：`buildLattice`（`../core/breadboard/lattice`）、`nodeIdOf`（naming）、`indexCircuit, nodeAt`（`../core/circuit/circuitIndex`）、
`cellsUnder, segmentOverlap, wireSegments`（`../core/circuit/wireGeometry`）、`holeLabel`（`./analysis`）、型別 `Wire`。
`holeLabel` 在 `analysis.ts`，`analysis.ts` 不 import `manualWire.ts`，沒有循環。

- [ ] **Step 4: Run** — 同 Step 2 的三個檔案；Expected: PASS。

- [ ] **Step 5: Commit** — `feat(editor): rules and commands for straight wires; remove the manual path planner`

---

### Task 4: Store 與畫面（拉直線、拖曳端點）

**Files:**
- Modify: `src/state/store.ts`（`addWire(start, end)`、`moveWireEnd(id, which, point)`）、`src/components/Breadboard/BreadboardCanvas.tsx`、
  `src/components/Breadboard/WireGraphic.tsx`（端點 `data-wire-end`）、`src/components/Breadboard/overlays.tsx`（`WireHandles`）、
  `src/components/common/Dialogs.tsx`（操作說明）、`src/components/ComponentLibrary/ComponentLibrary.tsx`（接線說明文字）
- Modify tests: `tests/web/store.test.ts`
- Test: `tests/web/store.test.ts`、`e2e/straight-wires.spec.ts`

**Interfaces:**
- Consumes: Task 3 的 `straightWireProblem`、`straightProblemText`、`addWire`、`moveWireEnd`
- Produces: store `addWire(start: GridPoint, end: GridPoint): void`、`moveWireEnd(id: string, which: 'start' | 'end', point: GridPoint): void`；
  畫面 `data-wire-handle="start" | "end"`

- [ ] **Step 1: Write the failing store tests** — `tests/web/store.test.ts`：`colours a new wire…` 改成用 `s().addWire({ boardId: 'b1', x: 6, y: 2 }, { boardId: 'b1', x: 6, y: 4 })`；
  跨板那行改成 `s().addWire(holeOn('b1', 'J12'), holeOn('b2', 'A12'));`；刪掉 `planWirePath` import；新增：

```ts
describe('straight manual wires', () => {
  it('refuses a wire over an IC with a warning, and moves a wire end with undo', () => {
    s().loadCircuit(circuit([comp('U1', '74LS00', 'F10')]), null);
    s().addWire(hole('D8'), hole('H14'));
    expect(s().circuit.wires).toEqual([]);
    expect(s().toasts.at(-1)).toMatchObject({ kind: 'warning', message: expect.stringContaining('直線不能經過元件') });

    s().addWire(hole('A20'), hole('C24'));
    expect(s().circuit.wires[0]).toMatchObject({ id: 'w1', straight: true, end: hole('C24') });
    s().moveWireEnd('w1', 'end', hole('E30'));
    expect(s().circuit.wires[0]).toMatchObject({ end: hole('E30'), path: [hole('A20'), hole('E30')] });
    expect(s().history.past.at(-1)?.label).toBe('移動導線 w1 的端點');
    const before = s().history.past.length;
    s().moveWireEnd('w1', 'end', hole('E30'));
    expect(s().history.past.length).toBe(before);
    s().moveWireEnd('w1', 'end', hole('F10'));
    expect(s().circuit.wires[0].end).toEqual(hole('E30'));
    expect(s().toasts.at(-1)?.message).toContain('元件腳');
    s().undo();
    expect(s().circuit.wires[0].end).toEqual(hole('C24'));
  });
});
```

（import `hole` from `../fixtures/build`。）

- [ ] **Step 2: Run** — `npx vitest run tests/web/store.test.ts`；Expected: FAIL。

- [ ] **Step 3: Implement store**

```ts
  addWire(start: GridPoint, end: GridPoint): void;
  /** 拖曳導線的一端到 point；這條線變成直線導線。 */
  moveWireEnd(id: string, which: 'start' | 'end', point: GridPoint): void;
```

```ts
    addWire(start, end) {
      if (guardEdit()) return;
      const s = get();
      const problem = straightWireProblem(s.circuit, start, end);
      if (problem) {
        if (problem.kind !== 'same-hole') get().toast('warning', straightProblemText(s.circuit, problem));
        return;
      }
      const color = defaultWireColor(s.circuit, start, end, s.wireColor);
      const { circuit, id } = addWire(s.circuit, start, end, color);
      commit(`接線 ${id}`, circuit, { selection: { kind: 'wire', id } });
    },

    moveWireEnd(id, which, point) {
      if (guardEdit()) return;
      const s = get();
      const w = s.circuit.wires.find((x) => x.id === id);
      if (!w) return;
      const current = which === 'start' ? w.start : w.end;
      if (current.boardId === point.boardId && current.x === point.x && current.y === point.y) return;
      const [start, end] = which === 'start' ? [point, w.end] : [w.start, point];
      const problem = straightWireProblem(s.circuit, start, end, id);
      if (problem) {
        if (problem.kind !== 'same-hole') get().toast('warning', straightProblemText(s.circuit, problem));
        return;
      }
      commit(`移動導線 ${id} 的端點`, moveWireEnd(s.circuit, id, which, point), { selection: { kind: 'wire', id } });
    },
```

（import `moveWireEnd` from commands、`straightWireProblem, straightProblemText` from manualWire。）

- [ ] **Step 4: Run** — `npx vitest run tests/web/store.test.ts`；Expected: PASS。

- [ ] **Step 5: Write the failing e2e** — `e2e/straight-wires.spec.ts`

```ts
import { expect, test, type Page } from '@playwright/test';

async function centerOf(page: Page, selector: string) {
  const box = (await page.locator(selector).first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
const hole = (page: Page, name: string) => centerOf(page, `[data-hole="${name}"]`);

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + (to.x - from.x) * 0.3, from.y + (to.y - from.y) * 0.3, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

async function saved(page: Page) {
  await page.waitForTimeout(600);
  return page.evaluate(() => JSON.parse(localStorage.getItem('breadboard-lab:autosave')!).circuit);
}

const ic = {
  version: 1,
  boards: [{ id: 'b1', layoutId: 'MB102', x: 0, y: 0, groupId: null }],
  components: [{ id: 'U1', defId: '74LS00', boardId: 'b1', anchor: { x: 10, y: 11 }, rotation: 0, props: {} }],
  wires: [],
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('[data-hole]')).toHaveCount(830);
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: '匯入 JSON… Import' }).click()]);
  await chooser.setFiles({ name: 'ic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(ic)) });
  await expect(page.locator('g[data-component-id="U1"]')).toHaveCount(1);
});

test('手動拉線是兩孔之間的直線（可以斜），經過 IC 的線不會建立', async ({ page }) => {
  await drag(page, await hole(page, 'A30'), await hole(page, 'E34'));
  await expect(page.getByTestId('wire-count')).toHaveText('1');
  const c = await saved(page);
  expect(c.wires[0]).toMatchObject({ straight: true, start: { x: 30, y: 4 }, end: { x: 34, y: 8 } });
  expect(c.wires[0].path).toHaveLength(2);

  await drag(page, await hole(page, 'D8'), await hole(page, 'H14'));
  await expect(page.getByTestId('wire-count')).toHaveText('1');
  await expect(page.locator('[data-toast="warning"]').last()).toContainText('直線不能經過元件');
});

test('選取導線後拖曳端點改接到別的孔，可以復原', async ({ page }) => {
  await drag(page, await hole(page, 'A30'), await hole(page, 'A35'));
  await expect(page.getByTestId('wire-count')).toHaveText('1');
  const handle = page.locator('[data-wire-handle="end"]');
  await expect(handle).toHaveCount(1);
  await drag(page, await centerOf(page, '[data-wire-handle="end"]'), await hole(page, 'D38'));
  let c = await saved(page);
  expect(c.wires[0]).toMatchObject({ straight: true, start: { x: 30, y: 4 }, end: { x: 38, y: 7 } });
  await page.keyboard.press('Control+z');
  c = await saved(page);
  expect(c.wires[0].end).toEqual({ boardId: 'b1', x: 35, y: 4 });
});
```

- [ ] **Step 6: Run** — Edge 執行 `npx playwright test e2e/straight-wires.spec.ts`；Expected: FAIL（沒有把手；拉出來的線不是 straight）。

- [ ] **Step 7: Implement the canvas**

`WireGraphic.tsx`：兩端的 `<circle>` 加 `data-wire-end={i === 0 ? 'start' : 'end'}`。

`overlays.tsx` 加：

```tsx
/** 選取的導線兩端的把手：拖曳到別的孔改接（規格 3.2）。觸控時點擊範圍至少 44 px。 */
export function WireHandles({ frames, wire, scale }: { frames: BoardFrame[]; wire: Wire; scale: number }) {
  const hit = Math.max(0.5 * P, 22 / scale);
  return (
    <g>
      {(['start', 'end'] as const).map((which) => {
        const p = toWorld(frames, wire[which]);
        if (!p) return null;
        return (
          <g key={which} data-wire-handle={which} data-wire-handle-of={wire.id} style={{ cursor: 'grab' }}>
            <circle cx={p.x} cy={p.y} r={hit} fill="transparent" />
            <circle cx={p.x} cy={p.y} r={0.28 * P} fill="#ffffff" stroke={UI.select} strokeWidth={2} pointerEvents="none" />
          </g>
        );
      })}
    </g>
  );
}
```

`BreadboardCanvas.tsx`：
- `WireDrag` 的 `axis` 欄位刪掉；`path` 永遠是 `[start]` 或 `[start, current]`；`valid` 用 `!straightWireProblem(c, d.start, current)`。
- 新增 drag 種類：
  ```ts
  interface WireEndDrag { kind: 'wire-end'; pointerId: number; wireId: string; which: 'start' | 'end'; fixed: GridPoint; startX: number; startY: number; started: boolean; current: GridPoint | null; valid: boolean }
  ```
- `onPointerDown`（編輯模式）最前面，在處理 `[data-wire-id]` 之前：
  ```ts
  const handleEl = target.closest('[data-wire-handle]');
  if (handleEl) {
    const wireId = handleEl.getAttribute('data-wire-handle-of')!;
    const which = handleEl.getAttribute('data-wire-handle') as 'start' | 'end';
    const w = circuitRef.current.wires.find((x) => x.id === wireId);
    if (w) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ kind: 'wire-end', pointerId: e.pointerId, wireId, which, fixed: which === 'start' ? w.end : w.start, startX: e.clientX, startY: e.clientY, started: false, current: null, valid: false });
    }
    return;
  }
  ```
  `[data-wire-id]` 的分支改成：按在**沒被選取**的導線的端點（`target.closest('[data-wire-end]')`）時不選取，往下走孔的處理；其他情況照舊選取。
- 孔的處理：`isFreeHoleWith(...)` 改成「不是元件腳、沒被本體蓋住」：
  ```ts
  const occ = occupancyOf(circuitRef.current, point.boardId);
  const id = nodeIdOf(point);
  if (!occ.pins.has(id) && !occ.bodies.has(id)) { ...開始拉線... } else store.select({ kind: 'hole', point });
  ```
- `updateWire`：`const path = current ? [d.start, current] : [d.start]; const valid = !!current && !straightWireProblem(c, d.start, current);`
- `updateWireEnd`（新）：同樣找 `current`（與 `fixed` 同一個 Board Group），`valid = !!current && !straightWireProblem(c, which === 'start' ? current : d.fixed, which === 'start' ? d.fixed : current, d.wireId)`。
  pointer move 分派時 `d.kind === 'wire-end'` 呼叫它。
- pointer up：
  ```ts
  } else if (d.kind === 'wire') {
    if (!d.started) store.select({ kind: 'hole', point: d.start });
    else if (d.current) store.addWire(d.start, d.current);
  } else if (d.kind === 'wire-end') {
    if (d.started && d.current) store.moveWireEnd(d.wireId, d.which, d.current);
  }
  ```
  （原本「終點必須是空孔」的 toast 刪掉，改由 store 的提示。）
- 預覽：`drag?.kind === 'wire-end' && drag.started` 時畫 `<PathPreview frames path={drag.current ? [drag.fixed, drag.current] : [drag.fixed]} color={wire.color} valid={drag.valid} />` 與兩個 `Ring`。
- 選取的導線、編輯模式（`mode` 不是模擬、不是 compare）、沒有在拖曳時，畫 `<WireHandles frames wire={wiresById.get(selection.id)!} scale={viewport.scale} />`（放在 `WireGlow` 選取高亮的後面）。
- `hoverFree` 改成：hover 的孔不是元件腳、沒被本體蓋住。
- 刪掉 `planWirePath`、`Axis`、`isFreeHoleWith` 的 import（若不再使用）。

`Dialogs.tsx` 的 `SHORTCUTS`：
- `['從空孔拖曳到另一個空孔', '建立導線（只有水平 / 垂直）']` → `['從孔拖曳到另一個孔', '拉一條直線導線（可以斜；不能經過元件或和別條線重疊）']`
- 新增 `['選取導線後拖曳兩端的白點', '把那一端改接到別的孔']`

`ComponentLibrary.tsx` 第 244 行附近的說明：`導線只走水平 / 垂直，會自動繞過元件。` → `導線是兩孔之間的一條直線，可以斜，但不能經過元件或和別條線重疊；選取導線後拖曳兩端可以改接。`

- [ ] **Step 8: Run** — `npm run typecheck`、`npx vitest run`、Edge 跑 `e2e/straight-wires.spec.ts`；Expected: PASS。

- [ ] **Step 9: Commit** — `feat(app): draw straight wires and drag wire ends to re-attach them`

---

### Task 5: 錯誤解說的建議改成直線

**Files:**
- Modify: `src/editor/explain/helpers.ts`（`railHoles`、`wireToRail`）、`src/editor/explain/parts.ts`（LED 改接）
- Modify tests: `tests/editor/explain.test.ts`（套用建議的輔助改用直線導線）

**Interfaces:**
- Consumes: `straightWireProblem`（Task 3）、`straightWire`（Task 1）

- [ ] **Step 1: Update the test helper first** — 在 `tests/editor/explain.test.ts` 找到把建議導線加進電路的輔助（目前用 `wire(...)` 或 `addWire(..., path, ...)`），改成：

```ts
const applyWires = (c: Circuit, e: Explanation) => ({
  ...c,
  wires: [...c.wires.filter((w) => !e.removeWireIds.includes(w.id)), ...e.wires.map((p, i) => straightWire(`s${i + 1}`, p[0], p[p.length - 1]))],
});
```

並加一個測試：

```ts
  it('suggests straight wires that do not pass over anything', () => {
    const c = circuit(icBase(), [gndWire()]);
    const e = explainIssue(c, issueOf(c, 'IC_POWER_MISSING'));
    for (const path of e.wires) {
      expect(path).toHaveLength(2);
      expect(straightWireProblem(c, path[0], path[1])).toBeNull();
    }
  });
```

- [ ] **Step 2: Run** — `npx vitest run tests/editor/explain.test.ts`；Expected: FAIL（建議仍是正交路徑，長度 > 2）。

- [ ] **Step 3: Implement**

`helpers.ts`：

```ts
/** 電源軌上的空孔，依和 x 的距離排序（同距離 x 小的先）。 */
export function railHoles(circuit: Circuit, boardId: string, rail: Rail, x: number, exclude: GridPoint[] = []): GridPoint[] {
  const occ = occupancyOf(circuit, boardId);
  return holesOfGroup(circuit, boardId, railGroupId(boardId, rail))
    .filter((p) => isFreeHoleWith(occ, p) && !exclude.some((e) => samePoint(e, p)))
    .sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x) || a.x - b.x);
}

export function railHole(circuit: Circuit, boardId: string, rail: Rail, x: number, exclude: GridPoint[] = []): GridPoint | null {
  return railHoles(circuit, boardId, rail, x, exclude)[0] ?? null;
}

/** 從 point 那一排的空孔拉一條直線到軌上的空孔（靠近軌的孔先試、軌上 x 近的先試），直線不能經過障礙。找不到時回傳 null。 */
export function wireToRail(circuit: Circuit, point: GridPoint, rail: Rail, exclude: GridPoint[] = []): WirePlan | null {
  const holes = freeHolesInGroup(circuit, point);
  const ordered = rail.startsWith('T') ? holes : [...holes].reverse();
  for (const from of ordered) {
    for (const to of railHoles(circuit, point.boardId, rail, from.x, exclude).slice(0, 8)) {
      if (!straightWireProblem(circuit, from, to)) return { from, to, path: [from, to] };
    }
  }
  return null;
}
```

（刪掉 `planWirePath` import，加 `straightWireProblem`。）

`parts.ts` LED 改接：`target` 的挑選改成在排序後的候選中找第一個 `!straightWireProblem(without, p, other)` 的孔；`wires.push(planWirePath(without, target, other, 'v'))` 改成 `wires.push([target, other])`。

- [ ] **Step 4: Run** — `npx vitest run tests/editor/explain.test.ts` 與全部；Expected: PASS（含既有「照著做錯誤消失」）。若某個既有期望的孔位改變（因為要避開障礙），以新規則核對後更新期望並記 Ruling。

- [ ] **Step 5: Commit** — `feat(editor): explanation suggests straight wires that avoid obstacles`

---

### Task 6: 端對端、文件

**Files:**
- Modify: `e2e/acceptance.spec.ts`（手動接線的檢查改成直線）、`README.md`（功能表「接線」那一列）、`CHANGELOG.md`、`docs/PROGRESS.md`、規格狀態

- [ ] **Step 1: Update acceptance** — `e2e/acceptance.spec.ts` 中「每條線相鄰兩點距離 1」的迴圈改成：

```ts
  for (const w of circuit.wires as Array<{ straight?: boolean; path: unknown[] }>) {
    expect(w.straight).toBe(true);
    expect(w.path).toHaveLength(2);
  }
```

- [ ] **Step 2: Run all e2e** — Edge 跑全部；Expected: 全部 PASS（若驗收流程某條手動線因新規則被拒絕，例如經過另一條線的端點，改用不衝突的孔並記 Ruling）。

- [ ] **Step 3: Docs** — README 功能表「接線」：`從孔拖曳到另一個孔：兩孔之間的一條直線（可以斜），不能經過元件或和別條線重疊；選取導線後拖曳兩端改接；接 + 軌自動用紅色、− 軌用黑色`。
  CHANGELOG「子專案 6」區段加「新增 / 變更」；PROGRESS「進行中」改為完成、等審查；規格狀態改「已完成（日期）」。

- [ ] **Step 4: Commit** — `docs: sub-project 6 (straight wires) is done`
