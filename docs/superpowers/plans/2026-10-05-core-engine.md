# 子專案 1：核心引擎 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一個沒有畫面的 TypeScript 核心引擎：MB-102 麵包板模型、元件定義與 footprint、Net 分析、電路檢查、協商式擁塞自動佈線、合法性檢查、Routing Score，以及 ASCII 預覽。

**Architecture:** 純函式、純資料（可 JSON 化）的分層模組：`types` ← `core/breadboard` ← `core/circuit` ← `core/routing`。佈線用多起點多終點 A*（狀態含方向、段長、是否第一段）建每個 Net 的生成樹，再以 PathFinder 式協商迴圈消除重疊、改善階段降低成本，最後由獨立的合法性檢查器把關。

**Tech Stack:** TypeScript（strict）、Vitest、tsx、Node 24。不依賴 DOM。

**Spec:** `docs/superpowers/specs/2026-10-05-core-engine-design.md`

## Global Constraints

- TypeScript `strict: true`；`npm run typecheck`（`tsc --noEmit`）與 `npm test`（`vitest run`）每個 Task 結束時都必須通過。
- 核心程式不得使用 DOM / 瀏覽器 API；只能用 ES2022 與 Node/Worker 都有的全域（例如 `performance.now()`）。
- 所有對外輸入輸出都是純資料，可以直接 `JSON.stringify`，不得用 class 實例或 `Map` 當對外格式。
- 依賴方向只能往下：`routing` → `circuit` → `breadboard` → `types`；`data` 只放 JSON。
- 全程不得使用 `Math.random()` 或任何非確定性來源；排序遇到相同值一律以 ID 字串比較決勝負。
- 格子座標一律為 `{ boardId, x, y }`，x ∈ [1, 63]、y ∈ [1, 18]；格點 ID 為 `` `${boardId}:${x},${y}` ``。
- 導線只有兩個端點導電；中間經過的孔不導電。
- 不得輸出違規的導線：所有 `autoRoute` 輸出必須通過 `checkRoutingLegality`。
- 給學生看的訊息（`CircuitError.message`、失敗 `detail`）用繁體中文。
- 成本權重預設值：distance 1、bend 5、crossing 1000、congestion 20、aesthetic 10。
- 失敗訊息固定為 `"No valid routing solution."`；成功訊息固定為 `"Standard Routing Complete"`。

## Review Focus

- 空電路（沒有元件也沒有導線）：`validateCircuit` 應只回 `CIRCUIT_VALID`，`autoRoute` 應回 `success`、0 條線、100 分。→ Task 13 測試。
- 使用者在畫面上點到元件腳，導線端點和元件腳在同一孔：Net 仍要依群組合併，`autoRoute` 仍要成功。→ Task 13 測試。
- 某個終端群組只剩 1 個空孔、卻位於 3 群組 Net 中：不得出現兩條線共用端點孔，結果必須通過合法性檢查。→ Task 13 測試。
- 元件超出板邊（例如電阻放在第 62 欄、span 4）或 `boardId` 不存在：應回報 `PLACEMENT_INVALID`，不得丟例外。→ Task 7 測試。
- 學生輸入小寫或全形減號的孔位名稱（`a12`、`B−30`）：要能正確解析。→ Task 1 測試。

---

## 檔案結構

