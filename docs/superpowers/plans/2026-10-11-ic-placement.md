# 可以移動 IC 的佈線模式（子專案 8）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增「AI 佈線（可移動 IC）」：先幫每顆 IC 找比較好的位置，再用子專案 7 的直線跳線規則佈線；其他元件不動。

**Architecture:** 核心新增 `src/core/icPlacement/`：`relocate.ts` 產生「IC 搬到新位置、導線換成描述連接關係的線」的電路，讓現有的 `autoRoute`、合法性檢查、評分完全沿用；
`candidates.ts` 列出合法位置；`estimate.ts` 粗估；`autoPlace.ts` 輪流試每顆 IC 粗估最好的幾個位置並實際佈線。結果是多了 `moves` 的 `RoutingResult`，
`applyRouting` 套用搬移。Worker 依請求選擇模式；store 記住套用後的元件陣列，讓比較、切回手動、Undo 都正確；畫面加選單、按鈕、結果卡、動畫外框。

**Tech Stack:** TypeScript、Vitest、React、Zustand、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-10-ic-placement-design.md`

## Global Constraints

- 只有元件類別 `ic` 會動；旋轉只用 0 與 180 度；只在原本那塊板所在的 Board Group 裡搬。
- 好壞順序：接不完的 Net 少 → 交叉少 → 線少 → 總長短；同分留在原位；結果一定和「IC 都不動」比較，不會比它差。
- 預設 `placement: { candidatesPerIc: 3, maxPasses: 2, timeBudgetMs: 20000 }`。
- 「AI 標準佈線」的行為與結果不變（`autoRoute` 不改）。
- `src/core` 不能 import `src/editor` 或瀏覽器 API。
- 文件、介面文字、註解用繁體中文；commit message 用英文；每個 commit 都 push；CHANGELOG 用繁中記錄。

## Review Focus

1. 使用者的接線本來就有奇怪的連接（例如兩個 IC 輸出接在一起）：搬移後每支腳接到的腳要完全相同 → Task 4「keeps odd user connections」。
2. 輸入時 IC 已經轉了 180 度：候選位置仍有兩個方向；結果卡要寫「轉 180 度」 → Task 2「an IC that starts turned」、Task 6 `describeMove` 測試。
3. IC 搬到同組的另一塊板：結果卡的孔名要加板子 ID → Task 6 `describeMove` 測試。
4. 時間用完：回傳合法的結果、IC 留在原位 → Task 4「stops at the time budget」。
5. 原位置佈不完、某個位置佈得完：要選佈得完的（接不完的 Net 數優先） → Task 4 `isBetterRouting` 測試。

---

### Task 1: 型別、設定、搬移後的電路、套用搬移

**Files:**
- Modify: `src/types/routing.ts`、`src/core/routing/config.ts`、`src/core/routing/apply.ts`
- Create: `src/core/icPlacement/relocate.ts`
- Test: `tests/icPlacement/relocate.test.ts`（新）、`tests/routing/problem.test.ts`（加一個 mergeConfig 測試）

**Interfaces:**
- Produces:
  - `IcPlacement { boardId: string; anchor: { x: number; y: number }; rotation: Rotation }`、`IcMove { componentId: string; from: IcPlacement; to: IcPlacement }`、`PlacementConfig { candidatesPerIc; maxPasses; timeBudgetMs }`、`RoutingConfig.placement`、`RoutingResult.moves?: IcMove[]`
  - `placementOf(c: ComponentInstance): IcPlacement`、`samePlacement(a, b): boolean`、`placeAt(c, p): ComponentInstance`
  - `applyMoves(components: ComponentInstance[], moves: IcMove[]): ComponentInstance[]`（沒有搬移時回傳同一個陣列）
  - `relocatedCircuit(circuit: Circuit, nets: Net[], moves: IcMove[]): Circuit`
  - `samePinPartition(a: Net[], b: Net[]): boolean`

- [ ] **Step 1: 寫失敗的測試** `tests/icPlacement/relocate.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { extractNets } from '../../src/core/circuit/nets';
import { applyMoves, placementOf, relocatedCircuit, samePinPartition } from '../../src/core/icPlacement/relocate';
import { applyRouting } from '../../src/core/routing/apply';
import { autoRoute } from '../../src/core/routing/autoRoute';
import type { Circuit } from '../../src/types/circuit';
import type { IcMove, IcPlacement, RoutingResult } from '../../src/types/routing';
import { acceptanceCircuit, adderCircuit } from '../fixtures/circuits';

const move = (c: Circuit, componentId: string, to: IcPlacement): IcMove => ({
  componentId,
  from: placementOf(c.components.find((k) => k.id === componentId)!),
  to,
});
const shape = (r: RoutingResult) => ({ wires: r.wires.map((w) => [w.netId, w.start, w.end]), metrics: r.metrics, failed: r.failedNets });

describe('applyMoves', () => {
  it('returns the same array when nothing moves and keeps unmoved components', () => {
    const c = acceptanceCircuit();
    expect(applyMoves(c.components, [])).toBe(c.components);
    const moved = applyMoves(c.components, [move(c, 'U1', { boardId: 'b1', anchor: { x: 20, y: 11 }, rotation: 0 })]);
    expect(moved.find((k) => k.id === 'U1')).toMatchObject({ anchor: { x: 20, y: 11 }, rotation: 0 });
    for (const k of moved) if (k.id !== 'U1') expect(c.components).toContain(k);
  });
});

describe('relocatedCircuit', () => {
  it.each([
    ['acceptance', acceptanceCircuit],
    ['adder', adderCircuit],
  ])('routes the %s circuit exactly like the original when nothing moves', (_name, build) => {
    const c = build();
    const nets = extractNets(c);
    const relocated = relocatedCircuit(c, nets, []);
    expect(samePinPartition(nets, extractNets(relocated))).toBe(true);
    expect(shape(autoRoute(relocated))).toEqual(shape(autoRoute(c)));
  });

  it('keeps every pin connected to the same pins after an IC turns around', () => {
    const c = acceptanceCircuit();
    const nets = extractNets(c);
    const relocated = relocatedCircuit(c, nets, [move(c, 'U1', { boardId: 'b1', anchor: { x: 16, y: 8 }, rotation: 180 })]);
    expect(samePinPartition(nets, extractNets(relocated))).toBe(true);
    expect(autoRoute(relocated).status).toBe('success');
  });

  it('notices a short: a pin moved into a strip of another net', () => {
    const c = acceptanceCircuit();
    const nets = extractNets(c);
    // U1 第 7 腳（GND）會落在第 34 欄下半，和 R1 第 2 腳（接 LED 陽極）同一排。
    const relocated = relocatedCircuit(c, nets, [move(c, 'U1', { boardId: 'b1', anchor: { x: 28, y: 11 }, rotation: 0 })]);
    expect(samePinPartition(nets, extractNets(relocated))).toBe(false);
  });
});

describe('applyRouting with moves', () => {
  it('moves the ICs and replaces the wires', () => {
    const c = acceptanceCircuit();
    const moves = [move(c, 'U1', { boardId: 'b1', anchor: { x: 16, y: 8 }, rotation: 180 })];
    const r: RoutingResult = { ...autoRoute(relocatedCircuit(c, extractNets(c), moves)), moves };
    const applied = applyRouting(c, r);
    expect(applied.components.find((k) => k.id === 'U1')).toMatchObject({ anchor: { x: 16, y: 8 }, rotation: 180 });
    expect(applied.wires.every((w) => w.source === 'auto')).toBe(true);
  });

  it('keeps the component array when nothing moved', () => {
    const c = acceptanceCircuit();
    expect(applyRouting(c, autoRoute(c)).components).toBe(c.components);
  });
});
```

在 `tests/routing/problem.test.ts` 的 `describe('mergeConfig')` 裡加：

```ts
  it('merges the IC placement settings', () => {
    expect(mergeConfig().placement).toEqual({ candidatesPerIc: 3, maxPasses: 2, timeBudgetMs: 20000 });
    expect(mergeConfig({ placement: { maxPasses: 1 } }).placement).toEqual({ candidatesPerIc: 3, maxPasses: 1, timeBudgetMs: 20000 });
  });
```

- [ ] **Step 2: 執行，確認失敗**

Run: `npx vitest run tests/icPlacement/relocate.test.ts tests/routing/problem.test.ts`
Expected: FAIL（找不到 `src/core/icPlacement/relocate`；`placement` 是 undefined）

- [ ] **Step 3: 型別與設定**

`src/types/routing.ts`：最上面加 `import type { Rotation } from './component';`，在 `RoutingConfig` 前加：

```ts
/** 子專案 8：IC 的位置（錨點 = 第 1 腳所在的格點）。 */
export interface IcPlacement {
  boardId: string;
  anchor: { x: number; y: number };
  rotation: Rotation;
}

/** 「AI 佈線（可移動 IC）」搬動的一顆 IC。 */
export interface IcMove {
  componentId: string;
  from: IcPlacement;
  to: IcPlacement;
}

/** 找 IC 位置的設定（規格 2026-10-10 ic-placement 3.5）。 */
export interface PlacementConfig {
  /** 每顆 IC 依粗估取前幾個位置實際佈線。 */
  candidatesPerIc: number;
  /** 最多輪流幾輪。 */
  maxPasses: number;
  /** 找位置加佈線的總時間上限（ms）。 */
  timeBudgetMs: number;
}
```

`RoutingConfig` 加 `placement: PlacementConfig;`；`RoutingResult` 在 `stats` 後加：

```ts
  /** 只有「AI 佈線（可移動 IC）」有：搬動了哪些 IC（沒有搬動時是空陣列）。 */
  moves?: IcMove[];
```

`src/core/routing/config.ts`：`DEFAULT_ROUTING_CONFIG` 在 `scoring` 後加 `placement: { candidatesPerIc: 3, maxPasses: 2, timeBudgetMs: 20000 },`；
`mergeConfig` 的回傳加 `placement: { ...d.placement, ...overrides?.placement },`。

- [ ] **Step 4: `src/core/icPlacement/relocate.ts`**

```ts
import { parseNodeId } from '../breadboard/naming';
import { indexCircuit, type CircuitIndex } from '../circuit/circuitIndex';
import { pinKey, terminalGroupIds } from '../circuit/nets';
import type { Circuit, Net, Wire } from '../../types/circuit';
import type { ComponentInstance } from '../../types/component';
import type { GridPoint } from '../../types/geometry';
import type { IcMove, IcPlacement } from '../../types/routing';

/** 元件目前的位置。 */
export function placementOf(c: ComponentInstance): IcPlacement {
  return { boardId: c.boardId, anchor: { x: c.anchor.x, y: c.anchor.y }, rotation: c.rotation };
}

export function samePlacement(a: IcPlacement, b: IcPlacement): boolean {
  return a.boardId === b.boardId && a.anchor.x === b.anchor.x && a.anchor.y === b.anchor.y && a.rotation === b.rotation;
}

/** 把元件放到 p（回傳新物件）。 */
export function placeAt(c: ComponentInstance, p: IcPlacement): ComponentInstance {
  return { ...c, boardId: p.boardId, anchor: { x: p.anchor.x, y: p.anchor.y }, rotation: p.rotation };
}

/** 套用搬移：搬過的元件換成新物件，其他沿用原本的參照；沒有搬移時回傳同一個陣列。 */
export function applyMoves(components: ComponentInstance[], moves: IcMove[]): ComponentInstance[] {
  if (moves.length === 0) return components;
  const to = new Map(moves.map((m) => [m.componentId, m.to]));
  return components.map((c) => {
    const p = to.get(c.id);
    return p ? placeAt(c, p) : c;
  });
}

/** 群組的第一個格點（描述連接關係的導線端點）。 */
function groupPoint(index: CircuitIndex, groupId: string): GridPoint {
  const nodeId = index.boards.get(groupId.slice(0, groupId.indexOf(':')))?.groups[groupId]?.nodeIds[0];
  if (!nodeId) throw new Error(`Unknown group ${groupId}`);
  return parseNodeId(nodeId);
}

/**
 * 規格 2026-10-10 ic-placement 2.2：IC 搬到新位置後的電路。導線換成「描述連接關係的導線」：每個原本的 Net
 * 把它在新位置的終端排（腳所在的排＋它的電源軌）依序串起來。這些線只告訴佈線器哪些排要接在一起，不會出現在結果裡。
 */
export function relocatedCircuit(circuit: Circuit, nets: Net[], moves: IcMove[]): Circuit {
  const moved: Circuit = { ...circuit, components: applyMoves(circuit.components, moves), wires: [] };
  const index = indexCircuit(moved);
  const wires: Wire[] = [];
  for (const net of nets) {
    const groups = terminalGroupIds(net, index);
    for (let i = 1; i < groups.length; i++) {
      const start = groupPoint(index, groups[i - 1]);
      const end = groupPoint(index, groups[i]);
      wires.push({ id: `link_${net.id}_${i}`, color: '#888888', source: 'manual', straight: true, start, end, path: [{ ...start }, { ...end }] });
    }
  }
  return { ...moved, wires };
}

/** 規格 2.3：兩組 Net 是否把腳分成完全相同的組（以腳為準，不管 Net 的名稱與群組）。 */
export function samePinPartition(a: Net[], b: Net[]): boolean {
  const key = (nets: Net[]) => nets.map((n) => n.pins.map(pinKey).join(',')).sort().join('|');
  return key(a) === key(b);
}
```

- [ ] **Step 5: `src/core/routing/apply.ts` 套用搬移**

```ts
import type { Circuit } from '../../types/circuit';
import type { RoutingResult } from '../../types/routing';
import { applyMoves } from '../icPlacement/relocate';

/** 回傳新的 Circuit：導線全部換成佈線結果，有 moves 時 IC 一併搬到新位置；原本的 circuit 不會被修改。 */
export function applyRouting(circuit: Circuit, result: RoutingResult): Circuit {
  if (result.status !== 'success') throw new Error('Only a successful routing result can be applied');
  return {
    ...circuit,
    components: applyMoves(circuit.components, result.moves ?? []),
    wires: result.wires.map((w) => ({
      ...w,
      start: { ...w.start },
      end: { ...w.end },
      path: w.path.map((p) => ({ ...p })),
    })),
  };
}
```

- [ ] **Step 6: 執行，確認通過**

Run: `npx vitest run tests/icPlacement/relocate.test.ts tests/routing/problem.test.ts`
Expected: PASS

- [ ] **Step 7: typecheck、全部測試、commit**

Run: `npm run typecheck && npm test`
Expected: 全部通過

```bash
git add src/types/routing.ts src/core/routing/config.ts src/core/routing/apply.ts src/core/icPlacement/relocate.ts tests/icPlacement/relocate.test.ts tests/routing/problem.test.ts
git commit -m "feat(placement): relocated circuit that keeps pin connections; routing results can carry IC moves"
git push
```

---

### Task 2: 一顆 IC 的合法位置

**Files:**
- Create: `src/core/icPlacement/candidates.ts`
- Test: `tests/icPlacement/candidates.test.ts`

**Interfaces:**
- Consumes: `placeAt`（Task 1）、`IcPlacement`
- Produces: `icCandidates(circuit: Circuit, nets: Net[], componentId: string): IcPlacement[]`（順序：板子 ID、y、x、旋轉 0 → 180）

- [ ] **Step 1: 寫失敗的測試** `tests/icPlacement/candidates.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { nodeIdOf } from '../../src/core/breadboard/naming';
import { groupOfPoint, indexCircuit } from '../../src/core/circuit/circuitIndex';
import { extractNets } from '../../src/core/circuit/nets';
import { icCandidates } from '../../src/core/icPlacement/candidates';
import { placeAt } from '../../src/core/icPlacement/relocate';
import type { Circuit } from '../../src/types/circuit';
import type { IcPlacement } from '../../src/types/routing';
import { board, circuit, comp, wire } from '../fixtures/build';
import { acceptanceCircuit, twoBoardCircuit } from '../fixtures/circuits';

const candidates = (c: Circuit, id = 'U1') => icCandidates(c, extractNets(c), id);

/** IC 放在 p 時，每支腳所在的導通群組與它佔用的格點。 */
function footprintAt(c: Circuit, id: string, p: IcPlacement) {
  const components = c.components.map((k) => (k.id === id ? placeAt(k, p) : k));
  const index = indexCircuit({ ...c, components });
  const fp = index.placedById.get(id)!.footprint;
  return {
    groups: fp.pins.map((pin) => groupOfPoint(index, pin.point)!),
    cells: [...fp.pins.map((pin) => pin.point), ...fp.blocked].map(nodeIdOf),
  };
}