| 檔案 | 責任 |
|---|---|
| `package.json`、`tsconfig.json`、`.gitignore` | 專案設定 |
| `src/types/geometry.ts` | `GridPoint`、`Direction` |
| `src/types/board.ts` | 版型、板子、格點、群組型別 |
| `src/types/component.ts` | 元件定義、封裝、實例、footprint 型別 |
| `src/types/circuit.ts` | `Circuit`、`Wire`、`Net`、`CircuitError`、`NodeState` |
| `src/types/routing.ts` | 佈線設定、結果、統計、合法性違規型別 |
| `src/core/breadboard/layouts.ts` | `MB102_LAYOUT` |
| `src/core/breadboard/buildBoard.ts` | 從版型產生 `Breadboard` |
| `src/core/breadboard/naming.ts` | 格點查詢、格點 ID、孔位名稱轉換 |
| `src/core/breadboard/registry.ts` | `getBoard` 快取 |
| `src/core/circuit/footprint.ts` | 旋轉與 footprint 計算 |
| `src/core/circuit/library.ts` | 載入與驗證元件 JSON |
| `src/core/circuit/circuitIndex.ts` | 電路索引（腳、本體佔用）與查詢工具 |
| `src/core/circuit/nodeState.ts` | `getNodeState` |
| `src/core/circuit/unionFind.ts` | 聯集–查找 |
| `src/core/circuit/nets.ts` | Net 分析、終端群組 |
| `src/core/circuit/wireGeometry.ts` | 路徑檢查、段、轉彎、節點用法、重疊/交叉分析 |
| `src/core/circuit/validate.ts` | `validateCircuit` |
| `src/core/routing/config.ts` | 預設設定與合併 |
| `src/core/routing/colors.ts` | 導線顏色 |
| `src/core/routing/problem.ts` | 建立佈線問題 |
| `src/core/routing/minHeap.ts` | 確定性最小堆積 |
| `src/core/routing/routeState.ts` | 協商時的格點佔用狀態 |
| `src/core/routing/astar.ts` | 多起點多終點 A*、路徑成本 |
| `src/core/routing/netTree.ts` | 單一 Net 的生成樹 |
| `src/core/routing/legality.ts` | 合法性檢查、Net 對照 |
| `src/core/routing/metrics.ts` | 統計 |
| `src/core/routing/score.ts` | Routing Score |
| `src/core/routing/apply.ts` | 套用結果 |
| `src/core/routing/autoRoute.ts` | 協商迴圈與結果組裝 |
| `src/debug/ascii.ts` | ASCII 預覽 |
| `src/index.ts` | 對外 API |
| `src/data/components/generic/*.json` | 8 個通用元件 |
| `src/data/components/74ls/*.json` | 20 顆 74LS |
| `tests/fixtures/build.ts` | 測試用電路建構工具 |
| `tests/fixtures/circuits.ts` | 固定測試電路 |
| `scripts/demo.ts` | `npm run demo` |

---

### Task 1: 專案骨架與麵包板模型

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`
- Create: `src/types/geometry.ts`, `src/types/board.ts`
- Create: `src/core/breadboard/layouts.ts`, `src/core/breadboard/buildBoard.ts`, `src/core/breadboard/naming.ts`, `src/core/breadboard/registry.ts`
- Test: `tests/breadboard/board.test.ts`

**Interfaces:**
- Consumes: 無
- Produces:
  - `GridPoint { boardId: string; x: number; y: number }`、`Direction = 'N'|'E'|'S'|'W'`
  - `BoardLayout`、`LayoutRow`、`Breadboard`、`BreadboardNode`、`BreadboardGroup`、`BreadboardInstance`、`NodeKind`、`RailLabel`
  - `MB102_LAYOUT: BoardLayout`
  - `buildBoard(layout: BoardLayout, boardId: string): Breadboard`（`board.nodes[(y-1)*width + (x-1)]` 就是 (x, y) 的格點）
  - `nodeIdOf(p: GridPoint): string`、`parseNodeId(id: string): GridPoint`
  - `getNode(board: Breadboard, x: number, y: number): BreadboardNode | undefined`
  - `holeName(board: Breadboard, p: GridPoint): string | null`
  - `parseHoleName(board: Breadboard, name: string): GridPoint | null`
  - `getBoard(layoutId: string, boardId: string): Breadboard`（快取，不可修改回傳值）

- [ ] **Step 1: 建立專案設定並安裝開發依賴**

`package.json`：

```json
{
  "name": "breadboard-router",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "demo": "tsx scripts/demo.ts"
  }
}
```

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src", "tests", "scripts"]
}
```

`.gitignore`：

```text
node_modules/
coverage/
dist/
```

Run: `npm install -D typescript vitest tsx @types/node`
Expected: 安裝成功，`package.json` 出現 `devDependencies`。

- [ ] **Step 2: 寫型別**

`src/types/geometry.ts`：

```ts
export interface GridPoint {
  boardId: string;
  x: number;
  y: number;
}

export type Direction = 'N' | 'E' | 'S' | 'W';
```

`src/types/board.ts`：

```ts
export type NodeKind = 'hole' | 'surface';
export type RailLabel = 'T-' | 'T+' | 'B+' | 'B-';
export type TerminalRowLabel = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J';

export type LayoutRow =
  | { y: number; kind: 'terminal'; label: TerminalRowLabel; half: 'top' | 'bot' }
  | { y: number; kind: 'rail'; label: RailLabel; holeColumns: number[] }
  | { y: number; kind: 'surface' };

export interface BoardLayout {
  id: string;
  width: number;
  height: number;
  rows: LayoutRow[];
}

export interface BreadboardNode {
  id: string;
  boardId: string;
  x: number;
  y: number;
  kind: NodeKind;
  name: string | null;
  groupId: string | null;
}

export interface BreadboardGroup {
  id: string;
  boardId: string;
  kind: 'terminal' | 'rail';
  nodeIds: string[];
}

export interface Breadboard {
  id: string;
  layoutId: string;
  width: number;
  height: number;
  nodes: BreadboardNode[];
  groups: Record<string, BreadboardGroup>;
}

export interface BreadboardInstance {
  id: string;
  layoutId: 'MB102';
  x: number;
  y: number;
  groupId: null;
}
```

- [ ] **Step 3: 寫失敗的測試**

`tests/breadboard/board.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { buildBoard } from '../../src/core/breadboard/buildBoard';
import { MB102_LAYOUT } from '../../src/core/breadboard/layouts';
import { getNode, holeName, nodeIdOf, parseHoleName, parseNodeId } from '../../src/core/breadboard/naming';
import { getBoard } from '../../src/core/breadboard/registry';

const board = buildBoard(MB102_LAYOUT, 'b1');

function nodeNamed(name: string) {
  const p = parseHoleName(board, name);
  if (!p) throw new Error(`no hole ${name}`);
  return getNode(board, p.x, p.y)!;
}

describe('MB-102 board model', () => {
  it('has a 63 x 18 lattice', () => {
    expect(board.nodes).toHaveLength(1134);
    expect(getNode(board, 12, 4)).toBe(board.nodes[(4 - 1) * 63 + (12 - 1)]);
  });

  it('has 830 holes in 130 conductive groups', () => {
    expect(board.nodes.filter((n) => n.kind === 'hole')).toHaveLength(830);
    expect(Object.keys(board.groups)).toHaveLength(130);
  });

  it('connects A12..E12, and separates E12 from F12', () => {
    expect(nodeNamed('A12').groupId).toBe('b1:c12-top');
    expect(nodeNamed('E12').groupId).toBe('b1:c12-top');
    expect(nodeNamed('F12').groupId).toBe('b1:c12-bot');
    expect(nodeNamed('J12').groupId).toBe('b1:c12-bot');
    expect(board.groups['b1:c12-top'].nodeIds).toHaveLength(5);
  });

  it('makes each power rail a single 50-hole group', () => {
    for (const rail of ['T-', 'T+', 'B+', 'B-']) {
      expect(board.groups[`b1:rail-${rail}`].nodeIds).toHaveLength(50);
      expect(board.groups[`b1:rail-${rail}`].kind).toBe('rail');
    }
    expect(nodeNamed('T+3').groupId).toBe('b1:rail-T+');
    expect(nodeNamed('T+61').groupId).toBe('b1:rail-T+');
  });

  it('treats rail gaps, gap rows and the trench as surface', () => {
    const surface: Array<[number, number]> = [[8, 1], [1, 2], [62, 17], [12, 3], [12, 9], [12, 10], [12, 16]];
    for (const [x, y] of surface) {
      const node = getNode(board, x, y)!;
      expect(node.kind).toBe('surface');
      expect(node.groupId).toBeNull();
      expect(node.name).toBeNull();
    }
  });

  it('round-trips every hole name', () => {
    for (const node of board.nodes.filter((n) => n.kind === 'hole')) {
      const p = { boardId: 'b1', x: node.x, y: node.y };
      expect(parseHoleName(board, holeName(board, p)!)).toEqual(p);
    }
  });

  it('parses qualified, lowercase and unicode-minus names, and rejects junk', () => {
    expect(parseHoleName(board, 'b1:A12')).toEqual({ boardId: 'b1', x: 12, y: 4 });
    expect(parseHoleName(board, 'a12')).toEqual({ boardId: 'b1', x: 12, y: 4 });
    expect(parseHoleName(board, 'B−30')).toEqual({ boardId: 'b1', x: 30, y: 18 });
    expect(parseHoleName(board, 'b+30')).toEqual({ boardId: 'b1', x: 30, y: 17 });
    expect(parseHoleName(board, 'B12')).toEqual({ boardId: 'b1', x: 12, y: 5 });
    expect(parseHoleName(board, 'T+8')).toBeNull();
    expect(parseHoleName(board, 'K1')).toBeNull();
    expect(parseHoleName(board, 'b2:A1')).toBeNull();
  });

  it('returns undefined outside the board and null names for surface', () => {
    expect(getNode(board, 0, 1)).toBeUndefined();
    expect(getNode(board, 64, 1)).toBeUndefined();
    expect(getNode(board, 1, 19)).toBeUndefined();
    expect(holeName(board, { boardId: 'b1', x: 12, y: 9 })).toBeNull();
  });

  it('converts node ids both ways', () => {
    expect(nodeIdOf({ boardId: 'b1', x: 12, y: 4 })).toBe('b1:12,4');
    expect(parseNodeId('b1:12,4')).toEqual({ boardId: 'b1', x: 12, y: 4 });
  });

  it('caches boards by layout and id', () => {
    expect(getBoard('MB102', 'b1')).toBe(getBoard('MB102', 'b1'));
    expect(() => getBoard('NOPE', 'b1')).toThrow('Unknown board layout');
  });
});
```