describe('icCandidates', () => {
  it('lets an IC alone straddle the channel in both directions', () => {
    const c = circuit([comp('U1', '74LS00', 'F10')]);
    const list = candidates(c);
    expect(list).toHaveLength(114);
    expect(list).toContainEqual({ boardId: 'b1', anchor: { x: 10, y: 11 }, rotation: 0 });
    expect(list).toContainEqual({ boardId: 'b1', anchor: { x: 16, y: 8 }, rotation: 180 });
    expect(list.every((p) => (p.rotation === 0 ? p.anchor.y === 11 : p.rotation === 180 && p.anchor.y === 8))).toBe(true);
    for (const p of list) expect(new Set(footprintAt(c, 'U1', p).groups).size).toBe(14);
  });

  it('gives an IC that starts turned the same choices', () => {
    const turned = circuit([comp('U1', '74LS00', 'E16', { rotation: 180 })]);
    expect(candidates(turned)).toEqual(candidates(circuit([comp('U1', '74LS00', 'F10')])));
  });

  it('never overlaps another component', () => {
    const c = circuit([comp('U1', '74LS00', 'F10'), comp('U2', '74LS04', 'F30')]);
    const u2 = footprintAt(c, 'U2', { boardId: 'b1', anchor: { x: 30, y: 11 }, rotation: 0 }).cells;
    const list = candidates(c);
    expect(list.length).toBeGreaterThan(0);
    for (const p of list) expect(footprintAt(c, 'U1', p).cells.some((cell) => u2.includes(cell))).toBe(false);
  });

  it('never puts a pin into a strip of another net', () => {
    const c = acceptanceCircuit();
    for (const p of candidates(c)) expect(footprintAt(c, 'U1', p).groups).not.toContain('b1:c34-bot');
  });

  it('may share a strip with a pin of the same net', () => {
    const c = circuit(
      [comp('U1', '74LS00', 'F20'), comp('CLK1', 'clock', 'J3'), comp('CLK2', 'clock', 'J40')],
      [wire('w1', 'I3', 'J20')],
    );
    const list = candidates(c);
    expect(list).toContainEqual({ boardId: 'b1', anchor: { x: 3, y: 11 }, rotation: 0 });
    for (const p of list) expect(footprintAt(c, 'U1', p).groups).not.toContain('b1:c40-bot');
  });

  it('moves to another board of the same group, never to a separate board', () => {
    expect(candidates(twoBoardCircuit()).some((p) => p.boardId === 'b2')).toBe(true);
    const apart = circuit([comp('U1', '74LS00', 'F10')], [], [board('b1'), board('b3', 100, 0)]);
    const list = candidates(apart);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((p) => p.boardId === 'b1')).toBe(true);
  });
});
```

- [ ] **Step 2: 執行，確認失敗**

Run: `npx vitest run tests/icPlacement/candidates.test.ts`
Expected: FAIL（找不到 `candidates` 模組）

- [ ] **Step 3: `src/core/icPlacement/candidates.ts`**

```ts
import { buildLattice } from '../breadboard/lattice';
import { getNode, nodeIdOf } from '../breadboard/naming';
import { groupInfo, groupOfPoint, indexCircuit } from '../circuit/circuitIndex';
import { resolveFootprint } from '../circuit/footprint';
import { compareIds, netByPin, pinKey } from '../circuit/nets';
import type { Circuit, Net } from '../../types/circuit';
import type { Rotation } from '../../types/component';
import type { IcPlacement } from '../../types/routing';
import { placeAt } from './relocate';

const ROTATIONS: Rotation[] = [0, 180];

/**
 * 規格 2026-10-10 ic-placement 3.1：一顆 IC 的所有合法位置。其他元件固定在 circuit 裡的位置；導線不管（佈線時會換掉）。
 * 同一個 Board Group 的每塊板、每個孔當錨點、旋轉 0 / 180 度：每支腳插在沒被佔用的五孔排、各在不同的排，本體不碰其他元件，
 * 同一排裡其他元件的腳必須和這支腳屬於原本的同一個 Net（nets）。順序：板子 ID、y、x、旋轉。
 */