- [ ] **Step 4: 確認測試失敗**

Run: `npx vitest run tests/breadboard/board.test.ts`
Expected: FAIL，找不到 `../../src/core/breadboard/buildBoard`。

- [ ] **Step 5: 實作**

`src/core/breadboard/layouts.ts`：

```ts
import type { BoardLayout, LayoutRow, TerminalRowLabel } from '../../types/board';

const RAIL_COLUMNS: number[] = [];
for (let group = 0; group < 10; group++) {
  for (let i = 0; i < 5; i++) RAIL_COLUMNS.push(3 + group * 6 + i);
}

const TOP_ROWS: TerminalRowLabel[] = ['A', 'B', 'C', 'D', 'E'];
const BOTTOM_ROWS: TerminalRowLabel[] = ['F', 'G', 'H', 'I', 'J'];

const rows: LayoutRow[] = [
  { y: 1, kind: 'rail', label: 'T-', holeColumns: RAIL_COLUMNS },
  { y: 2, kind: 'rail', label: 'T+', holeColumns: RAIL_COLUMNS },
  { y: 3, kind: 'surface' },
  ...TOP_ROWS.map((label, i): LayoutRow => ({ y: 4 + i, kind: 'terminal', label, half: 'top' })),
  { y: 9, kind: 'surface' },
  { y: 10, kind: 'surface' },
  ...BOTTOM_ROWS.map((label, i): LayoutRow => ({ y: 11 + i, kind: 'terminal', label, half: 'bot' })),
  { y: 16, kind: 'surface' },
  { y: 17, kind: 'rail', label: 'B+', holeColumns: RAIL_COLUMNS },
  { y: 18, kind: 'rail', label: 'B-', holeColumns: RAIL_COLUMNS },
];

/** MB-102：63 欄 × A–J，上下各兩條 50 孔全長導通的電源軌。 */
export const MB102_LAYOUT: BoardLayout = { id: 'MB102', width: 63, height: 18, rows };
```

`src/core/breadboard/buildBoard.ts`：

```ts
import type { BoardLayout, Breadboard, BreadboardGroup, BreadboardNode, LayoutRow, NodeKind } from '../../types/board';

export function buildBoard(layout: BoardLayout, boardId: string): Breadboard {
  const nodes: BreadboardNode[] = [];
  const groups: Record<string, BreadboardGroup> = {};
  const rowByY = new Map<number, LayoutRow>(layout.rows.map((row) => [row.y, row]));

  for (let y = 1; y <= layout.height; y++) {
    const row = rowByY.get(y) ?? { y, kind: 'surface' };
    for (let x = 1; x <= layout.width; x++) {
      let kind: NodeKind = 'surface';
      let name: string | null = null;
      let groupId: string | null = null;
      if (row.kind === 'terminal') {
        kind = 'hole';
        name = `${row.label}${x}`;
        groupId = `${boardId}:c${x}-${row.half}`;
      } else if (row.kind === 'rail' && row.holeColumns.includes(x)) {
        kind = 'hole';
        name = `${row.label}${x}`;
        groupId = `${boardId}:rail-${row.label}`;
      }
      const id = `${boardId}:${x},${y}`;
      nodes.push({ id, boardId, x, y, kind, name, groupId });
      if (groupId) {
        const group = (groups[groupId] ??= {
          id: groupId,
          boardId,
          kind: row.kind === 'rail' ? 'rail' : 'terminal',
          nodeIds: [],
        });
        group.nodeIds.push(id);
      }
    }
  }

  return { id: boardId, layoutId: layout.id, width: layout.width, height: layout.height, nodes, groups };
}
```

`src/core/breadboard/naming.ts`：

```ts
import type { Breadboard, BreadboardNode } from '../../types/board';
import type { GridPoint } from '../../types/geometry';

export function nodeIdOf(p: GridPoint): string {
  return `${p.boardId}:${p.x},${p.y}`;
}

export function parseNodeId(id: string): GridPoint {
  const colon = id.lastIndexOf(':');
  const [x, y] = id.slice(colon + 1).split(',').map(Number);
  return { boardId: id.slice(0, colon), x, y };
}

export function getNode(board: Breadboard, x: number, y: number): BreadboardNode | undefined {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
  if (x < 1 || y < 1 || x > board.width || y > board.height) return undefined;
  return board.nodes[(y - 1) * board.width + (x - 1)];
}

export function holeName(board: Breadboard, p: GridPoint): string | null {
  if (p.boardId !== board.id) return null;
  return getNode(board, p.x, p.y)?.name ?? null;
}

const NAME_PATTERN = /^(?:([^:]+):)?(T\+|T-|B\+|B-|[A-J])(\d+)$/;

/** 接受 "A12"、"b1:A12"、小寫 "a12"、全形減號 "B−30"。 */
export function parseHoleName(board: Breadboard, raw: string): GridPoint | null {
  const match = NAME_PATTERN.exec(raw.trim().replace(/[−–]/g, '-').replace(/(^|:)([a-jtb])/i, (_, pre: string, ch: string) => pre + ch.toUpperCase()));
  if (!match) return null;
  const [, qualifier, label, column] = match;
  if (qualifier !== undefined && qualifier !== board.id) return null;
  const name = `${label}${Number(column)}`;
  const node = board.nodes.find((n) => n.name === name);
  return node ? { boardId: board.id, x: node.x, y: node.y } : null;
}
```

`src/core/breadboard/registry.ts`：

```ts
import type { BoardLayout, Breadboard } from '../../types/board';
import { buildBoard } from './buildBoard';
import { MB102_LAYOUT } from './layouts';

const LAYOUTS: Record<string, BoardLayout> = { MB102: MB102_LAYOUT };
const cache = new Map<string, Breadboard>();

/** 回傳快取的板子模型。回傳值是共用物件，呼叫端不可修改。 */
export function getBoard(layoutId: string, boardId: string): Breadboard {
  const key = `${layoutId}/${boardId}`;
  let board = cache.get(key);
  if (!board) {
    const layout = LAYOUTS[layoutId];
    if (!layout) throw new Error(`Unknown board layout: ${layoutId}`);
    board = buildBoard(layout, boardId);
    cache.set(key, board);
  }
  return board;
}
```