export function icCandidates(circuit: Circuit, nets: Net[], componentId: string): IcPlacement[] {
  const index = indexCircuit(circuit);
  const self = index.placedById.get(componentId);
  if (!self) throw new Error(`Unknown component ${componentId}`);
  const lattice = buildLattice(circuit.boards);
  const group = lattice.groupOf.get(self.instance.boardId);
  const boardIds = circuit.boards.map((b) => b.id).filter((id) => lattice.groupOf.get(id) === group).sort(compareIds);

  const netOf = netByPin(nets);
  const taken = new Set<string>();
  const netsInGroup = new Map<string, Set<string>>();
  for (const pc of index.placed) {
    if (pc.instance.id === componentId) continue;
    for (const cell of pc.footprint.blocked) taken.add(nodeIdOf(cell));
    for (const pin of pc.footprint.pins) {
      taken.add(nodeIdOf(pin.point));
      const g = groupOfPoint(index, pin.point);
      const net = netOf.get(pinKey({ componentId: pc.instance.id, pinNumber: pin.pinNumber }));
      if (!g || !net) continue;
      const set = netsInGroup.get(g) ?? new Set<string>();
      set.add(net.id);
      netsInGroup.set(g, set);
    }
  }

  const fits = (p: IcPlacement): boolean => {
    const board = index.boards.get(p.boardId)!;
    const fp = resolveFootprint(placeAt(self.instance, p), self.def);
    const used = new Set<string>();
    for (const pin of fp.pins) {
      const node = getNode(board, pin.point.x, pin.point.y);
      if (!node || node.kind !== 'hole' || !node.groupId || taken.has(node.id) || used.has(node.groupId)) return false;
      if (groupInfo(index, node.groupId)?.kind !== 'terminal') return false;
      used.add(node.groupId);
      const mine = netOf.get(pinKey({ componentId, pinNumber: pin.pinNumber }))?.id;
      for (const other of netsInGroup.get(node.groupId) ?? []) if (other !== mine) return false;
    }
    for (const cell of fp.blocked) {
      const node = getNode(board, cell.x, cell.y);
      if (!node || taken.has(node.id)) return false;
    }
    return true;
  };

  const out: IcPlacement[] = [];
  for (const boardId of boardIds) {
    for (const node of index.boards.get(boardId)!.nodes) {
      if (node.kind !== 'hole') continue;
      for (const rotation of ROTATIONS) {
        const p: IcPlacement = { boardId, anchor: { x: node.x, y: node.y }, rotation };
        if (fits(p)) out.push(p);
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: 執行，確認通過**

Run: `npx vitest run tests/icPlacement/candidates.test.ts`
Expected: PASS

- [ ] **Step 5: typecheck、全部測試、commit**

Run: `npm run typecheck && npm test`
Expected: 全部通過

```bash
git add src/core/icPlacement/candidates.ts tests/icPlacement/candidates.test.ts
git commit -m "feat(placement): list the legal places for an IC (both directions, any board of its group, no shorts)"
git push
```

---

### Task 3: 粗估

**Files:**
- Create: `src/core/icPlacement/estimate.ts`
- Test: `tests/icPlacement/estimate.test.ts`

**Interfaces:**
- Produces: `estimateNets(index: CircuitIndex, lattice: Lattice, nets: Net[], weights: RoutingWeights): number`

- [ ] **Step 1: 寫失敗的測試** `tests/icPlacement/estimate.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { buildLattice } from '../../src/core/breadboard/lattice';
import { indexCircuit } from '../../src/core/circuit/circuitIndex';
import { extractNets } from '../../src/core/circuit/nets';
import { estimateNets } from '../../src/core/icPlacement/estimate';
import { DEFAULT_ROUTING_CONFIG } from '../../src/core/routing/config';
import type { Circuit } from '../../src/types/circuit';
import { circuit, comp, wire } from '../fixtures/build';

const estimate = (c: Circuit) => estimateNets(indexCircuit(c), buildLattice(c.boards), extractNets(c), DEFAULT_ROUTING_CONFIG.weights);

describe('estimateNets', () => {
  it('costs one wire for two strips on the same row', () => {
    // 第 10 欄下半與第 20 欄下半：同一列一條線，長 10。
    expect(estimate(circuit([comp('C1', 'clock', 'J10'), comp('C2', 'clock', 'J20')], [wire('w', 'I10', 'I20')]))).toBe(6 + 10);
  });

  it('costs two wires and a via when the strips are not aligned', () => {
    // 第 10 欄上半（y 4–8）與第 20 欄下半（y 11–15）：最近是 E10 → F20，橫 10、直 3。
    expect(estimate(circuit([comp('C1', 'clock', 'A10'), comp('C2', 'clock', 'J20')], [wire('w', 'B10', 'I20')]))).toBe(2 * 6 + 3 + 13);
  });

  it('costs nothing for a net that is already in one strip', () => {
    expect(estimate(circuit([comp('C1', 'clock', 'J10'), comp('C2', 'clock', 'I10')]))).toBe(0);
  });

  it('joins three strips with a minimum spanning tree', () => {
    // 10、20、22 欄下半：10 → 20 長 10、20 → 22 長 2（不是 10 → 22 的 12）。
    const c = circuit(
      [comp('C1', 'clock', 'J10'), comp('C2', 'clock', 'J20'), comp('C3', 'clock', 'J22')],
      [wire('a', 'I10', 'I20'), wire('b', 'H20', 'H22')],
    );
    expect(estimate(c)).toBe(6 + 10 + 6 + 2);
  });
});
```

- [ ] **Step 2: 執行，確認失敗**

Run: `npx vitest run tests/icPlacement/estimate.test.ts`
Expected: FAIL（找不到 `estimate` 模組）

- [ ] **Step 3: `src/core/icPlacement/estimate.ts`**

```ts
import { latticeOf, type Lattice } from '../breadboard/lattice';
import { parseNodeId } from '../breadboard/naming';
import type { CircuitIndex } from '../circuit/circuitIndex';
import { terminalClusters } from '../circuit/nets';
import type { Net } from '../../types/circuit';
import type { RoutingWeights } from '../../types/routing';

interface Cell {
  x: number;
  y: number;
}

/** 兩孔之間：同一列或同一行算 1 條線，否則 2 條線、1 個轉接；不管障礙與交叉。 */
function pairCost(a: Cell, b: Cell, w: RoutingWeights): number {
  const length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  return a.x === b.x || a.y === b.y ? w.wire + length * w.distance : 2 * w.wire + w.via + length * w.distance;
}

/** Prim：從第 0 簇開始，每次接上最便宜的一簇；兩簇之間取兩邊的孔兩兩比較的最小值。 */
function spanningCost(clusters: Cell[][], w: RoutingWeights): number {
  if (clusters.length < 2) return 0;
  const between = (a: Cell[], b: Cell[]) => {
    let best = Infinity;
    for (const p of a) for (const q of b) best = Math.min(best, pairCost(p, q, w));
    return best;
  };
  const inTree = clusters.map((_, i) => i === 0);
  const dist = clusters.map((c, i) => (i === 0 ? 0 : between(clusters[0], c)));
  let total = 0;
  for (let added = 1; added < clusters.length; added++) {
    let next = -1;
    for (let i = 0; i < clusters.length; i++) if (!inTree[i] && (next < 0 || dist[i] < dist[next])) next = i;
    inTree[next] = true;
    total += dist[next];
    for (let i = 0; i < clusters.length; i++) if (!inTree[i]) dist[i] = Math.min(dist[i], between(clusters[next], clusters[i]));
  }
  return total;
}

/**
 * 規格 2026-10-10 ic-placement 3.2：很快的估計。每個 Net 的終端排依元件內部導通分簇，簇與簇之間用最小生成樹相連。
 * index 是要估計的那個擺法（元件已經在新位置）；座標用全域格子，同組的兩塊板可以直接比較。
 */
export function estimateNets(index: CircuitIndex, lattice: Lattice, nets: Net[], weights: RoutingWeights): number {
  let total = 0;
  for (const net of nets) {
    const clusters = terminalClusters(net, index).map((cluster) =>
      cluster.flatMap((g) =>
        (index.boards.get(g.slice(0, g.indexOf(':')))?.groups[g]?.nodeIds ?? [])
          .map((id) => latticeOf(lattice, parseNodeId(id)))
          .filter((c): c is Cell => c !== null),
      ),
    );
    total += spanningCost(clusters, weights);
  }
  return total;
}
```

- [ ] **Step 4: 執行，確認通過**

Run: `npx vitest run tests/icPlacement/estimate.test.ts`
Expected: PASS

- [ ] **Step 5: typecheck、全部測試、commit**

Run: `npm run typecheck && npm test`
Expected: 全部通過

```bash
git add src/core/icPlacement/estimate.ts tests/icPlacement/estimate.test.ts
git commit -m "feat(placement): quick wire estimate for a layout (spanning tree over strips)"
git push
```

---

### Task 4: 找位置＋佈線 `autoPlaceAndRoute`

**Files:**
- Create: `src/core/icPlacement/autoPlace.ts`
- Modify: `src/index.ts`（匯出）、`tests/api.test.ts`（名單加 `autoPlaceAndRoute`）、`tests/fixtures/circuits.ts`（`farIcCircuit`）
- Test: `tests/icPlacement/autoPlace.test.ts`

**Interfaces:**
- Consumes: Task 1–3 的全部
- Produces:
  - `autoPlaceAndRoute(circuit: Circuit, overrides?: DeepPartial<RoutingConfig>): RoutingResult`（一定有 `moves`）
  - `isBetterRouting(a: RoutingResult, b: RoutingResult): boolean`
  - `farIcCircuit(): Circuit`（測試用：U1 在 F45，R1 在 G5、D1 在 G15）

- [ ] **Step 1: 測試電路** `tests/fixtures/circuits.ts` 最後加：

```ts
/** 子專案 8：74LS00 放在最右邊，電阻與 LED 在最左邊，1Y 的線要橫跨整塊板。 */
export function farIcCircuit(): Circuit {
  return circuit(
    [comp('V1', 'vcc', 'T+3'), comp('G1', 'gnd', 'B-3'), comp('U1', '74LS00', 'F45'), comp('R1', 'resistor', 'G5'), comp('D1', 'led', 'G15')],
    [
      wire('w1', 'T+45', 'A45'), // VCC → U1 第 14 腳
      wire('w2', 'B-51', 'J51'), // GND → U1 第 7 腳
      wire('w3', 'J45', 'B-45'), // 第 1 腳 → GND
      wire('w4', 'J46', 'B-46'), // 第 2 腳 → GND
      wire('w5', 'J47', 'J5'), // 1Y → R1
      wire('w6', 'J9', 'J15'), // R1 → LED 陽極
      wire('w7', 'J16', 'B-16'), // LED 陰極 → GND
    ],
  );
}
```

- [ ] **Step 2: 寫失敗的測試** `tests/icPlacement/autoPlace.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { getComponentDefinition } from '../../src/core/circuit/library';
import { extractNets } from '../../src/core/circuit/nets';
import { validateCircuit } from '../../src/core/circuit/validate';
import { autoPlaceAndRoute, isBetterRouting } from '../../src/core/icPlacement/autoPlace';
import { relocatedCircuit, samePinPartition } from '../../src/core/icPlacement/relocate';
import { applyRouting } from '../../src/core/routing/apply';
import { autoRoute } from '../../src/core/routing/autoRoute';
import { checkRoutingLegality } from '../../src/core/routing/legality';
import { compileSimulation, initialSimState, settle } from '../../src/core/simulation/simulate';
import { EXAMPLES } from '../../src/editor/examples';
import type { Circuit } from '../../src/types/circuit';
import type { RoutingResult } from '../../src/types/routing';
import { circuit, comp, wire } from '../fixtures/build';
import { farIcCircuit } from '../fixtures/circuits';

const timeless = (r: RoutingResult) => ({ ...r, stats: { ...r.stats, elapsedMs: 0 } });
const lit = (c: Circuit) => {
  const sim = compileSimulation(c);
  return settle(sim, initialSimState(sim), { pressed: {}, clocks: {} }).result.litLeds;
};
const fake = (failed: number, crossings: number, wireCount: number, totalLength: number): RoutingResult => ({
  status: failed === 0 ? 'success' : 'partial',
  message: '',
  wires: [],
  failedNets: Array.from({ length: failed }, (_, i) => ({ netId: `N${i}`, reason: 'UNROUTABLE' as const, detail: '' })),
  metrics: { wireCount, totalLength, bends: 0, crossings, overlaps: 0, shortJogs: 0 },
  score: 0,
  stats: { iterations: 0, elapsedMs: 0 },
});

describe('isBetterRouting', () => {
  it('ranks unrouted nets, then crossings, then wires, then length', () => {
    expect(isBetterRouting(fake(0, 9, 99, 999), fake(1, 0, 1, 1))).toBe(true);
    expect(isBetterRouting(fake(0, 0, 99, 999), fake(0, 1, 1, 1))).toBe(true);
    expect(isBetterRouting(fake(0, 0, 5, 999), fake(0, 0, 6, 1))).toBe(true);
    expect(isBetterRouting(fake(0, 0, 5, 10), fake(0, 0, 5, 11))).toBe(true);
    expect(isBetterRouting(fake(0, 0, 5, 10), fake(0, 0, 5, 10))).toBe(false);
  });
});

describe('autoPlaceAndRoute', () => {
  it('moves an IC that sits far from its LED and saves wire', () => {
    const c = farIcCircuit();
    const base = autoRoute(c);
    const r = autoPlaceAndRoute(c);
    expect(r.status).toBe('success');
    expect(r.moves?.map((m) => m.componentId)).toEqual(['U1']);
    expect(isBetterRouting(r, base)).toBe(true);
    expect(r.metrics.totalLength).toBeLessThan(base.metrics.totalLength);
    expect(checkRoutingLegality(relocatedCircuit(c, extractNets(c), r.moves!), r.wires)).toEqual([]);
    const applied = applyRouting(c, r);
    expect(samePinPartition(extractNets(c), extractNets(applied))).toBe(true);
    expect(validateCircuit(applied).filter((e) => e.severity === 'error')).toEqual([]);
  }, 60_000);

  it('is deterministic', () => {
    const c = farIcCircuit();
    expect(timeless(autoPlaceAndRoute(c))).toEqual(timeless(autoPlaceAndRoute(c)));
  }, 60_000);

  it('keeps odd user connections (two IC outputs tied together)', () => {
    // 1Y（第 3 腳，F47）經過空的第 43 欄接到 4Y（第 11 腳，E48）。
    const base = farIcCircuit();
    const tied = { ...base, wires: [...base.wires, wire('tie1', 'A48', 'A43'), wire('tie2', 'B43', 'J43'), wire('tie3', 'I43', 'I47')] };
    const r = autoPlaceAndRoute(tied);
    expect(r.status).toBe('success');
    expect(samePinPartition(extractNets(tied), extractNets(applyRouting(tied, r)))).toBe(true);
  }, 60_000);

  it('leaves a circuit without ICs as it is', () => {
    const c = circuit([comp('R1', 'resistor', 'G5'), comp('D1', 'led', 'G15')], [wire('w1', 'J9', 'J15')]);
    const r = autoPlaceAndRoute(c);
    expect(r.moves).toEqual([]);
    expect(r.wires.map((w) => [w.start, w.end])).toEqual(autoRoute(c).wires.map((w) => [w.start, w.end]));
  });

  it('stops at the time budget and keeps the ICs where they are', () => {
    const r = autoPlaceAndRoute(farIcCircuit(), { placement: { timeBudgetMs: 0 } });
    expect(r.status).toBe('success');
    expect(r.moves).toEqual([]);
  });
});

describe.each(EXAMPLES.map((ex) => [ex.name, ex] as const))('example %s with IC moving', (_name, ex) => {
  it('routes fully, never worse than standard routing, moves only ICs and simulates the same', () => {
    const c = ex.build();
    const base = autoRoute(c);
    const r = autoPlaceAndRoute(c);
    expect(r.failedNets).toEqual([]);
    expect(isBetterRouting(base, r)).toBe(false);
    expect(r.wires.every((w) => w.straight === true)).toBe(true);
    const applied = applyRouting(c, r);
    const moved = new Set(r.moves!.map((m) => m.componentId));
    for (const k of c.components) {
      if (moved.has(k.id)) expect(getComponentDefinition(k.defId)?.category).toBe('ic');
      else expect(applied.components).toContain(k);
    }
    expect(samePinPartition(extractNets(c), extractNets(applied))).toBe(true);
    expect(validateCircuit(applied).filter((e) => e.severity === 'error')).toEqual([]);
    expect(lit(applied)).toEqual(lit(applyRouting(c, base)));
  }, 60_000);
});
```

注意「keeps odd user connections」：U1（F45，旋轉 0）的上排從第 8 腳（E51）排到第 14 腳（E45），所以第 11 腳（4Y）在 E48；第 3 腳（1Y）在 F47。
`tie1` 把第 48 欄上半接到第 43 欄上半，`tie2` 把第 43 欄上半接到第 43 欄下半，`tie3` 把第 43 欄下半接到第 47 欄下半，
所以 1Y 與 4Y 被使用者接在一起（輸出互接，Check Circuit 會報錯，但連接關係要保留）。第 43 欄沒有元件腳，只是轉接排。

- [ ] **Step 3: 執行，確認失敗**

Run: `npx vitest run tests/icPlacement/autoPlace.test.ts`
Expected: FAIL（找不到 `autoPlace` 模組）

- [ ] **Step 4: `src/core/icPlacement/autoPlace.ts`**

```ts
import { buildLattice, type Lattice } from '../breadboard/lattice';
import { indexCircuit } from '../circuit/circuitIndex';
import { getComponentDefinition } from '../circuit/library';
import { compareIds, extractNets } from '../circuit/nets';
import { autoRoute } from '../routing/autoRoute';
import { mergeConfig } from '../routing/config';
import type { Circuit, Net } from '../../types/circuit';
import type { DeepPartial, IcMove, IcPlacement, RoutingConfig, RoutingResult } from '../../types/routing';
import { icCandidates } from './candidates';
import { estimateNets } from './estimate';
import { applyMoves, placeAt, placementOf, relocatedCircuit, samePinPartition, samePlacement } from './relocate';

/** 規格 1 節的好壞順序：接不完的 Net 少 → 交叉少 → 線少 → 總長短。a 比 b 好才回傳 true（同分是 false）。 */
export function isBetterRouting(a: RoutingResult, b: RoutingResult): boolean {
  const key = (r: RoutingResult) => [r.failedNets.length, r.metrics.crossings, r.metrics.wireCount, r.metrics.totalLength];
  const ka = key(a);
  const kb = key(b);
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i];
  return false;
}

/**
 * 規格 2026-10-10 ic-placement：「AI 佈線（可移動 IC）」。起點是「IC 都不動」的佈線；每顆 IC 輪流試粗估最好的幾個位置、
 * 實際佈線，比目前最好的結果好才採用。回傳的結果一定有 moves（沒有搬動時是空陣列）。
 */
export function autoPlaceAndRoute(circuit: Circuit, overrides?: DeepPartial<RoutingConfig>): RoutingResult {
  const started = performance.now();
  const config = mergeConfig(overrides);
  const { candidatesPerIc, maxPasses, timeBudgetMs } = config.placement;
  const outOfTime = () => performance.now() - started > timeBudgetMs;
  const nets = extractNets(circuit);
  const lattice = buildLattice(circuit.boards);
  const original = new Map(circuit.components.map((c) => [c.id, placementOf(c)]));

  const route = (moves: IcMove[]): RoutingResult | null => {
    const relocated = relocatedCircuit(circuit, nets, moves);
    if (moves.length > 0 && !samePinPartition(nets, extractNets(relocated))) return null;
    return autoRoute(relocated, overrides);
  };

  let moves: IcMove[] = [];
  let best = route(moves)!;
  for (let pass = 0; pass < maxPasses && !outOfTime(); pass++) {
    let improved = false;
    for (const id of movableIcs(circuit, nets)) {
      if (outOfTime()) break;
      const layout: Circuit = { ...circuit, components: applyMoves(circuit.components, moves), wires: [] };
      for (const to of rankCandidates(layout, nets, id, lattice, config).slice(0, candidatesPerIc)) {
        if (outOfTime()) break;
        const next = withMove(moves, id, original.get(id)!, to);
        const result = route(next);
        if (result && isBetterRouting(result, best)) {
          best = result;
          moves = next;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return { ...best, moves, stats: { ...best.stats, elapsedMs: Math.round(performance.now() - started) } };
}

/** 會動的 IC：接到其他元件的腳多的先，同分依元件 ID。 */
function movableIcs(circuit: Circuit, nets: Net[]): string[] {
  const linked = new Map<string, number>();
  for (const net of nets) {
    if (new Set(net.pins.map((p) => p.componentId)).size < 2) continue;
    for (const p of net.pins) linked.set(p.componentId, (linked.get(p.componentId) ?? 0) + 1);
  }
  return circuit.components
    .filter((c) => getComponentDefinition(c.defId)?.category === 'ic')
    .map((c) => c.id)
    .sort((a, b) => (linked.get(b) ?? 0) - (linked.get(a) ?? 0) || compareIds(a, b));
}

/** 這顆 IC 的合法位置（不含目前的位置）依粗估由小到大；同分維持 icCandidates 的順序。 */
function rankCandidates(layout: Circuit, nets: Net[], id: string, lattice: Lattice, config: RoutingConfig): IcPlacement[] {
  const here = placementOf(layout.components.find((c) => c.id === id)!);
  const mine = nets.filter((n) => n.pins.some((p) => p.componentId === id));
  return icCandidates(layout, nets, id)
    .filter((p) => !samePlacement(p, here))
    .map((p, order) => {
      const components = layout.components.map((c) => (c.id === id ? placeAt(c, p) : c));
      return { p, order, cost: estimateNets(indexCircuit({ ...layout, components }), lattice, mine, config.weights) };
    })
    .sort((a, b) => a.cost - b.cost || a.order - b.order)
    .map((x) => x.p);
}

/** 把 id 搬到 to（搬回原位就刪掉這筆）；依元件 ID 排序，結果固定。 */
function withMove(moves: IcMove[], id: string, from: IcPlacement, to: IcPlacement): IcMove[] {
  const rest = moves.filter((m) => m.componentId !== id);
  const next = samePlacement(from, to) ? rest : [...rest, { componentId: id, from, to }];
  return next.sort((a, b) => compareIds(a.componentId, b.componentId));
}
```

- [ ] **Step 5: 匯出** `src/index.ts`：型別匯出的 `from './types/routing'` 名單加 `IcMove, IcPlacement, PlacementConfig`；在 `export { applyRouting } …` 後加
`export { autoPlaceAndRoute } from './core/icPlacement/autoPlace';`。`tests/api.test.ts` 的 `names` 加 `'autoPlaceAndRoute'`。

- [ ] **Step 6: 執行，確認通過**

Run: `npx vitest run tests/icPlacement tests/api.test.ts`
Expected: PASS

- [ ] **Step 7: typecheck、全部測試、commit**

Run: `npm run typecheck && npm test`
Expected: 全部通過

```bash
git add src/core/icPlacement/autoPlace.ts src/index.ts tests/api.test.ts tests/fixtures/circuits.ts tests/icPlacement/autoPlace.test.ts
git commit -m "feat(placement): auto place-and-route that may move ICs, never worse than standard routing"
git push
```

---

### Task 5: Worker 與 store

**Files:**
- Modify: `src/workers/protocol.ts`、`src/workers/routing.worker.ts`、`src/workers/routingClient.ts`、`src/state/store.ts`
- Test: `tests/web/store.test.ts`

**Interfaces:**
- Consumes: `autoPlaceAndRoute`（Task 4）、`applyMoves`（Task 1）、`IcMove`
- Produces:
  - `startRouting(circuit, config?, options?: { moveIcs?: boolean }): RoutingJob`
  - store：`runAutoRoute(purpose, options?: { moveIcs?: boolean })`、`routing.moveIcs: boolean`、`Comparison.appliedComponents: ComponentInstance[] | null`、
    `WireAnimation.moves: IcMove[]`、`planAnimation(wires, moves = [])`、`MOVE_HIGHLIGHT_MS = 600`、`comparisonSides(c: Comparison): { before: Circuit; after: Circuit }`

- [ ] **Step 1: 寫失敗的測試**：`tests/web/store.test.ts` import 加 `comparisonSides`，fixtures import 加 `farIcCircuit`，檔案最後加：

```ts
describe('AI routing that may move ICs', () => {
  const u1 = () => s().circuit.components.find((c) => c.id === 'U1')!;

  it('moves the IC and rewires in one undoable step', async () => {
    s().loadCircuit(farIcCircuit(), null);
    const before = s().circuit;
    s().runAutoRoute('apply', { moveIcs: true });
    expect(s().routing?.moveIcs).toBe(true);
    await routed();
    expect(u1().anchor).not.toEqual({ x: 45, y: 11 });
    expect(s().comparison?.result.moves?.map((m) => m.componentId)).toEqual(['U1']);
    expect(s().comparison?.appliedComponents).toBe(s().circuit.components);
    expect(isComparisonFresh(s())).toBe(true);
    expect(s().animation?.moves).toHaveLength(1);
    expect(s().history.past.at(-1)?.label).toBe('AI 佈線（可移動 IC）');

    s().undo();
    expect(s().circuit.components).toBe(before.components);
    expect(s().circuit.wires).toBe(before.wires);
    expect(isComparisonFresh(s())).toBe(true);
  }, 30_000);

  it('puts the IC back when switching to manual wiring', async () => {
    s().loadCircuit(farIcCircuit(), null);
    const before = s().circuit;
    s().runAutoRoute('apply', { moveIcs: true });
    await routed();
    s().setMode('manual');
    expect(s().circuit.components).toBe(before.components);
    expect(s().circuit.wires).toEqual(before.wires);
  }, 30_000);

  it('shows the old and the new IC position side by side', async () => {
    s().loadCircuit(farIcCircuit(), null);
    s().runAutoRoute('apply', { moveIcs: true });
    await routed();
    const sides = comparisonSides(s().comparison!);
    expect(sides.before.components.find((c) => c.id === 'U1')!.anchor).toEqual({ x: 45, y: 11 });
    expect(sides.before.wires).toBe(s().comparison!.beforeWires);
    expect(sides.after.components.find((c) => c.id === 'U1')!.anchor).toEqual(u1().anchor);
    expect(sides.after.wires).toBe(s().comparison!.result.wires);
  }, 30_000);

  it('keeps standard routing free of moves', async () => {
    s().loadCircuit(acceptanceCircuit(), null);
    s().runAutoRoute('apply');
    expect(s().routing?.moveIcs).toBe(false);
    await routed();
    expect(s().comparison?.result.moves).toBeUndefined();
    expect(s().comparison?.appliedComponents).toBeNull();
    expect(s().animation?.moves).toEqual([]);
  });

  it('delays the wires while the moved ICs are highlighted', () => {
    const wires = acceptanceCircuit().wires;
    const at = { boardId: 'b1', anchor: { x: 10, y: 11 }, rotation: 0 as const };
    const move = { componentId: 'U1', from: at, to: { ...at, anchor: { x: 20, y: 11 } } };
    const a = planAnimation(wires, [move]);
    expect(a.delays.w1).toBe(600);
    expect(a.moves).toEqual([move]);
    expect(planAnimation(wires).delays.w1).toBe(0);
  });
});
```

- [ ] **Step 2: 執行，確認失敗**

Run: `npx vitest run tests/web/store.test.ts`
Expected: FAIL（`comparisonSides` 不存在、`moveIcs` 未定義等）

- [ ] **Step 3: Worker**

`src/workers/protocol.ts` 的 `RoutingRequest` 加：

```ts
  /** true：「AI 佈線（可移動 IC）」。 */
  moveIcs?: boolean;
```

`src/workers/routing.worker.ts`：import `autoPlaceAndRoute`（`../core/icPlacement/autoPlace`），改成

```ts
  const { id, circuit, config, moveIcs } = event.data;
  try {
    scope.postMessage({ id, ok: true, result: moveIcs ? autoPlaceAndRoute(circuit, config) : autoRoute(circuit, config) });
```

`src/workers/routingClient.ts`：import `autoPlaceAndRoute`；加

```ts
export interface RoutingOptions {
  /** true：「AI 佈線（可移動 IC）」。 */
  moveIcs?: boolean;
}
```

`startRouting(circuit: Circuit, config?: DeepPartial<RoutingConfig>, options: RoutingOptions = {})`：沒有 Worker 時 `return runInline(circuit, config, options);`，
送出改成 `worker.postMessage({ id, circuit, config, moveIcs: options.moveIcs === true });`。
`runInline(circuit, config, options: RoutingOptions)` 裡改成 `resolve(options.moveIcs ? autoPlaceAndRoute(circuit, config) : autoRoute(circuit, config));`。

- [ ] **Step 4: store**（`src/state/store.ts`）

1. import：`import { applyMoves } from '../core/icPlacement/relocate';`，`IcMove`、`RoutingResult` 型別（`../types/routing`）。
2. `Comparison` 加：

```ts
  /** 套用了有搬移 IC 的結果之後的元件陣列（參照）；沒有搬移時為 null。 */
  appliedComponents: ComponentInstance[] | null;
```

3. `WireAnimation` 加：

```ts
  /** 子專案 8：這次搬動的 IC（動畫期間畫出原位置與新位置）。 */
  moves: IcMove[];
```

4. `routing` 的型別改成 `{ startedAt: number; purpose: 'apply' | 'compare'; moveIcs: boolean } | null`；動作型別改成
`runAutoRoute(purpose: 'apply' | 'compare', options?: { moveIcs?: boolean }): void;`
5. `isComparisonFresh`：

```ts
export function isComparisonFresh(s: Pick<AppState, 'comparison' | 'circuit'>): boolean {
  const c = s.comparison;
  return c !== null && c.boards === s.circuit.boards && (c.components === s.circuit.components || c.appliedComponents === s.circuit.components);
}
```

6. 在 `isComparisonFresh` 後加：

```ts
/** 比較畫面左右兩邊的電路：左邊是佈線前的元件與手動導線，右邊是（搬移後的）元件與 AI 導線。 */
export function comparisonSides(c: Comparison): { before: Circuit; after: Circuit } {
  return {
    before: { version: 1, boards: c.boards, components: c.components, wires: c.beforeWires },
    after: { version: 1, boards: c.boards, components: applyMoves(c.components, c.result.moves ?? []), wires: c.result.wires },
  };
}

/** Undo 紀錄的名稱。 */
function routingLabel(result: RoutingResult): string {
  return result.moves ? 'AI 佈線（可移動 IC）' : 'AI 標準佈線';
}

/** 套用之後記住新的元件陣列，讓「切回手動接線」與比較畫面仍認得這份對照。 */
function withApplied(c: Comparison, applied: Circuit): Comparison {
  return { ...c, appliedComponents: applied.components !== c.components ? applied.components : null };
}
```

7. `planAnimation`：

```ts
/** 搬過的 IC 先標示這麼久，導線才開始出現。 */
export const MOVE_HIGHLIGHT_MS = 600;

/** 依佈線順序逐條描線：每條最多間隔 160 ms，總長約 2.5 秒內；有搬移 IC 時整體延後 MOVE_HIGHLIGHT_MS。 */
export function planAnimation(wires: Wire[], moves: IcMove[] = []): WireAnimation {
  const n = wires.length;
  const offset = moves.length > 0 ? MOVE_HIGHLIGHT_MS : 0;
  const stepMs = n > 0 ? Math.min(160, 2000 / n) : 0;
  const drawMs = Math.max(260, Math.min(520, stepMs * 3));
  const delays: Record<string, number> = {};
  wires.forEach((w, i) => (delays[w.id] = offset + Math.round(i * stepMs)));
  return { key: animationKey++, delays, drawMs, totalMs: offset + Math.round((n - 1) * stepMs + drawMs), moves };
}
```

8. `startAnimation` 改成 `(wires: Wire[], moves: IcMove[] = []) => { const animation = planAnimation(wires, moves); … }`。
9. `runAutoRoute(purpose, options = {})`：開頭 `const moveIcs = options.moveIcs === true;`；`routing: { startedAt: performance.now(), purpose, moveIcs }`；
`startRouting(circuit, undefined, { moveIcs })`；`comparison` 物件加 `appliedComponents: null`；成功套用的地方改成：

```ts
          const applied = applyRouting(circuit, result);
          commit(routingLabel(result), applied, { comparison: withApplied(comparison, applied), selection: null, view: 'edit' });
          startAnimation(get().circuit.wires, result.moves ?? []);
```

10. `applyComparison`：

```ts
      const applied = applyRouting(s.circuit, cmp.result);
      commit(routingLabel(cmp.result), applied, { view: 'edit', selection: null, comparison: withApplied(cmp, applied) });
      startAnimation(get().circuit.wires, cmp.result.moves ?? []);
```

11. `restoreManualWires`：

```ts
      const cmp = s.comparison;
      commit('切回手動接線', { ...replaceWires(s.circuit, cmp.beforeWires), components: cmp.components }, { view: 'edit', selection: null });
```

（`cmp` 取代原本的 `s.comparison`，前面的檢查保持不變。）

- [ ] **Step 5: 執行，確認通過**

Run: `npx vitest run tests/web/store.test.ts`
Expected: PASS

- [ ] **Step 6: typecheck、全部測試、commit**

Run: `npm run typecheck && npm test`
Expected: 全部通過（`npm run typecheck` 會抓到其他用到 `Comparison`、`WireAnimation`、`routing` 的地方，照型別補上）

```bash
git add src/workers src/state/store.ts tests/web/store.test.ts
git commit -m "feat(store): run the IC-moving routing in the worker; undo, compare and manual restore keep IC positions"
git push
```

---

### Task 6: 畫面與端對端測試

**Files:**
- Modify: `src/components/Toolbar/Toolbar.tsx`、`src/components/Breadboard/CanvasHud.tsx`、`src/components/Breadboard/BreadboardCanvas.tsx`、
  `src/components/Compare/CompareView.tsx`、`src/components/common/describe.ts`、`src/components/common/Dialogs.tsx`
- Create: `tests/web/describeMove.test.ts`、`e2e/ic-placement.spec.ts`

**Interfaces:**
- Consumes: store（Task 5）、`placeAt`（Task 1）
- Produces: `describeMove(circuit: Pick<Circuit, 'boards'>, m: IcMove): string`

- [ ] **Step 1: 寫失敗的測試** `tests/web/describeMove.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { describeMove } from '../../src/components/common/describe';
import { board } from '../fixtures/build';

const at = (boardId: string, x: number, y: number, rotation: 0 | 180 = 0) => ({ boardId, anchor: { x, y }, rotation });

describe('describeMove', () => {
  it('names the pin-1 hole before and after', () => {
    expect(describeMove({ boards: [board('b1')] }, { componentId: 'U1', from: at('b1', 45, 11), to: at('b1', 20, 11) })).toBe('U1：F45 → F20');
  });

  it('says when the IC was turned around', () => {
    expect(describeMove({ boards: [board('b1')] }, { componentId: 'U1', from: at('b1', 10, 11), to: at('b1', 16, 8, 180) })).toBe('U1：F10 → E16（轉 180 度）');
    expect(describeMove({ boards: [board('b1')] }, { componentId: 'U1', from: at('b1', 16, 8, 180), to: at('b1', 30, 11) })).toBe('U1：E16 → F30（轉 180 度）');
  });

  it('adds the board when there are several', () => {
    const boards = [board('b1'), board('b2', 0, 20)];
    expect(describeMove({ boards }, { componentId: 'U1', from: at('b1', 10, 11), to: at('b2', 25, 11) })).toBe('U1：b1:F10 → b2:F25');
  });
});
```

- [ ] **Step 2: 執行，確認失敗**

Run: `npx vitest run tests/web/describeMove.test.ts`
Expected: FAIL（`describeMove` 不存在）

- [ ] **Step 3: `describeMove`**（`src/components/common/describe.ts`）：加 `import { holeLabel } from '../../editor/analysis';`（原本的 re-export 保留）、
`import type { IcMove, IcPlacement } from '../../types/routing';`（和既有的 `FailureReason` 合併成一行），檔案最後加：

```ts
/** 「U1：F10 → F22（轉 180 度）」：第 1 腳所在的孔；多塊板時加板子 ID。 */
export function describeMove(circuit: Pick<Circuit, 'boards'>, m: IcMove): string {
  const at = (p: IcPlacement) => holeLabel(circuit, { boardId: p.boardId, x: p.anchor.x, y: p.anchor.y });
  const turned = m.from.rotation !== m.to.rotation ? '（轉 180 度）' : '';
  return `${m.componentId}：${at(m.from)} → ${at(m.to)}${turned}`;
}
```

- [ ] **Step 4: 執行，確認通過**

Run: `npx vitest run tests/web/describeMove.test.ts`
Expected: PASS

- [ ] **Step 5: 選單與工具列**（`Toolbar.tsx`）

「自動佈線」選單在 `AI 標準佈線 Auto Route` 那一項後加：

```ts
        { label: 'AI 佈線（可移動 IC）Auto Place & Route', onClick: run(() => store.runAutoRoute('apply', { moveIcs: true })), disabled: routing || simulating },
```

`⚡ AI 標準佈線` 按鈕後加：

```tsx
      <button
        type="button"
        onClick={() => store.runAutoRoute('apply', { moveIcs: true })}
        disabled={routing || simulating}
        title="AI 佈線（可移動 IC）：先幫 IC 找位置再佈線；開關、按鈕、電阻、LED 與電源不動"
        className="hidden rounded-md border border-emerald-600 px-3 py-1 text-sm font-semibold text-emerald-300 hover:bg-emerald-900/40 disabled:opacity-60 lg:inline-block"
      >
        ⚡ 可移動 IC
      </button>
```

- [ ] **Step 6: 計算中與結果卡**（`CanvasHud.tsx`）

`RoutingOverlay` 的標題與說明改成：

```tsx
        <div className="text-base font-semibold text-slate-100">{routing.moveIcs ? 'AI 佈線（可移動 IC）計算中…' : 'AI 標準佈線計算中…'}</div>
        <div className="mt-1 text-xs text-slate-400">
          {routing.moveIcs ? '找 IC 位置 → 直線跳線佈線 → 合法性檢查' : '分析 Electrical Nets → 直線跳線搜尋 → 協商式拆線重排 → 合法性檢查'}
        </div>
```

`ResultCard` 在成功 / 失敗說明的區塊之後、`MetricsTable` 之前加（import `describeMove`）：

```tsx
      {result.moves && (
        <div className="mt-2 rounded bg-amber-950/50 px-2 py-1 text-xs text-amber-200" data-testid="ic-moves">
          {result.moves.length === 0 ? 'IC 已經在最好的位置，沒有移動。' : result.moves.map((m) => <div key={m.componentId}>移動 {describeMove(circuit, m)}</div>)}
        </div>
      )}
```

- [ ] **Step 7: 動畫外框**（`BreadboardCanvas.tsx`）：import `placeAt`（`../../core/icPlacement/relocate`）；在 `<g data-ui="over">` 裡、選取外框之前加：

```tsx
            {animation?.moves.map((m) => {
              const c = componentsById.get(m.componentId);
              if (!c) return null;
              return (
                <g key={`moved-${m.componentId}`} pointerEvents="none" data-moved-ic={m.componentId}>
                  <Outline rect={componentRect(frames, placeAt(c, m.from), 0.75)} color={UI.warning} />
                  <Outline rect={componentRect(frames, c, 0.75)} color={UI.warning} dashed={false} width={2.6} />
                </g>
              );
            })}
```

- [ ] **Step 8: 比較畫面**（`CompareView.tsx`）

`StaticBoard` 改成只收 `circuit`（導線用 `circuit.wires`）：

```tsx
function StaticBoard({ circuit }: { circuit: Circuit }) {
  // 內容不變，只把 wires.map 改成 circuit.wires.map
}
```

`CompareView` 拿掉 `const circuit = useStore((s) => s.circuit);`，改用 `const sides = comparisonSides(comparison);`（import 自 store）；`pane` 的第三個參數改成 `board: Circuit`，
裡面 `<StaticBoard circuit={board} />`；呼叫改成

```tsx
        {pane('User Routing', '你的手動接線', sides.before, beforeScore, after, 'text-slate-100')}
        {pane('AI Standard Routing', `${ok ? 'Standard Routing Complete' : 'No valid routing solution.'}${result.moves && result.moves.length > 0 ? `・移動了 ${result.moves.length} 顆 IC` : ''}`, sides.after, after, beforeScore, 'text-emerald-300')}
```

（`beforeWires` 不再直接用到就從解構拿掉。）

- [ ] **Step 9: 說明**（`Dialogs.tsx`）：「元件位置不會被移動。」改成「這個模式不會移動元件。」，在那一段之後加：

```tsx
      <p className="mt-2 text-xs leading-5 text-slate-400">
        AI 佈線（可移動 IC）：先幫每顆 IC 找一個線比較少、比較短的位置（可以搬到貼在一起的任何一塊板、可以轉 180 度），再用同樣的規則佈線；
        指撥開關、按鈕、電阻、LED、電源與接地都不動，每支腳接到的腳也不變。找不到更好的位置時 IC 留在原位。
      </p>
```

- [ ] **Step 10: 端對端測試** `e2e/ic-placement.spec.ts`

```ts
import { expect, test, type Page } from '@playwright/test';

/** 子專案 8：74LS00 放在最右邊（F45），電阻與 LED 在最左邊；「AI 佈線（可移動 IC）」會把它搬近。 */
const at = (x: number, y: number) => ({ boardId: 'b1', x, y });
const straight = (id: string, a: [number, number], b: [number, number]) => ({
  id,
  color: '#888888',
  source: 'manual',
  straight: true,
  start: at(...a),
  end: at(...b),
  path: [at(...a), at(...b)],
});
const part = (id: string, defId: string, x: number, y: number) => ({ id, defId, boardId: 'b1', anchor: { x, y }, rotation: 0, props: {} });
const farCircuit = {
  version: 1,
  boards: [{ id: 'b1', layoutId: 'MB102', x: 0, y: 0, groupId: null }],
  components: [part('V1', 'vcc', 3, 2), part('G1', 'gnd', 3, 18), part('U1', '74LS00', 45, 11), part('R1', 'resistor', 5, 12), part('D1', 'led', 15, 12)],
  wires: [
    straight('w1', [45, 2], [45, 4]),
    straight('w2', [51, 18], [51, 15]),
    straight('w3', [45, 15], [45, 18]),
    straight('w4', [46, 15], [46, 18]),
    straight('w5', [47, 15], [5, 15]),
    straight('w6', [9, 15], [15, 15]),
    straight('w7', [16, 15], [16, 18]),
  ],
};

async function savedCircuit(page: Page) {
  // 自動儲存有 400 ms 的延遲。
  await page.waitForTimeout(600);
  return page.evaluate(() => JSON.parse(localStorage.getItem('breadboard-lab:autosave') ?? 'null')?.circuit);
}

test('AI 佈線（可移動 IC）：IC 搬近 LED、線都是直的，Undo 回到原位', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('button', { name: '⚡ 可移動 IC' })).toBeVisible();

  await page.getByRole('button', { name: '檔案', exact: true }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: '匯入 JSON… Import' }).click()]);
  await chooser.setFiles({ name: 'far.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(farCircuit)) });
  await expect(page.getByTestId('wire-count')).toHaveText('7');

  await page.getByRole('button', { name: '自動佈線', exact: true }).click();
  await page.getByRole('menuitem', { name: 'AI 佈線（可移動 IC）Auto Place & Route' }).click();
  const card = page.getByTestId('routing-result');
  await expect(card).toContainText('Standard Routing Complete', { timeout: 30_000 });
  await expect(page.getByTestId('ic-moves')).toContainText('U1：F45 →');
  await expect(page.getByTestId('mode')).toHaveText('AUTO ROUTE');

  const routed = await savedCircuit(page);
  expect(routed.components.find((c: { id: string }) => c.id === 'U1').anchor).not.toEqual({ x: 45, y: 11 });
  for (const w of routed.wires) {
    expect(w.straight).toBe(true);
    expect(w.start.x === w.end.x || w.start.y === w.end.y).toBe(true);
  }

  await card.getByRole('button', { name: '復原 Undo' }).click();
  const restored = await savedCircuit(page);
  expect(restored.components.find((c: { id: string }) => c.id === 'U1').anchor).toEqual({ x: 45, y: 11 });
  expect(restored.wires).toHaveLength(7);
});
```

- [ ] **Step 11: 執行端對端**

Run: `PLAYWRIGHT_CHROMIUM_EXECUTABLE="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" npx playwright test e2e/ic-placement.spec.ts`
Expected: PASS

- [ ] **Step 12: typecheck、全部測試、commit**

Run: `npm run typecheck && npm test`
Expected: 全部通過

```bash
git add src/components tests/web/describeMove.test.ts e2e/ic-placement.spec.ts
git commit -m "feat(ui): AI routing that may move ICs from the menu and toolbar; result card, highlight and compare show the moves"
git push
```

---

### Task 7: 文件與整體驗證

**Files:**
- Modify: `README.md`、`CHANGELOG.md`、`docs/PROGRESS.md`、`docs/superpowers/specs/2026-10-10-ic-placement-design.md`

- [ ] **Step 1: README**：功能表在 `| AI 標準佈線 | … |` 那一列後加

```markdown
| AI 佈線（可移動 IC） | 先幫每顆 IC 找線比較少、比較短的位置（同組的任何一塊板、可以轉 180 度），再用 AI 標準佈線的規則佈線；開關、電阻、LED、電源不動，每支腳接到的腳不變；一定不比不移動差 |
```

路線圖 `| 8 | 可以移動 IC 的佈線模式（輸入、輸出元件不動） | 規劃中 |` 改成 `| 8 | 可以移動 IC 的佈線模式（輸入、輸出元件不動） | ✅ 完成 |`。

- [ ] **Step 2: CHANGELOG**：在 `## [未發布] — 子專案 7：新的自動佈線標準` 前加

```markdown
## [未發布] — 子專案 8：可以移動 IC 的佈線模式

### 新增

- 「AI 佈線（可移動 IC）」（自動佈線選單、工具列「⚡ 可移動 IC」）：先幫每顆 IC 找一個比較好的位置，再用 AI 標準佈線的規則佈線。
  IC 可以搬到貼在一起的任何一塊板、可以轉 180 度；指撥開關、按鈕、時脈、電阻、LED、電源與接地都不動；每支腳接到的腳不變，也不會插進別的電路的排造成短路。
- 找位置的方法：每顆 IC 列出所有合法位置，用很快的估計選出最好的 3 個實際佈線，比目前最好的結果好才採用；輪流做最多兩輪、最多 20 秒。
  一定和「IC 都不動」的結果比較，所以不會比 AI 標準佈線差。
- 結果卡列出搬了哪些 IC（例如「U1：F45 → F20」）；動畫時搬過的 IC 標出原位置（虛線）與新位置；比較畫面左右兩邊顯示各自的 IC 位置。
- 按一次 Undo 位置與導線一起還原；「切回手動接線」也會把 IC 放回原位。

### 修正

- 佈線計算中的說明還寫著舊的「A* 正交搜尋」，改成「直線跳線搜尋」。

### 測試

- 單元測試：搬移後的電路與連接檢查、合法位置（兩個方向、同組的另一塊板、不壓元件、不短路）、粗估、每個範例都不比標準佈線差且模擬結果相同、
  IC 很遠的電路一定會搬近、結果固定、時間上限、store 的 Undo / 切回手動 / 比較畫面。
- 端對端：從選單執行「AI 佈線（可移動 IC）」，IC 搬動、線都是直的，Undo 回到原位。

### 文件

- 設計規格 `docs/superpowers/specs/2026-10-10-ic-placement-design.md`、實作計畫 `docs/superpowers/plans/2026-10-11-ic-placement.md`。
```

- [ ] **Step 3: PROGRESS**：「進行中」加一行 `- feat/ic-placement`（PR #9，從 `feat/routing-standard` 開出，要先合併 PR #7、#8）：子專案 8「可以移動 IC 的佈線模式」**已完成**，等使用者審查。規格、計畫路徑。
「接下來」拿掉子專案 8 那一項、其餘重新編號；測試數字更新成實際的數字（`npm test` 與 e2e 的結果）。

- [ ] **Step 4: 規格狀態** 改成 `- 狀態：已完成（2026-10-11）`。

- [ ] **Step 5: 整體驗證**

Run: `npm run typecheck && npm test && npm run build && npm run build:single`
Expected: 全部通過

Run: `PLAYWRIGHT_CHROMIUM_EXECUTABLE="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" npm run e2e`
Expected: 全部通過

- [ ] **Step 6: commit**

```bash
git add README.md CHANGELOG.md docs/PROGRESS.md docs/superpowers/specs/2026-10-10-ic-placement-design.md
git commit -m "docs: sub-project 8 (routing mode that may move ICs) is done"
git push
```