- [ ] **Step 6: 確認測試通過、型別檢查通過**

Run: `npx vitest run tests/breadboard/board.test.ts`
Expected: PASS（10 tests）

Run: `npm run typecheck`
Expected: 無錯誤輸出。

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore src/types src/core/breadboard tests/breadboard
git commit -m "feat: add MB-102 breadboard lattice model"
```

---

### Task 2: 元件型別與 footprint

**Files:**
- Create: `src/types/component.ts`
- Create: `src/core/circuit/footprint.ts`
- Test: `tests/circuit/footprint.test.ts`

**Interfaces:**
- Consumes: `GridPoint`（Task 1）
- Produces:
  - `PinRole`、`ComponentCategory`、`PackageSpec`、`PinDefinition`、`LedColor`、`ComponentProps`、`ComponentDefinition`、`Rotation`、`ComponentInstance`、`ResolvedPin`、`Footprint`
  - `rotateOffset(offset: [number, number], rotation: Rotation): [number, number]`
  - `effectiveSpan(instance: ComponentInstance, def: ComponentDefinition): number`（非 two-lead 回傳 0）
  - `resolveFootprint(instance: ComponentInstance, def: ComponentDefinition): Footprint`

- [ ] **Step 1: 寫型別**

`src/types/component.ts`：

```ts
import type { GridPoint } from './geometry';

export type PinRole =
  | 'input'
  | 'output'
  | 'bidir'
  | 'power'
  | 'ground'
  | 'nc'
  | 'passive'
  | 'anode'
  | 'cathode'
  | 'vcc-source'
  | 'gnd-source';

export type ComponentCategory = 'ic' | 'resistor' | 'led' | 'vcc' | 'gnd' | 'dc-power' | 'dip-switch' | 'pushbutton';

export type PackageSpec =
  | { type: 'dip'; pinCount: number; rowSpacing: 3 | 6 }
  | { type: 'two-lead'; defaultSpan: number; minSpan: number; blocksBetween: boolean }
  | { type: 'single' }
  | { type: 'tactile4' };

export interface PinDefinition {
  number: number;
  name: string;
  role: PinRole;
}

export type LedColor = 'red' | 'green' | 'yellow' | 'blue';

export interface ComponentProps {
  resistance?: number;
  color?: LedColor;
  voltage?: number;
  switchStates?: boolean[];
}

export interface ComponentDefinition {
  id: string;
  name: string;
  category: ComponentCategory;
  package: PackageSpec;
  pins: PinDefinition[];
  internalConnections: number[][];
  defaultProps: ComponentProps;
  logic: null;
}

export type Rotation = 0 | 90 | 180 | 270;

export interface ComponentInstance {
  id: string;
  defId: string;
  boardId: string;
  anchor: { x: number; y: number };
  rotation: Rotation;
  span?: number;
  props: ComponentProps;
}

export interface ResolvedPin {
  pinNumber: number;
  point: GridPoint;
}

export interface Footprint {
  pins: ResolvedPin[];
  blocked: GridPoint[];
}
```

- [ ] **Step 2: 寫失敗的測試**

`tests/circuit/footprint.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { effectiveSpan, resolveFootprint, rotateOffset } from '../../src/core/circuit/footprint';
import type { ComponentDefinition, ComponentInstance, PackageSpec, Rotation } from '../../src/types/component';

function def(pkg: PackageSpec): ComponentDefinition {
  return { id: 'T', name: 'T', category: 'ic', package: pkg, pins: [], internalConnections: [], defaultProps: {}, logic: null };
}

function inst(x: number, y: number, rotation: Rotation = 0, span?: number): ComponentInstance {
  return { id: 'c1', defId: 'T', boardId: 'b1', anchor: { x, y }, rotation, span, props: {} };
}

const pins = (fp: ReturnType<typeof resolveFootprint>) => fp.pins.map((p) => [p.pinNumber, p.point.x, p.point.y]);
const cells = (fp: ReturnType<typeof resolveFootprint>) => fp.blocked.map((p) => [p.x, p.y]);

const dip14 = def({ type: 'dip', pinCount: 14, rowSpacing: 3 });
const dip24w = def({ type: 'dip', pinCount: 24, rowSpacing: 6 });
const resistor = def({ type: 'two-lead', defaultSpan: 4, minSpan: 1, blocksBetween: true });
const led = def({ type: 'two-lead', defaultSpan: 1, minSpan: 1, blocksBetween: false });
const single = def({ type: 'single' });
const button = def({ type: 'tactile4' });

describe('rotateOffset', () => {
  it('rotates clockwise in screen coordinates (y down)', () => {
    expect(rotateOffset([1, 0], 0)).toEqual([1, 0]);
    expect(rotateOffset([1, 0], 90)).toEqual([0, 1]);
    expect(rotateOffset([1, 0], 180)).toEqual([-1, 0]);
    expect(rotateOffset([1, 0], 270)).toEqual([0, -1]);
  });
});

describe('resolveFootprint', () => {
  it('places a 0.3-inch DIP14 across the trench with pin 1 bottom-left', () => {
    const fp = resolveFootprint(inst(10, 11), dip14);
    expect(pins(fp)).toEqual([
      [1, 10, 11], [2, 11, 11], [3, 12, 11], [4, 13, 11], [5, 14, 11], [6, 15, 11], [7, 16, 11],
      [8, 16, 8], [9, 15, 8], [10, 14, 8], [11, 13, 8], [12, 12, 8], [13, 11, 8], [14, 10, 8],
    ]);
    expect(fp.blocked).toHaveLength(7 * 4);
    expect(cells(fp)).toContainEqual([12, 9]);
    expect(cells(fp)).toContainEqual([12, 10]);
    expect(fp.pins[0].point.boardId).toBe('b1');
  });

  it('places a DIP14 upside down (rotation 180)', () => {
    const fp = resolveFootprint(inst(16, 8, 180), dip14);
    expect(pins(fp)[0]).toEqual([1, 16, 8]);
    expect(pins(fp)[6]).toEqual([7, 10, 8]);
    expect(pins(fp)[7]).toEqual([8, 10, 11]);
    expect(pins(fp)[13]).toEqual([14, 16, 11]);
  });

  it('places a 0.6-inch DIP24 on rows D and H', () => {
    const fp = resolveFootprint(inst(20, 13), dip24w);
    expect(pins(fp)[0]).toEqual([1, 20, 13]);
    expect(pins(fp)[11]).toEqual([12, 31, 13]);
    expect(pins(fp)[12]).toEqual([13, 31, 7]);
    expect(pins(fp)[23]).toEqual([24, 20, 7]);
    expect(fp.blocked).toHaveLength(12 * 7);
  });

  it('places a resistor with its default span and blocks the body', () => {
    const fp = resolveFootprint(inst(30, 12), resistor);
    expect(pins(fp)).toEqual([[1, 30, 12], [2, 34, 12]]);
    expect(cells(fp)).toEqual([[31, 12], [32, 12], [33, 12]]);
  });

  it('honours span overrides and every rotation for two-lead parts', () => {
    expect(pins(resolveFootprint(inst(29, 8, 90, 3), resistor))).toEqual([[1, 29, 8], [2, 29, 11]]);
    expect(cells(resolveFootprint(inst(29, 8, 90, 3), resistor))).toEqual([[29, 9], [29, 10]]);
    expect(pins(resolveFootprint(inst(30, 12, 180), resistor))).toEqual([[1, 30, 12], [2, 26, 12]]);
    expect(pins(resolveFootprint(inst(30, 12, 270), resistor))).toEqual([[1, 30, 12], [2, 30, 8]]);
    expect(effectiveSpan(inst(1, 1, 0, 7), resistor)).toBe(7);
    expect(effectiveSpan(inst(1, 1), resistor)).toBe(4);
    expect(effectiveSpan(inst(1, 1), dip14)).toBe(0);
  });

  it('does not block anything for LEDs and single terminals', () => {
    expect(pins(resolveFootprint(inst(40, 12), led))).toEqual([[1, 40, 12], [2, 41, 12]]);
    expect(resolveFootprint(inst(40, 12, 0, 3), led).blocked).toEqual([]);
    expect(pins(resolveFootprint(inst(5, 2), single))).toEqual([[1, 5, 2]]);
    expect(resolveFootprint(inst(5, 2), single).blocked).toEqual([]);
  });

  it('places a tactile push button across the trench', () => {
    const fp = resolveFootprint(inst(4, 11), button);
    expect(pins(fp)).toEqual([[1, 4, 11], [2, 4, 8], [3, 6, 11], [4, 6, 8]]);
    expect(fp.blocked).toHaveLength(12);
  });
});
```

- [ ] **Step 3: 確認測試失敗**

Run: `npx vitest run tests/circuit/footprint.test.ts`
Expected: FAIL，找不到 `footprint` 模組。

- [ ] **Step 4: 實作**

`src/core/circuit/footprint.ts`：

```ts
import type { ComponentDefinition, ComponentInstance, Footprint, Rotation } from '../../types/component';

type Offset = [number, number];

/** 以螢幕座標（y 向下）順時針旋轉。用 0 - v 避免產生 -0。 */
export function rotateOffset([dx, dy]: Offset, rotation: Rotation): Offset {
  switch (rotation) {
    case 0:
      return [dx, dy];
    case 90:
      return [0 - dy, dx];
    case 180:
      return [0 - dx, 0 - dy];
    case 270:
      return [dy, 0 - dx];
  }
}

export function effectiveSpan(instance: ComponentInstance, def: ComponentDefinition): number {
  return def.package.type === 'two-lead' ? (instance.span ?? def.package.defaultSpan) : 0;
}

function localFootprint(def: ComponentDefinition, span: number): { pins: Array<[number, Offset]>; blocked: Offset[] } {
  const pkg = def.package;
  switch (pkg.type) {
    case 'dip': {
      const half = pkg.pinCount / 2;
      const pins: Array<[number, Offset]> = [];
      for (let i = 0; i < half; i++) pins.push([i + 1, [i, 0]]);
      for (let j = 0; j < half; j++) pins.push([half + 1 + j, [half - 1 - j, -pkg.rowSpacing]]);
      const blocked: Offset[] = [];
      for (let y = -pkg.rowSpacing; y <= 0; y++) for (let x = 0; x < half; x++) blocked.push([x, y]);
      return { pins, blocked };
    }
    case 'two-lead': {
      const blocked: Offset[] = [];
      if (pkg.blocksBetween) for (let x = 1; x < span; x++) blocked.push([x, 0]);
      return { pins: [[1, [0, 0]], [2, [span, 0]]], blocked };
    }
    case 'single':
      return { pins: [[1, [0, 0]]], blocked: [] };
    case 'tactile4': {
      const blocked: Offset[] = [];
      for (let y = -3; y <= 0; y++) for (let x = 0; x <= 2; x++) blocked.push([x, y]);
      return { pins: [[1, [0, 0]], [2, [0, -3]], [3, [2, 0]], [4, [2, -3]]], blocked };
    }
  }
}

export function resolveFootprint(instance: ComponentInstance, def: ComponentDefinition): Footprint {
  const local = localFootprint(def, effectiveSpan(instance, def));
  const place = (offset: Offset) => {
    const [dx, dy] = rotateOffset(offset, instance.rotation);
    return { boardId: instance.boardId, x: instance.anchor.x + dx, y: instance.anchor.y + dy };
  };
  return {
    pins: local.pins.map(([pinNumber, offset]) => ({ pinNumber, point: place(offset) })),
    blocked: local.blocked.map(place),
  };
}
```

- [ ] **Step 5: 確認測試通過**

Run: `npx vitest run tests/circuit/footprint.test.ts`
Expected: PASS（8 tests）

Run: `npm run typecheck`
Expected: 無錯誤。

- [ ] **Step 6: Commit**

```bash
git add src/types/component.ts src/core/circuit/footprint.ts tests/circuit/footprint.test.ts
git commit -m "feat: add component types and footprint resolution"
```

---
