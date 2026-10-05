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
    const row: LayoutRow = rowByY.get(y) ?? { y, kind: 'surface' };
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

const LABEL_PATTERN = /^(T\+|T-|B\+|B-|[A-J])(\d+)$/;

/** 接受 "A12"、"b1:A12"、小寫 "a12"、全形減號 "B−30"。 */
export function parseHoleName(board: Breadboard, raw: string): GridPoint | null {
  const text = raw.trim().replace(/[−–]/g, '-');
  const colon = text.lastIndexOf(':');
  if (colon >= 0 && text.slice(0, colon) !== board.id) return null;
  const match = LABEL_PATTERN.exec(text.slice(colon + 1).toUpperCase());
  if (!match) return null;
  const name = `${match[1]}${Number(match[2])}`;
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

### Task 3: 元件庫資料與載入器

**Files:**
- Create: `src/data/components/generic/resistor.json`, `led.json`, `vcc.json`, `gnd.json`, `dc-power.json`, `dipsw-4.json`, `dipsw-8.json`, `pushbutton.json`
- Create: `src/data/components/74ls/74LS00.json` … `74LS283.json`（20 個檔案，內容如下）
- Create: `src/core/circuit/library.ts`
- Test: `tests/circuit/library.test.ts`

**Interfaces:**
- Consumes: `ComponentDefinition`、`PackageSpec`、`PinDefinition`、`PinRole`、`ComponentCategory`、`ComponentProps`（Task 2）
- Produces:
  - `parseDefinition(raw: unknown): ComponentDefinition`（驗證失敗丟出 `Invalid component definition <id>: <原因>`）
  - `getComponentDefinitions(): ComponentDefinition[]`（28 個，快取）
  - `getComponentDefinition(id: string): ComponentDefinition | undefined`
  - `RESISTOR_PRESETS: readonly number[]`

- [ ] **Step 1: 寫失敗的測試**

`tests/circuit/library.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { getComponentDefinition, getComponentDefinitions, parseDefinition, RESISTOR_PRESETS } from '../../src/core/circuit/library';

const EXPECTED: Record<string, { pinCount: number; rowSpacing: 3 | 6; vcc: number; gnd: number }> = {
  '74LS00': { pinCount: 14, rowSpacing: 3, vcc: 14, gnd: 7 },
  '74LS02': { pinCount: 14, rowSpacing: 3, vcc: 14, gnd: 7 },
  '74LS04': { pinCount: 14, rowSpacing: 3, vcc: 14, gnd: 7 },
  '74LS08': { pinCount: 14, rowSpacing: 3, vcc: 14, gnd: 7 },
  '74LS32': { pinCount: 14, rowSpacing: 3, vcc: 14, gnd: 7 },
  '74LS74': { pinCount: 14, rowSpacing: 3, vcc: 14, gnd: 7 },
  '74LS86': { pinCount: 14, rowSpacing: 3, vcc: 14, gnd: 7 },
  '74LS90': { pinCount: 14, rowSpacing: 3, vcc: 5, gnd: 10 },
  '74LS93': { pinCount: 14, rowSpacing: 3, vcc: 5, gnd: 10 },
  '74LS138': { pinCount: 16, rowSpacing: 3, vcc: 16, gnd: 8 },
  '74LS154': { pinCount: 24, rowSpacing: 6, vcc: 24, gnd: 12 },
  '74LS161': { pinCount: 16, rowSpacing: 3, vcc: 16, gnd: 8 },
  '74LS163': { pinCount: 16, rowSpacing: 3, vcc: 16, gnd: 8 },
  '74LS173': { pinCount: 16, rowSpacing: 3, vcc: 16, gnd: 8 },
  '74LS174': { pinCount: 16, rowSpacing: 3, vcc: 16, gnd: 8 },
  '74LS175': { pinCount: 16, rowSpacing: 3, vcc: 16, gnd: 8 },
  '74LS193': { pinCount: 16, rowSpacing: 3, vcc: 16, gnd: 8 },
  '74LS245': { pinCount: 20, rowSpacing: 3, vcc: 20, gnd: 10 },
  '74LS273': { pinCount: 20, rowSpacing: 3, vcc: 20, gnd: 10 },
  '74LS283': { pinCount: 16, rowSpacing: 3, vcc: 16, gnd: 8 },
};

const pin = (id: string, n: number) => getComponentDefinition(id)!.pins.find((p) => p.number === n)!;

describe('component library', () => {
  it('loads 28 definitions with unique ids', () => {
    const defs = getComponentDefinitions();
    expect(defs).toHaveLength(28);
    expect(new Set(defs.map((d) => d.id)).size).toBe(28);
    expect(getComponentDefinitions()).toBe(defs);
  });

  it.each(Object.entries(EXPECTED))('%s has the right package and power pins', (id, e) => {
    const def = getComponentDefinition(id)!;
    expect(def.category).toBe('ic');
    expect(def.package).toEqual({ type: 'dip', pinCount: e.pinCount, rowSpacing: e.rowSpacing });
    expect(def.pins.map((p) => p.number)).toEqual(Array.from({ length: e.pinCount }, (_, i) => i + 1));
    expect(def.pins.filter((p) => p.role === 'power').map((p) => p.number)).toEqual([e.vcc]);
    expect(def.pins.filter((p) => p.role === 'ground').map((p) => p.number)).toEqual([e.gnd]);
    expect(def.logic).toBeNull();
  });

  it('spot-checks pin names and roles against the datasheets', () => {
    expect(pin('74LS00', 3)).toEqual({ number: 3, name: '1Y', role: 'output' });
    expect(pin('74LS02', 1)).toEqual({ number: 1, name: '1Y', role: 'output' });
    expect(pin('74LS04', 13)).toEqual({ number: 13, name: '6A', role: 'input' });
    expect(pin('74LS74', 5)).toEqual({ number: 5, name: '1Q', role: 'output' });
    expect(pin('74LS90', 14)).toEqual({ number: 14, name: 'CKA', role: 'input' });
    expect(pin('74LS138', 15)).toEqual({ number: 15, name: '/Y0', role: 'output' });
    expect(pin('74LS154', 23)).toEqual({ number: 23, name: 'A', role: 'input' });
    expect(pin('74LS161', 15)).toEqual({ number: 15, name: 'RCO', role: 'output' });
    expect(pin('74LS193', 12)).toEqual({ number: 12, name: '/CO', role: 'output' });
    expect(pin('74LS283', 9)).toEqual({ number: 9, name: 'C4', role: 'output' });
    expect(pin('74LS283', 7)).toEqual({ number: 7, name: 'C0', role: 'input' });
  });

  it('marks NC pins and bidirectional ports', () => {
    const nc = (id: string) => getComponentDefinition(id)!.pins.filter((p) => p.role === 'nc').map((p) => p.number);
    expect(nc('74LS90')).toEqual([4, 13]);
    expect(nc('74LS93')).toEqual([4, 6, 7, 13]);
    expect(getComponentDefinition('74LS245')!.pins.filter((p) => p.role === 'bidir')).toHaveLength(16);
  });

  it('defines the generic parts', () => {
    expect(getComponentDefinition('pushbutton')!.internalConnections).toEqual([[1, 2], [3, 4]]);
    expect(getComponentDefinition('dipsw-4')!.package).toEqual({ type: 'dip', pinCount: 8, rowSpacing: 3 });
    expect(getComponentDefinition('dipsw-8')!.defaultProps.switchStates).toHaveLength(8);
    expect(getComponentDefinition('led')!.pins.map((p) => p.role)).toEqual(['anode', 'cathode']);
    expect(getComponentDefinition('dc-power')!.pins.map((p) => p.role)).toEqual(['vcc-source', 'gnd-source']);
    expect(getComponentDefinition('resistor')!.package).toEqual({ type: 'two-lead', defaultSpan: 4, minSpan: 1, blocksBetween: true });
    expect(getComponentDefinition('nope')).toBeUndefined();
    expect(RESISTOR_PRESETS).toEqual([220, 330, 470, 1000, 2200, 4700, 10000, 100000]);
  });

  it('rejects malformed definitions', () => {
    const base = {
      id: 'X',
      name: 'X',
      category: 'resistor',
      package: { type: 'two-lead', defaultSpan: 4, minSpan: 1, blocksBetween: true },
      pins: [
        { number: 1, name: '1', role: 'passive' },
        { number: 2, name: '2', role: 'passive' },
      ],
    };
    expect(parseDefinition(base).internalConnections).toEqual([]);
    expect(parseDefinition(base).defaultProps).toEqual({});
    expect(() => parseDefinition({ ...base, category: 'toaster' })).toThrow('unknown category');
    expect(() => parseDefinition({ ...base, pins: [base.pins[0]] })).toThrow('numbered 1..2');
    expect(() => parseDefinition({ ...base, pins: [base.pins[0], { number: 2, name: '2', role: 'magic' }] })).toThrow('unknown role');
    expect(() => parseDefinition({ ...base, package: { type: 'dip', pinCount: 7, rowSpacing: 3 } })).toThrow('even');
    expect(() => parseDefinition({ ...base, internalConnections: [[1, 9]] })).toThrow('internalConnections');
    expect(() => parseDefinition(null)).toThrow('not an object');
  });
});
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run tests/circuit/library.test.ts`
Expected: FAIL，找不到 `library` 模組。

- [ ] **Step 3: 建立通用元件 JSON**

`src/data/components/generic/resistor.json`：

```json
{
  "id": "resistor",
  "name": "Resistor",
  "category": "resistor",
  "package": { "type": "two-lead", "defaultSpan": 4, "minSpan": 1, "blocksBetween": true },
  "pins": [
    { "number": 1, "name": "1", "role": "passive" },
    { "number": 2, "name": "2", "role": "passive" }
  ],
  "internalConnections": [],
  "defaultProps": { "resistance": 1000 },
  "logic": null
}
```

`src/data/components/generic/led.json`：

```json
{
  "id": "led",
  "name": "LED",
  "category": "led",
  "package": { "type": "two-lead", "defaultSpan": 1, "minSpan": 1, "blocksBetween": false },
  "pins": [
    { "number": 1, "name": "A", "role": "anode" },
    { "number": 2, "name": "K", "role": "cathode" }
  ],
  "internalConnections": [],
  "defaultProps": { "color": "red" },
  "logic": null
}
```

`src/data/components/generic/vcc.json`：

```json
{
  "id": "vcc",
  "name": "VCC",
  "category": "vcc",
  "package": { "type": "single" },
  "pins": [{ "number": 1, "name": "VCC", "role": "vcc-source" }],
  "internalConnections": [],
  "defaultProps": { "voltage": 5 },
  "logic": null
}
```

`src/data/components/generic/gnd.json`：

```json
{
  "id": "gnd",
  "name": "GND",
  "category": "gnd",
  "package": { "type": "single" },
  "pins": [{ "number": 1, "name": "GND", "role": "gnd-source" }],
  "internalConnections": [],
  "defaultProps": {},
  "logic": null
}
```

`src/data/components/generic/dc-power.json`：

```json
{
  "id": "dc-power",
  "name": "DC Power",
  "category": "dc-power",
  "package": { "type": "two-lead", "defaultSpan": 1, "minSpan": 1, "blocksBetween": false },
  "pins": [
    { "number": 1, "name": "+", "role": "vcc-source" },
    { "number": 2, "name": "-", "role": "gnd-source" }
  ],
  "internalConnections": [],
  "defaultProps": { "voltage": 5 },
  "logic": null
}
```

`src/data/components/generic/dipsw-4.json`（第 k 個開關接在腳 k 與腳 9−k 之間）：

```json
{
  "id": "dipsw-4",
  "name": "DIP Switch (4)",
  "category": "dip-switch",
  "package": { "type": "dip", "pinCount": 8, "rowSpacing": 3 },
  "pins": [
    { "number": 1, "name": "1", "role": "passive" },
    { "number": 2, "name": "2", "role": "passive" },
    { "number": 3, "name": "3", "role": "passive" },
    { "number": 4, "name": "4", "role": "passive" },
    { "number": 5, "name": "5", "role": "passive" },
    { "number": 6, "name": "6", "role": "passive" },
    { "number": 7, "name": "7", "role": "passive" },
    { "number": 8, "name": "8", "role": "passive" }
  ],
  "internalConnections": [],
  "defaultProps": { "switchStates": [false, false, false, false] },
  "logic": null
}
```

`src/data/components/generic/dipsw-8.json`（第 k 個開關接在腳 k 與腳 17−k 之間）：

```json
{
  "id": "dipsw-8",
  "name": "DIP Switch (8)",
  "category": "dip-switch",
  "package": { "type": "dip", "pinCount": 16, "rowSpacing": 3 },
  "pins": [
    { "number": 1, "name": "1", "role": "passive" },
    { "number": 2, "name": "2", "role": "passive" },
    { "number": 3, "name": "3", "role": "passive" },
    { "number": 4, "name": "4", "role": "passive" },
    { "number": 5, "name": "5", "role": "passive" },
    { "number": 6, "name": "6", "role": "passive" },
    { "number": 7, "name": "7", "role": "passive" },
    { "number": 8, "name": "8", "role": "passive" },
    { "number": 9, "name": "9", "role": "passive" },
    { "number": 10, "name": "10", "role": "passive" },
    { "number": 11, "name": "11", "role": "passive" },
    { "number": 12, "name": "12", "role": "passive" },
    { "number": 13, "name": "13", "role": "passive" },
    { "number": 14, "name": "14", "role": "passive" },
    { "number": 15, "name": "15", "role": "passive" },
    { "number": 16, "name": "16", "role": "passive" }
  ],
  "internalConnections": [],
  "defaultProps": { "switchStates": [false, false, false, false, false, false, false, false] },
  "logic": null
}
```

`src/data/components/generic/pushbutton.json`：

```json
{
  "id": "pushbutton",
  "name": "Push Button",
  "category": "pushbutton",
  "package": { "type": "tactile4" },
  "pins": [
    { "number": 1, "name": "1", "role": "passive" },
    { "number": 2, "name": "2", "role": "passive" },
    { "number": 3, "name": "3", "role": "passive" },
    { "number": 4, "name": "4", "role": "passive" }
  ],
  "internalConnections": [[1, 2], [3, 4]],
  "defaultProps": {},
  "logic": null
}
```

- [ ] **Step 4: 建立 74LS JSON（依 TI datasheet 逐腳建立）**

每個檔案的共同欄位都是 `"category": "ic"`、`"internalConnections": []`、`"defaultProps": {}`、`"logic": null`，`id` 與 `name` 等於檔名。

`src/data/components/74ls/74LS00.json`：

```json
{
  "id": "74LS00",
  "name": "74LS00",
  "category": "ic",
  "package": { "type": "dip", "pinCount": 14, "rowSpacing": 3 },
  "pins": [
    { "number": 1, "name": "1A", "role": "input" },
    { "number": 2, "name": "1B", "role": "input" },
    { "number": 3, "name": "1Y", "role": "output" },
    { "number": 4, "name": "2A", "role": "input" },
    { "number": 5, "name": "2B", "role": "input" },
    { "number": 6, "name": "2Y", "role": "output" },
    { "number": 7, "name": "GND", "role": "ground" },
    { "number": 8, "name": "3Y", "role": "output" },
    { "number": 9, "name": "3A", "role": "input" },
    { "number": 10, "name": "3B", "role": "input" },
    { "number": 11, "name": "4Y", "role": "output" },
    { "number": 12, "name": "4A", "role": "input" },
    { "number": 13, "name": "4B", "role": "input" },
    { "number": 14, "name": "VCC", "role": "power" }
  ],
  "internalConnections": [],
  "defaultProps": {},
  "logic": null
}
```

`src/data/components/74ls/74LS08.json`、`74LS32.json`、`74LS86.json`：腳位與 74LS00 完全相同（四組 2 輸入閘、同樣的 1A/1B/1Y … 排列），只把 `id` 與 `name` 換成 `"74LS08"`、`"74LS32"`、`"74LS86"`。以 74LS08 為例，完整內容：

```json
{
  "id": "74LS08",
  "name": "74LS08",
  "category": "ic",
  "package": { "type": "dip", "pinCount": 14, "rowSpacing": 3 },
  "pins": [
    { "number": 1, "name": "1A", "role": "input" },
    { "number": 2, "name": "1B", "role": "input" },
    { "number": 3, "name": "1Y", "role": "output" },
    { "number": 4, "name": "2A", "role": "input" },
    { "number": 5, "name": "2B", "role": "input" },
    { "number": 6, "name": "2Y", "role": "output" },
    { "number": 7, "name": "GND", "role": "ground" },
    { "number": 8, "name": "3Y", "role": "output" },
    { "number": 9, "name": "3A", "role": "input" },
    { "number": 10, "name": "3B", "role": "input" },
    { "number": 11, "name": "4Y", "role": "output" },
    { "number": 12, "name": "4A", "role": "input" },
    { "number": 13, "name": "4B", "role": "input" },
    { "number": 14, "name": "VCC", "role": "power" }
  ],
  "internalConnections": [],
  "defaultProps": {},
  "logic": null
}
```

其餘 IC 的 `pins` 陣列如下（`package` 依第 5.4 節：DIP14/16/20 為 `rowSpacing: 3`，74LS154 為 DIP24 `rowSpacing: 6`）：

`74LS02.json`（DIP14）：

```json
[
  { "number": 1, "name": "1Y", "role": "output" },
  { "number": 2, "name": "1A", "role": "input" },
  { "number": 3, "name": "1B", "role": "input" },
  { "number": 4, "name": "2Y", "role": "output" },
  { "number": 5, "name": "2A", "role": "input" },
  { "number": 6, "name": "2B", "role": "input" },
  { "number": 7, "name": "GND", "role": "ground" },
  { "number": 8, "name": "3A", "role": "input" },
  { "number": 9, "name": "3B", "role": "input" },
  { "number": 10, "name": "3Y", "role": "output" },
  { "number": 11, "name": "4A", "role": "input" },
  { "number": 12, "name": "4B", "role": "input" },
  { "number": 13, "name": "4Y", "role": "output" },
  { "number": 14, "name": "VCC", "role": "power" }
]
```

`74LS04.json`（DIP14）：

```json
[
  { "number": 1, "name": "1A", "role": "input" },
  { "number": 2, "name": "1Y", "role": "output" },
  { "number": 3, "name": "2A", "role": "input" },
  { "number": 4, "name": "2Y", "role": "output" },
  { "number": 5, "name": "3A", "role": "input" },
  { "number": 6, "name": "3Y", "role": "output" },
  { "number": 7, "name": "GND", "role": "ground" },
  { "number": 8, "name": "4Y", "role": "output" },
  { "number": 9, "name": "4A", "role": "input" },
  { "number": 10, "name": "5Y", "role": "output" },
  { "number": 11, "name": "5A", "role": "input" },
  { "number": 12, "name": "6Y", "role": "output" },
  { "number": 13, "name": "6A", "role": "input" },
  { "number": 14, "name": "VCC", "role": "power" }
]
```

`74LS74.json`（DIP14）：

```json
[
  { "number": 1, "name": "1/CLR", "role": "input" },
  { "number": 2, "name": "1D", "role": "input" },
  { "number": 3, "name": "1CLK", "role": "input" },
  { "number": 4, "name": "1/PRE", "role": "input" },
  { "number": 5, "name": "1Q", "role": "output" },
  { "number": 6, "name": "1/Q", "role": "output" },
  { "number": 7, "name": "GND", "role": "ground" },
  { "number": 8, "name": "2/Q", "role": "output" },
  { "number": 9, "name": "2Q", "role": "output" },
  { "number": 10, "name": "2/PRE", "role": "input" },
  { "number": 11, "name": "2CLK", "role": "input" },
  { "number": 12, "name": "2D", "role": "input" },
  { "number": 13, "name": "2/CLR", "role": "input" },
  { "number": 14, "name": "VCC", "role": "power" }
]
```

`74LS90.json`（DIP14，VCC 第 5 腳、GND 第 10 腳）：

```json
[
  { "number": 1, "name": "CKB", "role": "input" },
  { "number": 2, "name": "R0(1)", "role": "input" },
  { "number": 3, "name": "R0(2)", "role": "input" },
  { "number": 4, "name": "NC", "role": "nc" },
  { "number": 5, "name": "VCC", "role": "power" },
  { "number": 6, "name": "R9(1)", "role": "input" },
  { "number": 7, "name": "R9(2)", "role": "input" },
  { "number": 8, "name": "QC", "role": "output" },
  { "number": 9, "name": "QB", "role": "output" },
  { "number": 10, "name": "GND", "role": "ground" },
  { "number": 11, "name": "QD", "role": "output" },
  { "number": 12, "name": "QA", "role": "output" },
  { "number": 13, "name": "NC", "role": "nc" },
  { "number": 14, "name": "CKA", "role": "input" }
]
```

`74LS93.json`（DIP14，VCC 第 5 腳、GND 第 10 腳）：

```json
[
  { "number": 1, "name": "CKB", "role": "input" },
  { "number": 2, "name": "R0(1)", "role": "input" },
  { "number": 3, "name": "R0(2)", "role": "input" },
  { "number": 4, "name": "NC", "role": "nc" },
  { "number": 5, "name": "VCC", "role": "power" },
  { "number": 6, "name": "NC", "role": "nc" },
  { "number": 7, "name": "NC", "role": "nc" },
  { "number": 8, "name": "QC", "role": "output" },
  { "number": 9, "name": "QB", "role": "output" },
  { "number": 10, "name": "GND", "role": "ground" },
  { "number": 11, "name": "QD", "role": "output" },
  { "number": 12, "name": "QA", "role": "output" },
  { "number": 13, "name": "NC", "role": "nc" },
  { "number": 14, "name": "CKA", "role": "input" }
]
```

`74LS138.json`（DIP16）：

```json
[
  { "number": 1, "name": "A", "role": "input" },
  { "number": 2, "name": "B", "role": "input" },
  { "number": 3, "name": "C", "role": "input" },
  { "number": 4, "name": "/G2A", "role": "input" },
  { "number": 5, "name": "/G2B", "role": "input" },
  { "number": 6, "name": "G1", "role": "input" },
  { "number": 7, "name": "/Y7", "role": "output" },
  { "number": 8, "name": "GND", "role": "ground" },
  { "number": 9, "name": "/Y6", "role": "output" },
  { "number": 10, "name": "/Y5", "role": "output" },
  { "number": 11, "name": "/Y4", "role": "output" },
  { "number": 12, "name": "/Y3", "role": "output" },
  { "number": 13, "name": "/Y2", "role": "output" },
  { "number": 14, "name": "/Y1", "role": "output" },
  { "number": 15, "name": "/Y0", "role": "output" },
  { "number": 16, "name": "VCC", "role": "power" }
]
```

`74LS154.json`（DIP24，`"rowSpacing": 6`）：

```json
[
  { "number": 1, "name": "/Y0", "role": "output" },
  { "number": 2, "name": "/Y1", "role": "output" },
  { "number": 3, "name": "/Y2", "role": "output" },
  { "number": 4, "name": "/Y3", "role": "output" },
  { "number": 5, "name": "/Y4", "role": "output" },
  { "number": 6, "name": "/Y5", "role": "output" },
  { "number": 7, "name": "/Y6", "role": "output" },
  { "number": 8, "name": "/Y7", "role": "output" },
  { "number": 9, "name": "/Y8", "role": "output" },
  { "number": 10, "name": "/Y9", "role": "output" },
  { "number": 11, "name": "/Y10", "role": "output" },
  { "number": 12, "name": "GND", "role": "ground" },
  { "number": 13, "name": "/Y11", "role": "output" },
  { "number": 14, "name": "/Y12", "role": "output" },
  { "number": 15, "name": "/Y13", "role": "output" },
  { "number": 16, "name": "/Y14", "role": "output" },
  { "number": 17, "name": "/Y15", "role": "output" },
  { "number": 18, "name": "/G1", "role": "input" },
  { "number": 19, "name": "/G2", "role": "input" },
  { "number": 20, "name": "D", "role": "input" },
  { "number": 21, "name": "C", "role": "input" },
  { "number": 22, "name": "B", "role": "input" },
  { "number": 23, "name": "A", "role": "input" },
  { "number": 24, "name": "VCC", "role": "power" }
]
```

`74LS161.json` 與 `74LS163.json`（DIP16，兩者腳位相同）：

```json
[
  { "number": 1, "name": "/CLR", "role": "input" },
  { "number": 2, "name": "CLK", "role": "input" },
  { "number": 3, "name": "A", "role": "input" },
  { "number": 4, "name": "B", "role": "input" },
  { "number": 5, "name": "C", "role": "input" },
  { "number": 6, "name": "D", "role": "input" },
  { "number": 7, "name": "ENP", "role": "input" },
  { "number": 8, "name": "GND", "role": "ground" },
  { "number": 9, "name": "/LOAD", "role": "input" },
  { "number": 10, "name": "ENT", "role": "input" },
  { "number": 11, "name": "QD", "role": "output" },
  { "number": 12, "name": "QC", "role": "output" },
  { "number": 13, "name": "QB", "role": "output" },
  { "number": 14, "name": "QA", "role": "output" },
  { "number": 15, "name": "RCO", "role": "output" },
  { "number": 16, "name": "VCC", "role": "power" }
]
```

`74LS173.json`（DIP16）：

```json
[
  { "number": 1, "name": "M", "role": "input" },
  { "number": 2, "name": "N", "role": "input" },
  { "number": 3, "name": "1Q", "role": "output" },
  { "number": 4, "name": "2Q", "role": "output" },
  { "number": 5, "name": "3Q", "role": "output" },
  { "number": 6, "name": "4Q", "role": "output" },
  { "number": 7, "name": "CLK", "role": "input" },
  { "number": 8, "name": "GND", "role": "ground" },
  { "number": 9, "name": "/G1", "role": "input" },
  { "number": 10, "name": "/G2", "role": "input" },
  { "number": 11, "name": "4D", "role": "input" },
  { "number": 12, "name": "3D", "role": "input" },
  { "number": 13, "name": "2D", "role": "input" },
  { "number": 14, "name": "1D", "role": "input" },
  { "number": 15, "name": "CLR", "role": "input" },
  { "number": 16, "name": "VCC", "role": "power" }
]
```

`74LS174.json`（DIP16）：

```json
[
  { "number": 1, "name": "/CLR", "role": "input" },
  { "number": 2, "name": "1Q", "role": "output" },
  { "number": 3, "name": "1D", "role": "input" },
  { "number": 4, "name": "2D", "role": "input" },
  { "number": 5, "name": "2Q", "role": "output" },
  { "number": 6, "name": "3D", "role": "input" },
  { "number": 7, "name": "3Q", "role": "output" },
  { "number": 8, "name": "GND", "role": "ground" },
  { "number": 9, "name": "CLK", "role": "input" },
  { "number": 10, "name": "4Q", "role": "output" },
  { "number": 11, "name": "4D", "role": "input" },
  { "number": 12, "name": "5Q", "role": "output" },
  { "number": 13, "name": "5D", "role": "input" },
  { "number": 14, "name": "6D", "role": "input" },
  { "number": 15, "name": "6Q", "role": "output" },
  { "number": 16, "name": "VCC", "role": "power" }
]
```

`74LS175.json`（DIP16）：

```json
[
  { "number": 1, "name": "/CLR", "role": "input" },
  { "number": 2, "name": "1Q", "role": "output" },
  { "number": 3, "name": "1/Q", "role": "output" },
  { "number": 4, "name": "1D", "role": "input" },
  { "number": 5, "name": "2D", "role": "input" },
  { "number": 6, "name": "2/Q", "role": "output" },
  { "number": 7, "name": "2Q", "role": "output" },
  { "number": 8, "name": "GND", "role": "ground" },
  { "number": 9, "name": "CLK", "role": "input" },
  { "number": 10, "name": "3Q", "role": "output" },
  { "number": 11, "name": "3/Q", "role": "output" },
  { "number": 12, "name": "3D", "role": "input" },
  { "number": 13, "name": "4D", "role": "input" },
  { "number": 14, "name": "4/Q", "role": "output" },
  { "number": 15, "name": "4Q", "role": "output" },
  { "number": 16, "name": "VCC", "role": "power" }
]
```

`74LS193.json`（DIP16）：

```json
[
  { "number": 1, "name": "B", "role": "input" },
  { "number": 2, "name": "QB", "role": "output" },
  { "number": 3, "name": "QA", "role": "output" },
  { "number": 4, "name": "DOWN", "role": "input" },
  { "number": 5, "name": "UP", "role": "input" },
  { "number": 6, "name": "QC", "role": "output" },
  { "number": 7, "name": "QD", "role": "output" },
  { "number": 8, "name": "GND", "role": "ground" },
  { "number": 9, "name": "D", "role": "input" },
  { "number": 10, "name": "C", "role": "input" },
  { "number": 11, "name": "/LOAD", "role": "input" },
  { "number": 12, "name": "/CO", "role": "output" },
  { "number": 13, "name": "/BO", "role": "output" },
  { "number": 14, "name": "CLR", "role": "input" },
  { "number": 15, "name": "A", "role": "input" },
  { "number": 16, "name": "VCC", "role": "power" }
]
```

`74LS245.json`（DIP20）：

```json
[
  { "number": 1, "name": "DIR", "role": "input" },
  { "number": 2, "name": "A1", "role": "bidir" },
  { "number": 3, "name": "A2", "role": "bidir" },
  { "number": 4, "name": "A3", "role": "bidir" },
  { "number": 5, "name": "A4", "role": "bidir" },
  { "number": 6, "name": "A5", "role": "bidir" },
  { "number": 7, "name": "A6", "role": "bidir" },
  { "number": 8, "name": "A7", "role": "bidir" },
  { "number": 9, "name": "A8", "role": "bidir" },
  { "number": 10, "name": "GND", "role": "ground" },
  { "number": 11, "name": "B8", "role": "bidir" },
  { "number": 12, "name": "B7", "role": "bidir" },
  { "number": 13, "name": "B6", "role": "bidir" },
  { "number": 14, "name": "B5", "role": "bidir" },
  { "number": 15, "name": "B4", "role": "bidir" },
  { "number": 16, "name": "B3", "role": "bidir" },
  { "number": 17, "name": "B2", "role": "bidir" },
  { "number": 18, "name": "B1", "role": "bidir" },
  { "number": 19, "name": "/G", "role": "input" },
  { "number": 20, "name": "VCC", "role": "power" }
]
```

`74LS273.json`（DIP20）：

```json
[
  { "number": 1, "name": "/CLR", "role": "input" },
  { "number": 2, "name": "1Q", "role": "output" },
  { "number": 3, "name": "1D", "role": "input" },
  { "number": 4, "name": "2D", "role": "input" },
  { "number": 5, "name": "2Q", "role": "output" },
  { "number": 6, "name": "3Q", "role": "output" },
  { "number": 7, "name": "3D", "role": "input" },
  { "number": 8, "name": "4D", "role": "input" },
  { "number": 9, "name": "4Q", "role": "output" },
  { "number": 10, "name": "GND", "role": "ground" },
  { "number": 11, "name": "CLK", "role": "input" },
  { "number": 12, "name": "5Q", "role": "output" },
  { "number": 13, "name": "5D", "role": "input" },
  { "number": 14, "name": "6D", "role": "input" },
  { "number": 15, "name": "6Q", "role": "output" },
  { "number": 16, "name": "7Q", "role": "output" },
  { "number": 17, "name": "7D", "role": "input" },
  { "number": 18, "name": "8D", "role": "input" },
  { "number": 19, "name": "8Q", "role": "output" },
  { "number": 20, "name": "VCC", "role": "power" }
]
```

`74LS283.json`（DIP16）：

```json
[
  { "number": 1, "name": "S2", "role": "output" },
  { "number": 2, "name": "B2", "role": "input" },
  { "number": 3, "name": "A2", "role": "input" },
  { "number": 4, "name": "S1", "role": "output" },
  { "number": 5, "name": "A1", "role": "input" },
  { "number": 6, "name": "B1", "role": "input" },
  { "number": 7, "name": "C0", "role": "input" },
  { "number": 8, "name": "GND", "role": "ground" },
  { "number": 9, "name": "C4", "role": "output" },
  { "number": 10, "name": "S4", "role": "output" },
  { "number": 11, "name": "B4", "role": "input" },
  { "number": 12, "name": "A4", "role": "input" },
  { "number": 13, "name": "S3", "role": "output" },
  { "number": 14, "name": "A3", "role": "input" },
  { "number": 15, "name": "B3", "role": "input" },
  { "number": 16, "name": "VCC", "role": "power" }
]
```

- [ ] **Step 5: 實作載入器**

`src/core/circuit/library.ts`：

```ts
import type {
  ComponentCategory,
  ComponentDefinition,
  ComponentProps,
  PackageSpec,
  PinDefinition,
  PinRole,
} from '../../types/component';
import dcPower from '../../data/components/generic/dc-power.json';
import dipsw4 from '../../data/components/generic/dipsw-4.json';
import dipsw8 from '../../data/components/generic/dipsw-8.json';
import gnd from '../../data/components/generic/gnd.json';
import led from '../../data/components/generic/led.json';
import pushbutton from '../../data/components/generic/pushbutton.json';
import resistor from '../../data/components/generic/resistor.json';
import vcc from '../../data/components/generic/vcc.json';
import ls00 from '../../data/components/74ls/74LS00.json';
import ls02 from '../../data/components/74ls/74LS02.json';
import ls04 from '../../data/components/74ls/74LS04.json';
import ls08 from '../../data/components/74ls/74LS08.json';
import ls32 from '../../data/components/74ls/74LS32.json';
import ls74 from '../../data/components/74ls/74LS74.json';
import ls86 from '../../data/components/74ls/74LS86.json';
import ls90 from '../../data/components/74ls/74LS90.json';
import ls93 from '../../data/components/74ls/74LS93.json';
import ls138 from '../../data/components/74ls/74LS138.json';
import ls154 from '../../data/components/74ls/74LS154.json';
import ls161 from '../../data/components/74ls/74LS161.json';
import ls163 from '../../data/components/74ls/74LS163.json';
import ls173 from '../../data/components/74ls/74LS173.json';
import ls174 from '../../data/components/74ls/74LS174.json';
import ls175 from '../../data/components/74ls/74LS175.json';
import ls193 from '../../data/components/74ls/74LS193.json';
import ls245 from '../../data/components/74ls/74LS245.json';
import ls273 from '../../data/components/74ls/74LS273.json';
import ls283 from '../../data/components/74ls/74LS283.json';

const RAW_DEFINITIONS: unknown[] = [
  resistor, led, vcc, gnd, dcPower, dipsw4, dipsw8, pushbutton,
  ls00, ls02, ls04, ls08, ls32, ls74, ls86, ls90, ls93, ls138,
  ls154, ls161, ls163, ls173, ls174, ls175, ls193, ls245, ls273, ls283,
];

export const RESISTOR_PRESETS: readonly number[] = [220, 330, 470, 1000, 2200, 4700, 10000, 100000];

const CATEGORIES = new Set<string>(['ic', 'resistor', 'led', 'vcc', 'gnd', 'dc-power', 'dip-switch', 'pushbutton']);
const ROLES = new Set<string>([
  'input', 'output', 'bidir', 'power', 'ground', 'nc', 'passive', 'anode', 'cathode', 'vcc-source', 'gnd-source',
]);

function fail(id: string, message: string): never {
  throw new Error(`Invalid component definition ${id}: ${message}`);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function parsePackage(id: string, raw: unknown): { pkg: PackageSpec; pinCount: number } {
  if (typeof raw !== 'object' || raw === null) fail(id, 'missing package');
  const p = raw as Record<string, unknown>;
  switch (p.type) {
    case 'dip': {
      const pinCount = p.pinCount;
      const rowSpacing = p.rowSpacing;
      if (!isPositiveInt(pinCount) || pinCount % 2 !== 0) fail(id, 'dip pinCount must be a positive even integer');
      if (rowSpacing !== 3 && rowSpacing !== 6) fail(id, 'dip rowSpacing must be 3 or 6');
      return { pkg: { type: 'dip', pinCount, rowSpacing }, pinCount };
    }
    case 'two-lead': {
      const defaultSpan = p.defaultSpan;
      const minSpan = p.minSpan;
      const blocksBetween = p.blocksBetween;
      if (!isPositiveInt(defaultSpan) || !isPositiveInt(minSpan) || defaultSpan < minSpan) {
        fail(id, 'two-lead spans must be integers with defaultSpan >= minSpan >= 1');
      }
      if (typeof blocksBetween !== 'boolean') fail(id, 'two-lead blocksBetween must be a boolean');
      return { pkg: { type: 'two-lead', defaultSpan, minSpan, blocksBetween }, pinCount: 2 };
    }
    case 'single':
      return { pkg: { type: 'single' }, pinCount: 1 };
    case 'tactile4':
      return { pkg: { type: 'tactile4' }, pinCount: 4 };
    default:
      return fail(id, `unknown package type ${String(p.type)}`);
  }
}

/** 驗證一份 JSON 元件定義；資料錯誤時丟出可讀的錯誤。 */
export function parseDefinition(raw: unknown): ComponentDefinition {
  if (typeof raw !== 'object' || raw === null) throw new Error('Invalid component definition: not an object');
  const d = raw as Record<string, unknown>;
  const id = typeof d.id === 'string' && d.id.length > 0 ? d.id : fail('?', 'missing id');
  const name = d.name;
  if (typeof name !== 'string') fail(id, 'missing name');
  const category = d.category;
  if (typeof category !== 'string' || !CATEGORIES.has(category)) fail(id, `unknown category ${String(category)}`);
  const { pkg, pinCount } = parsePackage(id, d.package);

  const rawPins = d.pins;
  if (!Array.isArray(rawPins)) fail(id, 'pins must be an array');
  const pins: PinDefinition[] = rawPins.map((entry: unknown, i: number) => {
    const p = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;
    const num = p.number;
    const pinName = p.name;
    const role = p.role;
    if (!isPositiveInt(num)) fail(id, `pin #${i} has an invalid number`);
    if (typeof pinName !== 'string') fail(id, `pin ${num} has no name`);
    if (typeof role !== 'string' || !ROLES.has(role)) fail(id, `pin ${num} has unknown role ${String(role)}`);
    return { number: num, name: pinName, role: role as PinRole };
  });
  const numbers = pins.map((p) => p.number).sort((a, b) => a - b);
  if (numbers.length !== pinCount || numbers.some((n, i) => n !== i + 1)) fail(id, `pins must be numbered 1..${pinCount}`);

  const internalConnections = d.internalConnections ?? [];
  if (
    !Array.isArray(internalConnections) ||
    !internalConnections.every((set: unknown) => Array.isArray(set) && set.every((n: unknown) => isPositiveInt(n) && n <= pinCount))
  ) {
    fail(id, 'internalConnections must be arrays of pin numbers');
  }
  const defaultProps = d.defaultProps ?? {};
  if (typeof defaultProps !== 'object' || defaultProps === null) fail(id, 'defaultProps must be an object');

  return {
    id,
    name,
    category: category as ComponentCategory,
    package: pkg,
    pins,
    internalConnections: internalConnections as number[][],
    defaultProps: defaultProps as ComponentProps,
    logic: null,
  };
}

let cache: ComponentDefinition[] | null = null;

export function getComponentDefinitions(): ComponentDefinition[] {
  if (!cache) {
    const defs = RAW_DEFINITIONS.map(parseDefinition);
    const seen = new Set<string>();
    for (const def of defs) {
      if (seen.has(def.id)) throw new Error(`Duplicate component definition id: ${def.id}`);
      seen.add(def.id);
    }
    cache = defs;
  }
  return cache;
}

export function getComponentDefinition(id: string): ComponentDefinition | undefined {
  return getComponentDefinitions().find((def) => def.id === id);
}
```

- [ ] **Step 6: 確認測試通過**

Run: `npx vitest run tests/circuit/library.test.ts`
Expected: PASS（7 個 it，其中 `it.each` 展開為 20 個，共 26 tests）

Run: `npm run typecheck`
Expected: 無錯誤。若 TypeScript 對 `p.rowSpacing` 等收窄報錯，確認已先存成區域常數（如上）。

- [ ] **Step 7: Commit**

```bash
git add src/data src/core/circuit/library.ts tests/circuit/library.test.ts
git commit -m "feat: add component library with 74LS pinouts"
```

---

### Task 4: 電路型別、電路索引、節點狀態與測試建構工具

**Files:**
- Create: `src/types/circuit.ts`
- Create: `src/core/circuit/circuitIndex.ts`, `src/core/circuit/nodeState.ts`
- Create: `tests/fixtures/build.ts`
- Test: `tests/circuit/nodeState.test.ts`

**Interfaces:**
- Consumes: `getBoard`、`getNode`、`nodeIdOf`（Task 1）；`resolveFootprint`（Task 2）；`getComponentDefinition`（Task 3）
- Produces:
  - 型別：`Wire`、`Circuit`、`PinRef`、`Net`、`CircuitErrorCode`、`CircuitError`、`NodeState`
  - `PlacedComponent { instance; def; footprint }`、`CircuitIndex { boards; placed; placedById; pinsAt; bodiesAt }`
  - `indexCircuit(circuit: Circuit): CircuitIndex`（未知 `defId` 丟出 `Unknown component definition: <id>`）
  - `pushTo<T>(map: Map<string, T[]>, key: string, value: T): void`
  - `nodeAt(index, p): BreadboardNode | undefined`、`groupOfPoint(index, p): string | null`、`groupInfo(index, groupId): BreadboardGroup | undefined`
  - `pinPoint(index, ref): GridPoint | undefined`、`pinDefinition(index, ref): PinDefinition | undefined`
  - `propsOf(pc): ComponentProps`、`componentLabel(pc): string`（格式 `"74LS00 (U1)"`）
  - `getNodeState(circuit, point): NodeState | null`
  - 測試工具（`tests/fixtures/build.ts`）：`BOARD_ID = 'b1'`、`type Where = string | [number, number]`、`hole(name)`、`pt(x, y)`、`comp(id, defId, anchor, opts?)`、`wire(id, ...points)`、`circuit(components, wires?)`

- [ ] **Step 1: 寫型別**

`src/types/circuit.ts`：

```ts
import type { BreadboardInstance, NodeKind } from './board';
import type { ComponentInstance } from './component';
import type { GridPoint } from './geometry';

export interface Wire {
  id: string;
  color: string;
  source: 'manual' | 'auto';
  netId?: string;
  start: GridPoint;
  end: GridPoint;
  /** 含起點與終點；相鄰兩點距離必須為 1。 */
  path: GridPoint[];
}

export interface Circuit {
  version: 1;
  boards: BreadboardInstance[];
  components: ComponentInstance[];
  wires: Wire[];
}

export interface PinRef {
  componentId: string;
  pinNumber: number;
}

export interface Net {
  id: string;
  name: string;
  kind: 'power' | 'ground' | 'signal';
  groupIds: string[];
  pins: PinRef[];
}

export type CircuitErrorCode =
  | 'PLACEMENT_INVALID'
  | 'PIN_COLLISION'
  | 'BODY_OVERLAP'
  | 'WIRE_ENDPOINT_INVALID'
  | 'WIRE_PATH_INVALID'
  | 'WIRE_THROUGH_OBSTACLE'
  | 'WIRE_OVERLAP'
  | 'SHORT_CIRCUIT'
  | 'IC_PIN_SHORT'
  | 'IC_POWER_MISSING'
  | 'OUTPUT_CONFLICT'
  | 'NO_POWER_SOURCE'
  | 'INPUT_FLOATING'
  | 'PIN_UNCONNECTED'
  | 'LED_REVERSED'
  | 'LED_NO_RESISTOR'
  | 'COMPONENT_SHORTED'
  | 'CIRCUIT_VALID';

export interface CircuitError {
  code: CircuitErrorCode;
  severity: 'error' | 'warning' | 'info';
  message: string;
  points: GridPoint[];
  componentIds: string[];
  wireIds: string[];
  netIds: string[];
}

export interface NodeState {
  nodeId: string;
  kind: NodeKind;
  name: string | null;
  groupId: string | null;
  pin: PinRef | null;
  blockedBy: string[];
  wireEnds: string[];
  wirePasses: string[];
  occupied: boolean;
  routable: boolean;
}
```

- [ ] **Step 2: 寫測試建構工具**

`tests/fixtures/build.ts`：

```ts
import { parseHoleName } from '../../src/core/breadboard/naming';
import { getBoard } from '../../src/core/breadboard/registry';
import type { Circuit, Wire } from '../../src/types/circuit';
import type { ComponentInstance, ComponentProps, Rotation } from '../../src/types/component';
import type { GridPoint } from '../../src/types/geometry';

export const BOARD_ID = 'b1';
const board = getBoard('MB102', BOARD_ID);

/** 孔位名稱（例如 "E12"、"T+5"）或格子座標 [x, y]。 */
export type Where = string | [number, number];

export function hole(name: string): GridPoint {
  const p = parseHoleName(board, name);
  if (!p) throw new Error(`Unknown hole ${name}`);
  return p;
}

export function pt(x: number, y: number): GridPoint {
  return { boardId: BOARD_ID, x, y };
}

function toPoint(where: Where): GridPoint {
  return typeof where === 'string' ? hole(where) : pt(where[0], where[1]);
}

export function comp(
  id: string,
  defId: string,
  anchor: Where,
  opts: { rotation?: Rotation; span?: number; props?: ComponentProps } = {},
): ComponentInstance {
  const p = toPoint(anchor);
  const instance: ComponentInstance = {
    id,
    defId,
    boardId: BOARD_ID,
    anchor: { x: p.x, y: p.y },
    rotation: opts.rotation ?? 0,
    props: opts.props ?? {},
  };
  if (opts.span !== undefined) instance.span = opts.span;
  return instance;
}

/** 從 a 走到 b：先水平再垂直。 */
function run(a: GridPoint, b: GridPoint): GridPoint[] {
  const out: GridPoint[] = [a];
  let { x, y } = a;
  while (x !== b.x) {
    x += Math.sign(b.x - x);
    out.push(pt(x, y));
  }
  while (y !== b.y) {
    y += Math.sign(b.y - y);
    out.push(pt(x, y));
  }
  return out;
}

/** 依序經過每個點的手動導線；相鄰兩點之間先水平再垂直。 */
export function wire(id: string, ...points: Where[]): Wire {
  const pts = points.map(toPoint);
  const path: GridPoint[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) path.push(...run(pts[i - 1], pts[i]).slice(1));
  return { id, color: '#888888', source: 'manual', start: pts[0], end: pts[pts.length - 1], path };
}

export function circuit(components: ComponentInstance[], wires: Wire[] = []): Circuit {
  return { version: 1, boards: [{ id: BOARD_ID, layoutId: 'MB102', x: 0, y: 0, groupId: null }], components, wires };
}
```

- [ ] **Step 3: 寫失敗的測試**

`tests/circuit/nodeState.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { componentLabel, groupInfo, indexCircuit, pinDefinition, pinPoint, propsOf } from '../../src/core/circuit/circuitIndex';
import { getNodeState } from '../../src/core/circuit/nodeState';
import { circuit, comp, hole, pt, wire } from '../fixtures/build';

const c = circuit([comp('U1', '74LS00', 'F10'), comp('R1', 'resistor', 'G30', { props: { resistance: 220 } })], [wire('w1', 'A20', 'A25')]);

describe('indexCircuit', () => {
  const index = indexCircuit(c);

  it('indexes pins and bodies by node id', () => {
    expect(index.pinsAt.get('b1:10,8')).toEqual([{ componentId: 'U1', pinNumber: 14 }]);
    expect(index.bodiesAt.get('b1:12,9')).toEqual(['U1']);
    expect(index.bodiesAt.get('b1:31,12')).toEqual(['R1']);
  });

  it('answers pin and group questions', () => {
    expect(pinPoint(index, { componentId: 'U1', pinNumber: 7 })).toEqual(hole('F16'));
    expect(pinDefinition(index, { componentId: 'U1', pinNumber: 7 })).toEqual({ number: 7, name: 'GND', role: 'ground' });
    expect(groupInfo(index, 'b1:rail-T+')?.kind).toBe('rail');
    expect(groupInfo(index, 'b9:rail-T+')).toBeUndefined();
    expect(propsOf(index.placedById.get('R1')!)).toEqual({ resistance: 220 });
    expect(componentLabel(index.placedById.get('U1')!)).toBe('74LS00 (U1)');
  });

  it('rejects unknown component definitions', () => {
    expect(() => indexCircuit(circuit([comp('X1', 'nope', 'A1')]))).toThrow('Unknown component definition');
  });
});

describe('getNodeState', () => {
  it('reports a component pin', () => {
    const s = getNodeState(c, hole('E10'))!;
    expect(s.name).toBe('E10');
    expect(s.groupId).toBe('b1:c10-top');
    expect(s.pin).toEqual({ componentId: 'U1', pinNumber: 14 });
    expect(s.occupied).toBe(true);
    expect(s.routable).toBe(false);
  });

  it('reports the IC body over the trench', () => {
    const s = getNodeState(c, pt(12, 9))!;
    expect(s.kind).toBe('surface');
    expect(s.blockedBy).toEqual(['U1']);
    expect(s.routable).toBe(false);
  });

  it('reports wire ends and wire passes', () => {
    expect(getNodeState(c, hole('A20'))!.wireEnds).toEqual(['w1']);
    const pass = getNodeState(c, hole('A22'))!;
    expect(pass.wirePasses).toEqual(['w1']);
    expect(pass.occupied).toBe(true);
    expect(pass.routable).toBe(true);
  });

  it('reports free holes and off-board points', () => {
    const free = getNodeState(c, hole('A40'))!;
    expect(free.occupied).toBe(false);
    expect(free.routable).toBe(true);
    expect(getNodeState(c, pt(0, 0))).toBeNull();
  });
});
```

- [ ] **Step 4: 確認測試失敗**

Run: `npx vitest run tests/circuit/nodeState.test.ts`
Expected: FAIL，找不到 `circuitIndex` 模組。

- [ ] **Step 5: 實作**

`src/core/circuit/circuitIndex.ts`：

```ts
import { getNode, nodeIdOf } from '../breadboard/naming';
import { getBoard } from '../breadboard/registry';
import type { Breadboard, BreadboardGroup, BreadboardNode } from '../../types/board';
import type { Circuit, PinRef } from '../../types/circuit';
import type { ComponentDefinition, ComponentInstance, ComponentProps, Footprint, PinDefinition } from '../../types/component';
import type { GridPoint } from '../../types/geometry';
import { resolveFootprint } from './footprint';
import { getComponentDefinition } from './library';

export interface PlacedComponent {
  instance: ComponentInstance;
  def: ComponentDefinition;
  footprint: Footprint;
}

export interface CircuitIndex {
  boards: Map<string, Breadboard>;
  placed: PlacedComponent[];
  placedById: Map<string, PlacedComponent>;
  /** 格點 ID → 插在這裡的元件腳（超過一個代表衝突）。 */
  pinsAt: Map<string, PinRef[]>;
  /** 格點 ID → 本體蓋住這裡的元件 ID。 */
  bodiesAt: Map<string, string[]>;
}

export function pushTo<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function indexCircuit(circuit: Circuit): CircuitIndex {
  const boards = new Map<string, Breadboard>(circuit.boards.map((b) => [b.id, getBoard(b.layoutId, b.id)]));
  const placed: PlacedComponent[] = [];
  const pinsAt = new Map<string, PinRef[]>();
  const bodiesAt = new Map<string, string[]>();
  for (const instance of circuit.components) {
    const def = getComponentDefinition(instance.defId);
    if (!def) throw new Error(`Unknown component definition: ${instance.defId}`);
    const footprint = resolveFootprint(instance, def);
    placed.push({ instance, def, footprint });
    for (const pin of footprint.pins) {
      pushTo(pinsAt, nodeIdOf(pin.point), { componentId: instance.id, pinNumber: pin.pinNumber });
    }
    for (const cell of footprint.blocked) pushTo(bodiesAt, nodeIdOf(cell), instance.id);
  }
  return { boards, placed, placedById: new Map(placed.map((p) => [p.instance.id, p])), pinsAt, bodiesAt };
}

export function nodeAt(index: CircuitIndex, p: GridPoint): BreadboardNode | undefined {
  const board = index.boards.get(p.boardId);
  return board ? getNode(board, p.x, p.y) : undefined;
}

export function groupOfPoint(index: CircuitIndex, p: GridPoint): string | null {
  return nodeAt(index, p)?.groupId ?? null;
}

export function groupInfo(index: CircuitIndex, groupId: string): BreadboardGroup | undefined {
  return index.boards.get(groupId.slice(0, groupId.indexOf(':')))?.groups[groupId];
}

export function pinPoint(index: CircuitIndex, ref: PinRef): GridPoint | undefined {
  return index.placedById.get(ref.componentId)?.footprint.pins.find((p) => p.pinNumber === ref.pinNumber)?.point;
}

export function pinDefinition(index: CircuitIndex, ref: PinRef): PinDefinition | undefined {
  return index.placedById.get(ref.componentId)?.def.pins.find((p) => p.number === ref.pinNumber);
}

export function propsOf(pc: PlacedComponent): ComponentProps {
  return { ...pc.def.defaultProps, ...pc.instance.props };
}

export function componentLabel(pc: PlacedComponent): string {
  return `${pc.def.name} (${pc.instance.id})`;
}
```

`src/core/circuit/nodeState.ts`：

```ts
import { nodeIdOf } from '../breadboard/naming';
import type { Circuit, NodeState } from '../../types/circuit';
import type { GridPoint } from '../../types/geometry';
import { indexCircuit, nodeAt } from './circuitIndex';

/** 需求文件第二章要求的節點狀態，依目前的電路即時計算。點不在板上時回傳 null。 */
export function getNodeState(circuit: Circuit, point: GridPoint): NodeState | null {
  const index = indexCircuit(circuit);
  const node = nodeAt(index, point);
  if (!node) return null;
  const pins = index.pinsAt.get(node.id) ?? [];
  const blockedBy = [...(index.bodiesAt.get(node.id) ?? [])];
  const wireEnds: string[] = [];
  const wirePasses: string[] = [];
  for (const w of circuit.wires) {
    if (nodeIdOf(w.start) === node.id || nodeIdOf(w.end) === node.id) wireEnds.push(w.id);
    else if (w.path.slice(1, -1).some((p) => nodeIdOf(p) === node.id)) wirePasses.push(w.id);
  }
  return {
    nodeId: node.id,
    kind: node.kind,
    name: node.name,
    groupId: node.groupId,
    pin: pins[0] ?? null,
    blockedBy,
    wireEnds,
    wirePasses,
    occupied: pins.length > 0 || blockedBy.length > 0 || wireEnds.length > 0 || wirePasses.length > 0,
    routable: pins.length === 0 && blockedBy.length === 0 && wireEnds.length === 0,
  };
}
```

- [ ] **Step 6: 確認測試通過**

Run: `npx vitest run tests/circuit/nodeState.test.ts`
Expected: PASS（7 tests）

Run: `npm run typecheck`
Expected: 無錯誤。

- [ ] **Step 7: Commit**

```bash
git add src/types/circuit.ts src/core/circuit/circuitIndex.ts src/core/circuit/nodeState.ts tests/fixtures/build.ts tests/circuit/nodeState.test.ts
git commit -m "feat: add circuit index and node state"
```

---

### Task 5: Net 分析

**Files:**
- Create: `src/core/circuit/unionFind.ts`, `src/core/circuit/nets.ts`
- Test: `tests/circuit/nets.test.ts`

**Interfaces:**
- Consumes: `CircuitIndex`、`indexCircuit`、`groupOfPoint`、`groupInfo`、`pinPoint`、`pinDefinition`（Task 4）
- Produces:
  - `class UnionFind { find(x: string): string; union(a: string, b: string): void }`（根一律取字串較小者）
  - `compareIds(a: string, b: string): number`、`comparePinRefs(a: PinRef, b: PinRef): number`、`pinKey(ref: PinRef): string`（`"U1#14"`）
  - `extractNets(circuit: Circuit): Net[]`
  - `extractNetsWith(index: CircuitIndex, wires: Wire[]): Net[]`（用指定的導線分析，佈線與評分會用到）
  - `terminalGroupIds(net: Net, index: CircuitIndex): string[]`（有腳的群組 + 該 Net 的電源軌，已排序）
  - `terminalClusters(net: Net, index: CircuitIndex): string[][]`（把元件內部已導通的終端群組併成一簇，例如 Push Button 跨凹槽的兩腳；同一簇內不需要導線。每簇內與簇之間都已排序）
  - `netByPin(nets: Net[]): Map<string, Net>`（key 為 `pinKey`）

- [ ] **Step 1: 寫失敗的測試**

`tests/circuit/nets.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { indexCircuit } from '../../src/core/circuit/circuitIndex';
import { extractNets, netByPin, terminalClusters, terminalGroupIds } from '../../src/core/circuit/nets';
import { UnionFind } from '../../src/core/circuit/unionFind';
import { circuit, comp, wire } from '../fixtures/build';

describe('UnionFind', () => {
  it('merges sets and always keeps the smallest id as root', () => {
    const uf = new UnionFind();
    uf.union('b', 'c');
    uf.union('a', 'c');
    expect(uf.find('c')).toBe('a');
    expect(uf.find('b')).toBe('a');
    expect(uf.find('z')).toBe('z');
  });
});

describe('extractNets', () => {
  it('only connects wire endpoints, not the holes a wire passes over', () => {
    const c = circuit(
      [comp('R1', 'resistor', 'C10'), comp('R2', 'resistor', 'C20'), comp('D1', 'led', 'A16')],
      [wire('w1', 'A14', 'A20')],
    );
    const nets = extractNets(c);
    const joined = nets.find((n) => n.pins.some((p) => p.componentId === 'R1' && p.pinNumber === 2))!;
    expect(joined.pins).toEqual([
      { componentId: 'R1', pinNumber: 2 },
      { componentId: 'R2', pinNumber: 1 },
    ]);
    expect(joined.groupIds).toEqual(['b1:c14-top', 'b1:c20-top']);
    expect(nets.find((n) => n.pins.some((p) => p.componentId === 'D1' && p.pinNumber === 1))!.pins).toHaveLength(1);
  });

  it('keeps the two leads of a resistor apart but merges push-button internals', () => {
    const nets = extractNets(circuit([comp('R1', 'resistor', 'A30'), comp('SW1', 'pushbutton', 'F4')]));
    expect(nets.filter((n) => n.pins.some((p) => p.componentId === 'R1'))).toHaveLength(2);
    const sw = nets.filter((n) => n.pins.some((p) => p.componentId === 'SW1'));
    expect(sw).toHaveLength(2);
    expect(sw[0].groupIds).toEqual(['b1:c4-bot', 'b1:c4-top']);
    expect(sw[0].pins).toEqual([
      { componentId: 'SW1', pinNumber: 1 },
      { componentId: 'SW1', pinNumber: 2 },
    ]);
  });

  it('names power, ground and signal nets in a stable order', () => {
    const c = circuit(
      [comp('V1', 'vcc', 'T+5'), comp('G1', 'gnd', 'B-5'), comp('V2', 'vcc', 'A40'), comp('R1', 'resistor', 'A10')],
      [wire('w1', 'T+9', 'C10')],
    );
    const nets = extractNets(c);
    expect(nets.map((n) => [n.id, n.kind])).toEqual([
      ['GND', 'ground'],
      ['VCC', 'power'],
      ['NET_1', 'signal'],
      ['VCC_2', 'power'],
    ]);
    expect(extractNets(c)).toEqual(nets);
    expect(netByPin(nets).get('R1#1')!.id).toBe('VCC');
  });

  it('ignores pins that are not on a hole', () => {
    expect(extractNets(circuit([comp('D1', 'led', [12, 9])]))).toEqual([]);
  });

  it('keeps a pin-less power rail as a terminal group, but not an empty column', () => {
    const c = circuit([comp('V1', 'vcc', 'T+5')], [wire('w1', 'T+7', 'B+7'), wire('w2', 'T+9', 'A30')]);
    const vcc = extractNets(c).find((n) => n.id === 'VCC')!;
    expect(vcc.groupIds).toEqual(['b1:c30-top', 'b1:rail-B+', 'b1:rail-T+']);
    expect(terminalGroupIds(vcc, indexCircuit(c))).toEqual(['b1:rail-B+', 'b1:rail-T+']);
  });

  it('clusters terminal groups that a component already connects internally', () => {
    const c = circuit([comp('G1', 'gnd', 'T-3'), comp('SW1', 'pushbutton', 'F4')], [wire('w1', 'T-4', 'A4')]);
    const index = indexCircuit(c);
    const gnd = extractNets(c).find((n) => n.id === 'GND')!;
    expect(terminalGroupIds(gnd, index)).toEqual(['b1:c4-bot', 'b1:c4-top', 'b1:rail-T-']);
    expect(terminalClusters(gnd, index)).toEqual([['b1:c4-bot', 'b1:c4-top'], ['b1:rail-T-']]);
  });
});
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run tests/circuit/nets.test.ts`
Expected: FAIL，找不到 `unionFind` 模組。

- [ ] **Step 3: 實作**

`src/core/circuit/unionFind.ts`：

```ts
/** 字串聯集–查找。根一律是集合中字串最小者，結果與合併順序無關。 */
export class UnionFind {
  private readonly parent = new Map<string, string>();

  find(x: string): string {
    const p = this.parent.get(x);
    if (p === undefined) {
      this.parent.set(x, x);
      return x;
    }
    if (p === x) return x;
    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    if (ra < rb) this.parent.set(rb, ra);
    else this.parent.set(ra, rb);
  }
}
```

`src/core/circuit/nets.ts`：

```ts
import type { Circuit, Net, PinRef, Wire } from '../../types/circuit';
import { groupInfo, groupOfPoint, indexCircuit, pinDefinition, pinPoint, type CircuitIndex } from './circuitIndex';
import { UnionFind } from './unionFind';

export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function comparePinRefs(a: PinRef, b: PinRef): number {
  return compareIds(a.componentId, b.componentId) || a.pinNumber - b.pinNumber;
}

export function pinKey(ref: PinRef): string {
  return `${ref.componentId}#${ref.pinNumber}`;
}

export function extractNets(circuit: Circuit): Net[] {
  return extractNetsWith(indexCircuit(circuit), circuit.wires);
}

/** 用指定的導線分析 Net。導線只有兩個端點導電。 */
export function extractNetsWith(index: CircuitIndex, wires: Wire[]): Net[] {
  const uf = new UnionFind();
  const seen = new Set<string>();
  const touch = (groupId: string | null): string | null => {
    if (groupId) seen.add(groupId);
    return groupId;
  };

  for (const w of wires) {
    const a = touch(groupOfPoint(index, w.start));
    const b = touch(groupOfPoint(index, w.end));
    if (a && b) uf.union(a, b);
  }

  const pinGroups: Array<{ ref: PinRef; groupId: string }> = [];
  for (const pc of index.placed) {
    for (const pin of pc.footprint.pins) {
      const groupId = touch(groupOfPoint(index, pin.point));
      if (groupId) pinGroups.push({ ref: { componentId: pc.instance.id, pinNumber: pin.pinNumber }, groupId });
    }
  }
  const groupOfPin = new Map(pinGroups.map((p) => [pinKey(p.ref), p.groupId]));
  for (const pc of index.placed) {
    for (const set of pc.def.internalConnections) {
      const groups = set
        .map((n) => groupOfPin.get(pinKey({ componentId: pc.instance.id, pinNumber: n })))
        .filter((g): g is string => g !== undefined);
      for (let i = 1; i < groups.length; i++) uf.union(groups[0], groups[i]);
    }
  }

  const buckets = new Map<string, { groupIds: string[]; pins: PinRef[] }>();
  const bucket = (root: string) => {
    let b = buckets.get(root);
    if (!b) {
      b = { groupIds: [], pins: [] };
      buckets.set(root, b);
    }
    return b;
  };
  for (const groupId of [...seen].sort(compareIds)) bucket(uf.find(groupId)).groupIds.push(groupId);
  for (const { ref, groupId } of pinGroups) bucket(uf.find(groupId)).pins.push(ref);

  const raw = [...buckets.values()].filter((b) => b.pins.length > 0);
  for (const b of raw) b.pins.sort(comparePinRefs);
  raw.sort((a, b) => comparePinRefs(a.pins[0], b.pins[0]));

  let power = 0;
  let ground = 0;
  let signal = 0;
  return raw.map((b) => {
    const roles = b.pins.map((ref) => pinDefinition(index, ref)?.role);
    const kind: Net['kind'] = roles.includes('vcc-source') ? 'power' : roles.includes('gnd-source') ? 'ground' : 'signal';
    let name: string;
    if (kind === 'power') name = ++power === 1 ? 'VCC' : `VCC_${power}`;
    else if (kind === 'ground') name = ++ground === 1 ? 'GND' : `GND_${ground}`;
    else name = `NET_${++signal}`;
    return { id: name, name, kind, groupIds: b.groupIds, pins: b.pins };
  });
}

/** 這個 Net 需要用導線連起來的群組：有元件腳的群組，加上屬於這個 Net 的電源軌。 */
export function terminalGroupIds(net: Net, index: CircuitIndex): string[] {
  const set = new Set<string>();
  for (const ref of net.pins) {
    const p = pinPoint(index, ref);
    const g = p ? groupOfPoint(index, p) : null;
    if (g) set.add(g);
  }
  for (const g of net.groupIds) if (groupInfo(index, g)?.kind === 'rail') set.add(g);
  return [...set].sort(compareIds);
}

/** 把終端群組依元件內部導通（例如 Push Button 跨凹槽的兩腳）分簇；同一簇內不需要導線。 */
export function terminalClusters(net: Net, index: CircuitIndex): string[][] {
  const groups = terminalGroupIds(net, index);
  const inNet = new Set(groups);
  const uf = new UnionFind();
  for (const pc of index.placed) {
    for (const set of pc.def.internalConnections) {
      const linked = set
        .map((n) => pinPoint(index, { componentId: pc.instance.id, pinNumber: n }))
        .map((p) => (p ? groupOfPoint(index, p) : null))
        .filter((g): g is string => g !== null && inNet.has(g));
      for (let i = 1; i < linked.length; i++) uf.union(linked[0], linked[i]);
    }
  }
  const clusters = new Map<string, string[]>();
  for (const g of groups) {
    const root = uf.find(g);
    const list = clusters.get(root);
    if (list) list.push(g);
    else clusters.set(root, [g]);
  }
  return [...clusters.values()].sort((a, b) => compareIds(a[0], b[0]));
}

export function netByPin(nets: Net[]): Map<string, Net> {
  const map = new Map<string, Net>();
  for (const net of nets) for (const ref of net.pins) map.set(pinKey(ref), net);
  return map;
}
```

- [ ] **Step 4: 確認測試通過**

Run: `npx vitest run tests/circuit/nets.test.ts`
Expected: PASS（7 tests）

Run: `npm run typecheck`
Expected: 無錯誤。

- [ ] **Step 5: Commit**

```bash
git add src/core/circuit/unionFind.ts src/core/circuit/nets.ts tests/circuit/nets.test.ts
git commit -m "feat: extract electrical nets with union-find"
```

---

### Task 6: 導線幾何工具

**Files:**
- Create: `src/core/circuit/wireGeometry.ts`
- Test: `tests/circuit/wireGeometry.test.ts`

**Interfaces:**
- Consumes: `nodeIdOf`（Task 1）、`Wire`（Task 4）
- Produces:
  - `stepDirection(a: GridPoint, b: GridPoint): Direction | null`（不是單位正交步、或跨板時回傳 null）
  - `type PathIssue = 'TOO_SHORT' | 'NOT_ORTHOGONAL_STEP' | 'ENDPOINT_MISMATCH' | 'SELF_INTERSECT' | 'OUT_OF_BOARD'`
  - `pathIssues(wire: Wire, isOnBoard: (p: GridPoint) => boolean): PathIssue[]`
  - `segments(path: GridPoint[]): { dir: Direction; length: number }[]`
  - `countBends(path): number`、`countShortJogs(path): number`（中間段、長度 1）
  - `type UsageKind = 'end' | 'H' | 'V' | 'turn'`、`wireNodeUsages(wire): { wireId; nodeId; kind }[]`
  - `analyzeWireInteractions(wires: Wire[]): { overlaps: WireConflict[]; crossings: WireConflict[] }`，`WireConflict = { nodeId: string; wireIds: [string, string] }`（wireIds 已排序；結果依 nodeId 排序）

- [ ] **Step 1: 寫失敗的測試**

`tests/circuit/wireGeometry.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
  analyzeWireInteractions,
  countBends,
  countShortJogs,
  pathIssues,
  segments,
  stepDirection,
  wireNodeUsages,
} from '../../src/core/circuit/wireGeometry';
import type { Wire } from '../../src/types/circuit';
import type { GridPoint } from '../../src/types/geometry';
import { pt, wire } from '../fixtures/build';

const onBoard = (p: GridPoint) => p.x >= 1 && p.x <= 63 && p.y >= 1 && p.y <= 18;

function raw(id: string, points: Array<[number, number]>): Wire {
  const path = points.map(([x, y]) => pt(x, y));
  return { id, color: '#888888', source: 'manual', start: path[0], end: path[path.length - 1], path };
}

describe('stepDirection', () => {
  it('only accepts unit orthogonal steps on the same board', () => {
    expect(stepDirection(pt(5, 5), pt(6, 5))).toBe('E');
    expect(stepDirection(pt(5, 5), pt(4, 5))).toBe('W');
    expect(stepDirection(pt(5, 5), pt(5, 6))).toBe('S');
    expect(stepDirection(pt(5, 5), pt(5, 4))).toBe('N');
    expect(stepDirection(pt(5, 5), pt(6, 6))).toBeNull();
    expect(stepDirection(pt(5, 5), pt(7, 5))).toBeNull();
    expect(stepDirection(pt(5, 5), { boardId: 'b2', x: 6, y: 5 })).toBeNull();
  });
});

describe('pathIssues', () => {
  it('accepts a clean L-shaped wire', () => {
    expect(pathIssues(wire('w', 'A10', 'C20'), onBoard)).toEqual([]);
  });

  it('flags each kind of broken path', () => {
    expect(pathIssues(raw('w', [[5, 5]]), onBoard)).toContain('TOO_SHORT');
    expect(pathIssues(raw('w', [[5, 5], [6, 6]]), onBoard)).toContain('NOT_ORTHOGONAL_STEP');
    expect(pathIssues(raw('w', [[5, 5], [6, 5], [5, 5]]), onBoard)).toContain('SELF_INTERSECT');
    expect(pathIssues(raw('w', [[1, 5], [0, 5]]), onBoard)).toContain('OUT_OF_BOARD');
    expect(pathIssues({ ...raw('w', [[5, 5], [6, 5]]), end: pt(9, 9) }, onBoard)).toContain('ENDPOINT_MISMATCH');
  });
});

describe('segments, bends and short jogs', () => {
  it('measures straight, L and Z shapes', () => {
    const straight = raw('a', [[1, 4], [2, 4], [3, 4]]);
    const l = raw('b', [[1, 4], [2, 4], [2, 5], [2, 6]]);
    const z = raw('c', [[1, 4], [2, 4], [2, 5], [3, 5], [4, 5]]);
    const zLong = raw('d', [[1, 4], [2, 4], [2, 5], [2, 6], [3, 6]]);
    expect(segments(l.path)).toEqual([
      { dir: 'E', length: 1 },
      { dir: 'S', length: 2 },
    ]);
    expect([countBends(straight.path), countShortJogs(straight.path)]).toEqual([0, 0]);
    expect([countBends(l.path), countShortJogs(l.path)]).toEqual([1, 0]);
    expect([countBends(z.path), countShortJogs(z.path)]).toEqual([2, 1]);
    expect([countBends(zLong.path), countShortJogs(zLong.path)]).toEqual([2, 0]);
  });
});

describe('wireNodeUsages', () => {
  it('labels ends, straight runs and turns', () => {
    const l = raw('w', [[1, 4], [2, 4], [3, 4], [3, 5], [3, 6]]);
    expect(wireNodeUsages(l).map((u) => u.kind)).toEqual(['end', 'H', 'turn', 'V', 'end']);
  });
});

describe('analyzeWireInteractions', () => {
  const horizontal = raw('h', [[1, 5], [2, 5], [3, 5], [4, 5], [5, 5]]);

  it('counts a perpendicular pass-through as a crossing', () => {
    const vertical = raw('v', [[3, 3], [3, 4], [3, 5], [3, 6], [3, 7]]);
    const result = analyzeWireInteractions([horizontal, vertical]);
    expect(result.crossings).toEqual([{ nodeId: 'b1:3,5', wireIds: ['h', 'v'] }]);
    expect(result.overlaps).toEqual([]);
  });

  it('counts a shared segment as overlaps', () => {
    const parallel = raw('p', [[2, 5], [3, 5], [4, 5]]);
    expect(analyzeWireInteractions([horizontal, parallel]).overlaps.length).toBeGreaterThan(0);
  });

  it('counts an endpoint touching another wire as an overlap', () => {
    const ending = raw('e', [[3, 3], [3, 4], [3, 5]]);
    expect(analyzeWireInteractions([horizontal, ending]).overlaps).toEqual([{ nodeId: 'b1:3,5', wireIds: ['e', 'h'] }]);
  });
});
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run tests/circuit/wireGeometry.test.ts`
Expected: FAIL，找不到 `wireGeometry` 模組。

- [ ] **Step 3: 實作**

`src/core/circuit/wireGeometry.ts`：

```ts
import { nodeIdOf } from '../breadboard/naming';
import type { Wire } from '../../types/circuit';
import type { Direction, GridPoint } from '../../types/geometry';

export function stepDirection(a: GridPoint, b: GridPoint): Direction | null {
  if (a.boardId !== b.boardId) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 1 && dy === 0) return 'E';
  if (dx === -1 && dy === 0) return 'W';
  if (dx === 0 && dy === 1) return 'S';
  if (dx === 0 && dy === -1) return 'N';
  return null;
}

export type PathIssue = 'TOO_SHORT' | 'NOT_ORTHOGONAL_STEP' | 'ENDPOINT_MISMATCH' | 'SELF_INTERSECT' | 'OUT_OF_BOARD';

export function pathIssues(wire: Wire, isOnBoard: (p: GridPoint) => boolean): PathIssue[] {
  const issues = new Set<PathIssue>();
  const path = wire.path;
  if (path.length < 2) issues.add('TOO_SHORT');
  for (let i = 1; i < path.length; i++) if (!stepDirection(path[i - 1], path[i])) issues.add('NOT_ORTHOGONAL_STEP');
  if (
    path.length > 0 &&
    (nodeIdOf(path[0]) !== nodeIdOf(wire.start) || nodeIdOf(path[path.length - 1]) !== nodeIdOf(wire.end))
  ) {
    issues.add('ENDPOINT_MISMATCH');
  }
  if (new Set(path.map(nodeIdOf)).size !== path.length) issues.add('SELF_INTERSECT');
  if (path.some((p) => !isOnBoard(p))) issues.add('OUT_OF_BOARD');
  return [...issues];
}

export function segments(path: GridPoint[]): Array<{ dir: Direction; length: number }> {
  const out: Array<{ dir: Direction; length: number }> = [];
  for (let i = 1; i < path.length; i++) {
    const dir = stepDirection(path[i - 1], path[i]);
    if (!dir) continue;
    const last = out[out.length - 1];
    if (last && last.dir === dir) last.length++;
    else out.push({ dir, length: 1 });
  }
  return out;
}

export function countBends(path: GridPoint[]): number {
  return Math.max(0, segments(path).length - 1);
}

/** 夾在兩個轉彎之間、只有 1 格長的小折角（實際上很難把線折出來）。 */
export function countShortJogs(path: GridPoint[]): number {
  const segs = segments(path);
  let count = 0;
  for (let i = 1; i < segs.length - 1; i++) if (segs[i].length === 1) count++;
  return count;
}

export type UsageKind = 'end' | 'H' | 'V' | 'turn';

export interface NodeUsage {
  wireId: string;
  nodeId: string;
  kind: UsageKind;
}

export function wireNodeUsages(wire: Wire): NodeUsage[] {
  const path = wire.path;
  return path.map((p, i) => {
    let kind: UsageKind = 'end';
    if (i > 0 && i < path.length - 1) {
      const into = stepDirection(path[i - 1], p);
      const out = stepDirection(p, path[i + 1]);
      if (into && into === out) kind = into === 'E' || into === 'W' ? 'H' : 'V';
      else kind = 'turn';
    }
    return { wireId: wire.id, nodeId: nodeIdOf(p), kind };
  });
}

export interface WireConflict {
  nodeId: string;
  wireIds: [string, string];
}

/** 同一格點恰好兩條線、一橫一直地直穿才算交叉；其他任何共用都算重疊。 */
export function analyzeWireInteractions(wires: Wire[]): { overlaps: WireConflict[]; crossings: WireConflict[] } {
  const byNode = new Map<string, NodeUsage[]>();
  for (const w of wires) {
    for (const usage of wireNodeUsages(w)) {
      const list = byNode.get(usage.nodeId);
      if (list) list.push(usage);
      else byNode.set(usage.nodeId, [usage]);
    }
  }
  const overlaps: WireConflict[] = [];
  const crossings: WireConflict[] = [];
  const nodeIds = [...byNode.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const nodeId of nodeIds) {
    const usages = byNode.get(nodeId)!;
    for (let i = 0; i < usages.length; i++) {
      for (let j = i + 1; j < usages.length; j++) {
        const a = usages[i];
        const b = usages[j];
        if (a.wireId === b.wireId) continue;
        const wireIds: [string, string] = a.wireId < b.wireId ? [a.wireId, b.wireId] : [b.wireId, a.wireId];
        const perpendicular = (a.kind === 'H' && b.kind === 'V') || (a.kind === 'V' && b.kind === 'H');
        (perpendicular && usages.length === 2 ? crossings : overlaps).push({ nodeId, wireIds });
      }
    }
  }
  return { overlaps, crossings };
}
```

- [ ] **Step 4: 確認測試通過**

Run: `npx vitest run tests/circuit/wireGeometry.test.ts`
Expected: PASS（8 tests）

Run: `npm run typecheck`
Expected: 無錯誤。

- [ ] **Step 5: Commit**

```bash
git add src/core/circuit/wireGeometry.ts tests/circuit/wireGeometry.test.ts
git commit -m "feat: add wire geometry helpers"
```

---

### Task 7: 電路檢查（Check Circuit）

**Files:**
- Create: `src/core/circuit/validate.ts`
- Test: `tests/circuit/validate.test.ts`

**Interfaces:**
- Consumes: `indexCircuit`、`nodeAt`、`groupOfPoint`、`pinDefinition`、`pinPoint`、`propsOf`、`componentLabel`、`pushTo`（Task 4）；`effectiveSpan`（Task 2）；`extractNetsWith`、`netByPin`、`pinKey`、`compareIds`（Task 5）；`pathIssues`、`analyzeWireInteractions`（Task 6）；`nodeIdOf`、`parseNodeId`（Task 1）
- Produces: `validateCircuit(circuit: Circuit): CircuitError[]`（沒有任何 error/warning 時只回傳一筆 `CIRCUIT_VALID`）

- [ ] **Step 1: 寫失敗的測試**

`tests/circuit/validate.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { validateCircuit } from '../../src/core/circuit/validate';
import type { Circuit } from '../../src/types/circuit';
import { circuit, comp, pt, wire } from '../fixtures/build';

const codes = (c: Circuit) => validateCircuit(c).map((e) => e.code);

/** VCC → R1 → LED → GND，接線乾淨。 */
function ledCircuit(): Circuit {
  return circuit(
    [comp('V1', 'vcc', 'T+5'), comp('G1', 'gnd', 'B-5'), comp('R1', 'resistor', 'C20'), comp('D1', 'led', 'C30')],
    [wire('w1', 'T+21', [21, 3], 'A20'), wire('w2', 'B24', 'B30'), wire('w3', 'E31', 'B-31')],
  );
}

const powered = () => [comp('V1', 'vcc', 'T+5'), comp('G1', 'gnd', 'B-5')];

describe('validateCircuit', () => {
  it('accepts a clean LED circuit', () => {
    expect(validateCircuit(ledCircuit())).toEqual([
      expect.objectContaining({ code: 'CIRCUIT_VALID', severity: 'info', message: '✓ Circuit Valid：電路檢查通過' }),
    ]);
  });

  it('accepts an empty circuit', () => {
    expect(codes(circuit([]))).toEqual(['CIRCUIT_VALID']);
  });

  it('flags pins off holes, parts past the board edge and unknown boards without throwing', () => {
    expect(codes(circuit([comp('D1', 'led', [12, 9])]))).toContain('PLACEMENT_INVALID');
    expect(codes(circuit([comp('R1', 'resistor', 'A62')]))).toContain('PLACEMENT_INVALID');
    expect(codes(circuit([{ ...comp('R1', 'resistor', 'A10'), boardId: 'b9' }]))).toContain('PLACEMENT_INVALID');
  });

  it('flags two pins in one hole', () => {
    expect(codes(circuit([comp('D1', 'led', 'A10'), comp('D2', 'led', 'A10')]))).toContain('PIN_COLLISION');
  });

  it('flags overlapping bodies', () => {
    expect(codes(circuit([comp('R1', 'resistor', 'A20'), comp('D1', 'led', 'A22')]))).toContain('BODY_OVERLAP');
  });

  it('flags broken, blocked and overlapping wires', () => {
    const base = ledCircuit();
    const diagonal = { ...wire('wx', 'A40', 'A41'), path: [pt(40, 4), pt(41, 5)], end: pt(41, 5) };
    expect(codes({ ...base, wires: [...base.wires, diagonal] })).toContain('WIRE_PATH_INVALID');
    expect(codes({ ...base, wires: [...base.wires, wire('wy', 'A40', [40, 9])] })).toContain('WIRE_ENDPOINT_INVALID');
    expect(codes({ ...base, wires: [...base.wires, wire('wz', 'A18', 'A26')] })).toContain('WIRE_THROUGH_OBSTACLE');
    expect(codes({ ...base, wires: [...base.wires, wire('wo', 'B23', 'B27')] })).toContain('WIRE_OVERLAP');
  });

  it('flags a short between VCC and GND', () => {
    expect(codes(circuit([comp('V1', 'vcc', 'T+5'), comp('G1', 'gnd', 'T+9')]))).toContain('SHORT_CIRCUIT');
  });

  it('flags an IC rotated so that its pins share a strip', () => {
    expect(codes(circuit([...powered(), comp('U1', '74LS00', 'A30', { rotation: 90 })]))).toContain('IC_PIN_SHORT');
  });

  it('flags an IC whose VCC and GND pins are not powered', () => {
    const errors = validateCircuit(circuit([...powered(), comp('U1', '74LS00', 'F10')]));
    expect(errors.filter((e) => e.code === 'IC_POWER_MISSING').map((e) => e.message)).toEqual([
      '74LS00 (U1) 第 7 腳 GND 未連接',
      '74LS00 (U1) 第 14 腳 VCC 未連接',
    ]);
  });

  it('flags outputs wired together and outputs wired to a supply', () => {
    const parts = [...powered(), comp('U1', '74LS04', 'F10')];
    expect(codes(circuit(parts, [wire('w1', 'J11', 'J20'), wire('w2', 'I13', 'I20')]))).toContain('OUTPUT_CONFLICT');
    expect(codes(circuit(parts, [wire('w1', 'J11', [11, 16], 'B-11')]))).toContain('OUTPUT_CONFLICT');
  });

  it('flags a circuit with parts but no power source', () => {
    expect(codes(circuit([comp('R1', 'resistor', 'A10')]))).toContain('NO_POWER_SOURCE');
  });

  it('warns about floating IC inputs', () => {
    const errors = validateCircuit(circuit([...powered(), comp('U1', '74LS04', 'F10')]));
    expect(errors.find((e) => e.code === 'INPUT_FLOATING')).toMatchObject({
      severity: 'warning',
      message: expect.stringContaining('第 1 腳（1A）未連接'),
    });
  });

  it('warns about unconnected passive pins', () => {
    expect(codes(circuit([comp('V1', 'vcc', 'T+5'), comp('R1', 'resistor', 'A10')]))).toContain('PIN_UNCONNECTED');
  });

  it('warns about a reversed LED without a resistor', () => {
    const c = circuit(
      [...powered(), comp('D1', 'led', 'C30')],
      [wire('w1', 'E30', 'B-30'), wire('w2', 'A31', [31, 3], 'T+31')],
    );
    expect(codes(c)).toEqual(expect.arrayContaining(['LED_REVERSED', 'LED_NO_RESISTOR']));
  });

  it('warns about a resistor whose two leads share a strip', () => {
    expect(codes(circuit([comp('V1', 'vcc', 'T+5'), comp('R1', 'resistor', 'A20', { rotation: 90, span: 1 })]))).toContain(
      'COMPONENT_SHORTED',
    );
  });
});
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run tests/circuit/validate.test.ts`
Expected: FAIL，找不到 `validate` 模組。

- [ ] **Step 3: 實作**

`src/core/circuit/validate.ts`：

```ts
import { nodeIdOf, parseNodeId } from '../breadboard/naming';
import type { Circuit, CircuitError, Net, PinRef } from '../../types/circuit';
import type { PinRole } from '../../types/component';
import type { GridPoint } from '../../types/geometry';
import {
  componentLabel,
  groupOfPoint,
  indexCircuit,
  nodeAt,
  pinDefinition,
  pinPoint,
  propsOf,
  pushTo,
  type CircuitIndex,
  type PlacedComponent,
} from './circuitIndex';
import { effectiveSpan } from './footprint';
import { compareIds, extractNetsWith, netByPin, pinKey } from './nets';
import { analyzeWireInteractions, pathIssues } from './wireGeometry';

type Report = (error: Pick<CircuitError, 'code' | 'severity' | 'message'> & Partial<CircuitError>) => void;

export function validateCircuit(circuit: Circuit): CircuitError[] {
  const index = indexCircuit(circuit);
  const errors: CircuitError[] = [];
  const report: Report = (e) => errors.push({ points: [], componentIds: [], wireIds: [], netIds: [], ...e });

  checkPlacement(index, report);
  checkWires(circuit, index, report);
  checkElectrical(index, extractNetsWith(index, circuit.wires), report);

  if (errors.length === 0) report({ code: 'CIRCUIT_VALID', severity: 'info', message: '✓ Circuit Valid：電路檢查通過' });
  return errors;
}

function holeLabel(index: CircuitIndex, p: GridPoint): string {
  return nodeAt(index, p)?.name ?? `(${p.x}, ${p.y})`;
}

function sortedEntries<T>(map: Map<string, T>): Array<[string, T]> {
  return [...map.entries()].sort(([a], [b]) => compareIds(a, b));
}

function checkPlacement(index: CircuitIndex, report: Report): void {
  for (const pc of index.placed) {
    const offHole = pc.footprint.pins.filter((p) => nodeAt(index, p.point)?.kind !== 'hole');
    const pkg = pc.def.package;
    const spanTooSmall = pkg.type === 'two-lead' && effectiveSpan(pc.instance, pc.def) < pkg.minSpan;
    if (offHole.length > 0 || spanTooSmall) {
      report({
        code: 'PLACEMENT_INVALID',
        severity: 'error',
        message: `${componentLabel(pc)} 的位置不合法：${spanTooSmall ? '兩腳距離太小' : '有腳沒有插在孔上'}`,
        points: offHole.map((p) => p.point),
        componentIds: [pc.instance.id],
      });
    }
  }

  for (const [nodeId, pins] of sortedEntries(index.pinsAt)) {
    if (pins.length < 2) continue;
    const point = parseNodeId(nodeId);
    report({
      code: 'PIN_COLLISION',
      severity: 'error',
      message: `${holeLabel(index, point)} 同時插了 ${pins.length} 隻腳`,
      points: [point],
      componentIds: [...new Set(pins.map((p) => p.componentId))].sort(compareIds),
    });
  }

  const reported = new Set<string>();
  for (const [nodeId, owners] of sortedEntries(index.bodiesAt)) {
    const involved = new Set(owners);
    for (const pin of index.pinsAt.get(nodeId) ?? []) involved.add(pin.componentId);
    if (involved.size < 2) continue;
    const ids = [...involved].sort(compareIds);
    const key = ids.join('|');
    if (reported.has(key)) continue;
    reported.add(key);
    report({
      code: 'BODY_OVERLAP',
      severity: 'error',
      message: `${ids.join('、')} 的元件本體重疊`,
      points: [parseNodeId(nodeId)],
      componentIds: ids,
    });
  }
}

function checkWires(circuit: Circuit, index: CircuitIndex, report: Report): void {
  const isOnBoard = (p: GridPoint) => nodeAt(index, p) !== undefined;
  const endsAt = new Map<string, string[]>();
  for (const w of circuit.wires) for (const p of [w.start, w.end]) pushTo(endsAt, nodeIdOf(p), w.id);
  const sharedEndReported = new Set<string>();

  for (const w of circuit.wires) {
    const issues = pathIssues(w, isOnBoard);
    if (issues.length > 0) {
      report({
        code: 'WIRE_PATH_INVALID',
        severity: 'error',
        message: `導線 ${w.id} 的路徑不合法（${issues.join(', ')}）`,
        wireIds: [w.id],
        points: [w.start, w.end],
      });
    }

    for (const end of [w.start, w.end]) {
      const node = nodeAt(index, end);
      const id = nodeIdOf(end);
      if (!node || node.kind !== 'hole') {
        report({ code: 'WIRE_ENDPOINT_INVALID', severity: 'error', message: `導線 ${w.id} 的端點沒有接在有效的孔上`, wireIds: [w.id], points: [end] });
      } else if (index.pinsAt.has(id)) {
        report({
          code: 'PIN_COLLISION',
          severity: 'error',
          message: `${node.name} 同時插了元件腳和導線 ${w.id}`,
          wireIds: [w.id],
          points: [end],
          componentIds: index.pinsAt.get(id)!.map((p) => p.componentId),
        });
      } else if (index.bodiesAt.has(id)) {
        report({
          code: 'WIRE_ENDPOINT_INVALID',
          severity: 'error',
          message: `導線 ${w.id} 的端點 ${node.name} 被元件本體擋住`,
          wireIds: [w.id],
          points: [end],
          componentIds: index.bodiesAt.get(id)!,
        });
      } else if ((endsAt.get(id)?.length ?? 0) > 1 && !sharedEndReported.has(id)) {
        sharedEndReported.add(id);
        report({ code: 'WIRE_ENDPOINT_INVALID', severity: 'error', message: `${node.name} 同時插了多條導線`, wireIds: endsAt.get(id)!, points: [end] });
      }
    }

    const blockedAt = w.path.slice(1, -1).find((p) => {
      const id = nodeIdOf(p);
      return index.pinsAt.has(id) || index.bodiesAt.has(id) || (endsAt.get(id) ?? []).some((other) => other !== w.id);
    });
    if (blockedAt) {
      report({
        code: 'WIRE_THROUGH_OBSTACLE',
        severity: 'error',
        message: `導線 ${w.id} 穿過了元件或其他導線的端點（${holeLabel(index, blockedAt)}）`,
        wireIds: [w.id],
        points: [blockedAt],
      });
    }
  }

  const byPair = new Map<string, { wireIds: string[]; points: GridPoint[] }>();
  for (const o of analyzeWireInteractions(circuit.wires).overlaps) {
    const key = JSON.stringify(o.wireIds);
    const entry = byPair.get(key) ?? { wireIds: [...o.wireIds], points: [] };
    entry.points.push(parseNodeId(o.nodeId));
    byPair.set(key, entry);
  }
  for (const { wireIds, points } of byPair.values()) {
    report({ code: 'WIRE_OVERLAP', severity: 'error', message: `導線 ${wireIds[0]} 與 ${wireIds[1]} 重疊`, wireIds, points });
  }
}

function checkElectrical(index: CircuitIndex, nets: Net[], report: Report): void {
  const byPin = netByPin(nets);
  const role = (ref: PinRef): PinRole | undefined => pinDefinition(index, ref)?.role;
  const netHas = (net: Net | undefined, wanted: PinRole) => net !== undefined && net.pins.some((r) => role(r) === wanted);
  const pointsOf = (refs: PinRef[]) => refs.map((r) => pinPoint(index, r)).filter((p): p is GridPoint => p !== undefined);
  const componentsOf = (refs: PinRef[]) => [...new Set(refs.map((r) => r.componentId))].sort(compareIds);
  const refOf = (pc: PlacedComponent, pinNumber: number): PinRef => ({ componentId: pc.instance.id, pinNumber });

  const hasSource = index.placed.some((pc) => pc.def.pins.some((p) => p.role === 'vcc-source' || p.role === 'gnd-source'));
  if (index.placed.length > 0 && !hasSource) {
    report({ code: 'NO_POWER_SOURCE', severity: 'error', message: '電路沒有電源：請放入 VCC 與 GND' });
  }

  for (const net of nets) {
    const vccPins = net.pins.filter((r) => role(r) === 'vcc-source');
    const voltages = new Set(vccPins.map((r) => propsOf(index.placedById.get(r.componentId)!).voltage ?? 5));
    const hasGnd = netHas(net, 'gnd-source');
    if ((vccPins.length > 0 && hasGnd) || voltages.size > 1) {
      report({
        code: 'SHORT_CIRCUIT',
        severity: 'error',
        message: `⚠ Short Circuit：${net.name} 把${voltages.size > 1 ? '不同電壓的電源' : '電源和 GND'}直接接在一起`,
        netIds: [net.id],
        points: pointsOf(net.pins),
        componentIds: componentsOf(net.pins),
      });
    }
    const outputs = net.pins.filter((r) => role(r) === 'output');
    if (outputs.length > 1 || (outputs.length === 1 && (vccPins.length > 0 || hasGnd))) {
      report({
        code: 'OUTPUT_CONFLICT',
        severity: 'error',
        message: `${net.name} 上${outputs.length > 1 ? '有多個輸出腳互接' : '的輸出腳直接接到電源'}`,
        netIds: [net.id],
        points: pointsOf(outputs),
        componentIds: componentsOf(outputs),
      });
    }
  }

  for (const pc of index.placed) {
    const label = componentLabel(pc);
    const pinsByGroup = new Map<string, number[]>();
    for (const fp of pc.footprint.pins) {
      const g = groupOfPoint(index, fp.point);
      if (g) pushTo(pinsByGroup, g, fp.pinNumber);
    }

    if (pc.def.category === 'ic') {
      for (const numbers of pinsByGroup.values()) {
        if (numbers.length < 2) continue;
        report({
          code: 'IC_PIN_SHORT',
          severity: 'error',
          message: `${label} 第 ${numbers.join('、')} 腳插在同一條導通排上`,
          componentIds: [pc.instance.id],
          points: pointsOf(numbers.map((n) => refOf(pc, n))),
        });
      }
      for (const pin of pc.def.pins) {
        const ref = refOf(pc, pin.number);
        const net = byPin.get(pinKey(ref));
        const where = pointsOf([ref]);
        if (pin.role === 'power' && !netHas(net, 'vcc-source')) {
          report({ code: 'IC_POWER_MISSING', severity: 'error', message: `${label} 第 ${pin.number} 腳 VCC 未連接`, componentIds: [pc.instance.id], points: where });
        }
        if (pin.role === 'ground' && !netHas(net, 'gnd-source')) {
          report({ code: 'IC_POWER_MISSING', severity: 'error', message: `${label} 第 ${pin.number} 腳 GND 未連接`, componentIds: [pc.instance.id], points: where });
        }
        if (pin.role === 'input' && (!net || net.pins.every((r) => role(r) === 'input' || role(r) === 'nc'))) {
          report({
            code: 'INPUT_FLOATING',
            severity: 'warning',
            message: `⚠ ${label} 第 ${pin.number} 腳（${pin.name}）未連接，TTL 輸入懸空會被當成 HIGH`,
            componentIds: [pc.instance.id],
            points: where,
            netIds: net ? [net.id] : [],
          });
        }
      }
      continue;
    }

    for (const numbers of pinsByGroup.values()) {
      if (numbers.length < 2) continue;
      const intended = pc.def.internalConnections.some((set) => numbers.every((n) => set.includes(n)));
      if (!intended) {
        report({
          code: 'COMPONENT_SHORTED',
          severity: 'warning',
          message: `⚠ ${label} 的第 ${numbers.join('、')} 腳插在同一條導通排上，元件被短路`,
          componentIds: [pc.instance.id],
          points: pointsOf(numbers.map((n) => refOf(pc, n))),
        });
      }
    }
    for (const pin of pc.def.pins) {
      if (pin.role !== 'passive' && pin.role !== 'anode' && pin.role !== 'cathode') continue;
      const ref = refOf(pc, pin.number);
      const net = byPin.get(pinKey(ref));
      if (!net || net.pins.length === 1) {
        report({ code: 'PIN_UNCONNECTED', severity: 'warning', message: `⚠ ${label} 第 ${pin.number} 腳未連接`, componentIds: [pc.instance.id], points: pointsOf([ref]) });
      }
    }
    if (pc.def.category === 'led') {
      const anode = pc.def.pins.find((p) => p.role === 'anode');
      const cathode = pc.def.pins.find((p) => p.role === 'cathode');
      if (!anode || !cathode) continue;
      const anodeNet = byPin.get(pinKey(refOf(pc, anode.number)));
      const cathodeNet = byPin.get(pinKey(refOf(pc, cathode.number)));
      const where = pointsOf([refOf(pc, anode.number)]);
      if (netHas(anodeNet, 'gnd-source') || netHas(cathodeNet, 'vcc-source')) {
        report({ code: 'LED_REVERSED', severity: 'warning', message: `⚠ ${label} 極性接反（陽極要接高電位、陰極接 GND）`, componentIds: [pc.instance.id], points: where });
      }
      const hasResistor = (net: Net | undefined) =>
        net !== undefined && net.pins.some((r) => index.placedById.get(r.componentId)?.def.category === 'resistor');
      if (!hasResistor(anodeNet) && !hasResistor(cathodeNet)) {
        report({ code: 'LED_NO_RESISTOR', severity: 'warning', message: `⚠ ${label} 沒有串聯限流電阻`, componentIds: [pc.instance.id], points: where });
      }
    }
  }
}
```

- [ ] **Step 4: 確認測試通過**

Run: `npx vitest run tests/circuit/validate.test.ts`
Expected: PASS（15 tests）

Run: `npm run typecheck`
Expected: 無錯誤。

- [ ] **Step 5: Commit**

```bash
git add src/core/circuit/validate.ts tests/circuit/validate.test.ts
git commit -m "feat: add circuit validation (Check Circuit)"
```

---

### Task 8: 佈線型別、設定、顏色與佈線問題

**Files:**
- Create: `src/types/routing.ts`
- Create: `src/core/routing/config.ts`, `src/core/routing/colors.ts`, `src/core/routing/problem.ts`
- Create: `tests/fixtures/circuits.ts`（先放驗收電路）
- Test: `tests/routing/problem.test.ts`

**Interfaces:**
- Consumes: `Circuit`、`Net`、`Wire`（Task 4）；`indexCircuit`、`groupOfPoint`、`pinPoint`、`CircuitIndex`（Task 4）；`extractNetsWith`、`terminalGroupIds`、`terminalClusters`、`compareIds`（Task 5）
- Produces:
  - 型別：`RoutingWeights`、`NegotiationConfig`、`PriorityConfig`、`ScoringConfig`、`RoutingConfig`、`DeepPartial<T>`、`RoutingMetrics`、`FailureReason`、`FailedNet`、`RoutingResult`、`RoutingPath`、`RoutingNode`、`LegalityCode`、`LegalityViolation`
  - `DEFAULT_ROUTING_CONFIG: RoutingConfig`、`mergeConfig(overrides?: DeepPartial<RoutingConfig>): RoutingConfig`
  - `POWER_COLOR = '#d32f2f'`、`GROUND_COLOR = '#212121'`、`SIGNAL_PALETTE: string[]`、`netColor(kind, signalIndex): string`
  - `RoutingNet { netId; kind; terminalGroups: string[]; clusters: string[][]; startCluster: number; priority; color }`（`clusters.length >= 2` 的 Net 才需要佈線，需要 `clusters.length − 1` 條線）
  - `RoutingProblem { board; width; height; size; blocked: Uint8Array; groupAt; freeHoles: Map<string, number[]>; terminalHole: Uint8Array; nets: RoutingNet[]; referenceNets: Net[]; index }`
  - `toIndex(problem, x, y): number`、`toPoint(problem, i): GridPoint`、`describeGroup(groupId): string`
  - `buildRoutingProblem(circuit: Circuit, config: RoutingConfig): RoutingProblem`（多於一塊板時丟出 `autoRoute currently supports exactly one breadboard`）
  - 測試工具：`acceptanceCircuit(): Circuit`

- [ ] **Step 1: 寫型別**

`src/types/routing.ts`：

```ts
import type { Wire } from './circuit';
import type { GridPoint } from './geometry';

export interface RoutingWeights {
  distance: number;
  bend: number;
  crossing: number;
  congestion: number;
  aesthetic: number;
}

export interface NegotiationConfig {
  overlapBase: number;
  presentFactor: number;
  presentFactorGrowth: number;
  historyIncrement: number;
  maxIterations: number;
  maxImprovementPasses: number;
}

export interface PriorityConfig {
  power: number;
  spread: number;
  scarcity: number;
}

export interface ScoringConfig {
  overlap: number;
  crossing: number;
  lengthMax: number;
  extraBend: number;
  extraBendMax: number;
  shortJog: number;
  shortJogMax: number;
}

export interface RoutingConfig {
  weights: RoutingWeights;
  negotiation: NegotiationConfig;
  timeBudgetMs: number;
  priority: PriorityConfig;
  scoring: ScoringConfig;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export interface RoutingMetrics {
  wireCount: number;
  totalLength: number;
  bends: number;
  crossings: number;
  overlaps: number;
  shortJogs: number;
}

export type FailureReason = 'NO_FREE_HOLE' | 'UNROUTABLE' | 'ITERATION_LIMIT' | 'TIME_LIMIT' | 'LEGALITY_CHECK';

export interface FailedNet {
  netId: string;
  reason: FailureReason;
  detail: string;
}

export interface RoutingResult {
  status: 'success' | 'partial' | 'failed';
  message: string;
  wires: Wire[];
  failedNets: FailedNet[];
  metrics: RoutingMetrics;
  score: number;
  stats: { iterations: number; elapsedMs: number };
}

/** 需求文件第四章的佈線輸出格式（Wire 是它的超集）。 */
export interface RoutingPath {
  netId: string;
  start: GridPoint;
  end: GridPoint;
  path: GridPoint[];
}

/** A* 的搜尋狀態（除錯用）。 */
export interface RoutingNode {
  index: number;
  direction: number;
  longRun: boolean;
  firstSegment: boolean;
}

export type LegalityCode = 'PATH_INVALID' | 'ENDPOINT_INVALID' | 'THROUGH_OBSTACLE' | 'OVERLAP' | 'NET_MISMATCH';

export interface LegalityViolation {
  code: LegalityCode;
  wireIds: string[];
  netIds: string[];
  detail: string;
}
```

- [ ] **Step 2: 寫驗收電路**

`tests/fixtures/circuits.ts`：

```ts
import type { Circuit } from '../../src/types/circuit';
import { circuit, comp, wire } from './build';

/** 需求文件第三十四章的驗收電路：74LS00 第 1 閘輸入接地 → 1Y → 電阻 → LED → GND。 */
export function acceptanceCircuit(): Circuit {
  return circuit(
    [
      comp('V1', 'vcc', 'T+5'),
      comp('G1', 'gnd', 'B-5'),
      comp('U1', '74LS00', 'F10'),
      comp('R1', 'resistor', 'G30'),
      comp('D1', 'led', 'G40'),
    ],
    [
      wire('w1', 'T+6', 'A10'), // VCC → U1 第 14 腳
      wire('w2', 'B-6', 'J16'), // GND → U1 第 7 腳
      wire('w3', 'J10', 'I16'), // U1 第 1 腳 → GND
      wire('w4', 'J11', 'H16'), // U1 第 2 腳 → GND
      wire('w5', 'J12', 'J30'), // U1 第 3 腳（1Y）→ R1
      wire('w6', 'J34', 'J40'), // R1 → LED 陽極
      wire('w7', 'J41', 'B-41'), // LED 陰極 → GND
    ],
  );
}
```

- [ ] **Step 3: 寫失敗的測試**

`tests/routing/problem.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { GROUND_COLOR, POWER_COLOR, SIGNAL_PALETTE } from '../../src/core/routing/colors';
import { DEFAULT_ROUTING_CONFIG, mergeConfig } from '../../src/core/routing/config';
import { buildRoutingProblem, describeGroup, toIndex, toPoint } from '../../src/core/routing/problem';
import { circuit, comp, hole, wire } from '../fixtures/build';
import { acceptanceCircuit } from '../fixtures/circuits';

describe('mergeConfig', () => {
  it('fills defaults and applies partial overrides', () => {
    const c = mergeConfig({ weights: { bend: 9 }, timeBudgetMs: 100 });
    expect(c.weights).toEqual({ ...DEFAULT_ROUTING_CONFIG.weights, bend: 9 });
    expect(c.timeBudgetMs).toBe(100);
    expect(c.negotiation).toEqual(DEFAULT_ROUTING_CONFIG.negotiation);
    expect(mergeConfig()).toEqual(DEFAULT_ROUTING_CONFIG);
  });
});

describe('buildRoutingProblem', () => {
  const problem = buildRoutingProblem(acceptanceCircuit(), DEFAULT_ROUTING_CONFIG);
  const idx = (name: string) => {
    const p = hole(name);
    return toIndex(problem, p.x, p.y);
  };

  it('converts between lattice indices and points', () => {
    expect(toIndex(problem, 12, 4)).toBe(3 * 63 + 11);
    expect(toPoint(problem, 3 * 63 + 11)).toEqual({ boardId: 'b1', x: 12, y: 4 });
  });

  it('blocks component pins and bodies but not free holes', () => {
    expect(problem.blocked[idx('E10')]).toBe(1);
    expect(problem.blocked[toIndex(problem, 12, 9)]).toBe(1);
    expect(problem.blocked[idx('G31')]).toBe(1);
    expect(problem.blocked[idx('H31')]).toBe(0);
    expect(problem.blocked[idx('A10')]).toBe(0);
  });

  it('lists free holes per conductive group in index order', () => {
    expect(problem.freeHoles.get('b1:c10-top')).toEqual(['A10', 'B10', 'C10', 'D10'].map(idx));
    expect(problem.freeHoles.get('b1:c30-bot')).toEqual(['F30', 'H30', 'I30', 'J30'].map(idx));
  });

  it('routes power nets first and records their terminal groups', () => {
    expect(problem.nets.slice(0, 2).map((n) => n.netId).sort()).toEqual(['GND', 'VCC']);
    const vcc = problem.nets.find((n) => n.netId === 'VCC')!;
    expect(vcc.terminalGroups).toEqual(['b1:c10-top', 'b1:rail-T+']);
    expect(vcc.clusters).toEqual([['b1:c10-top'], ['b1:rail-T+']]);
    expect(vcc.startCluster).toBe(1);
    expect(vcc.color).toBe(POWER_COLOR);
    const gnd = problem.nets.find((n) => n.netId === 'GND')!;
    expect(gnd.terminalGroups).toEqual(['b1:c10-bot', 'b1:c11-bot', 'b1:c16-bot', 'b1:c41-bot', 'b1:rail-B-']);
    expect(gnd.color).toBe(GROUND_COLOR);
  });

  it('colours routable signal nets from the palette in net order', () => {
    expect(problem.nets.find((n) => n.netId === 'NET_1')!.color).toBe(SIGNAL_PALETTE[0]);
    expect(problem.nets.find((n) => n.netId === 'NET_2')!.color).toBe(SIGNAL_PALETTE[1]);
  });

  it('marks free holes of routed terminal groups for the congestion cost', () => {
    expect(problem.terminalHole[idx('A10')]).toBe(1);
    expect(problem.terminalHole[idx('A40')]).toBe(0);
    expect(problem.terminalHole[idx('E10')]).toBe(0);
  });

  it('keeps a pin-less power rail that the user bridged', () => {
    const c = circuit([comp('V1', 'vcc', 'T+5'), comp('R1', 'resistor', 'G30')], [wire('w1', 'T+7', 'B+7'), wire('w2', 'B+30', 'J30')]);
    const p = buildRoutingProblem(c, DEFAULT_ROUTING_CONFIG);
    expect(p.nets.find((n) => n.netId === 'VCC')!.terminalGroups).toEqual(['b1:c30-bot', 'b1:rail-B+', 'b1:rail-T+']);
  });

  it('treats a push button as one cluster and starts from the cluster with the most pins', () => {
    const c = circuit(
      [comp('SW1', 'pushbutton', 'F4'), comp('D1', 'led', 'C20'), comp('D2', 'led', 'C30')],
      [wire('w1', 'A4', 'A20'), wire('w2', 'B20', 'A30')],
    );
    const p = buildRoutingProblem(c, DEFAULT_ROUTING_CONFIG);
    const net = p.nets.find((n) => n.terminalGroups.includes('b1:c4-top'))!;
    expect(net.clusters).toEqual([['b1:c20-top'], ['b1:c30-top'], ['b1:c4-bot', 'b1:c4-top']]);
    expect(net.startCluster).toBe(2);
  });

  it('describes groups for students', () => {
    expect(describeGroup('b1:c12-top')).toBe('第 12 欄上半（A–E）');
    expect(describeGroup('b1:c12-bot')).toBe('第 12 欄下半（F–J）');
    expect(describeGroup('b1:rail-T+')).toBe('T+ 電源軌');
  });

  it('rejects circuits with more than one board', () => {
    const c = acceptanceCircuit();
    c.boards.push({ id: 'b2', layoutId: 'MB102', x: 0, y: 400, groupId: null });
    expect(() => buildRoutingProblem(c, DEFAULT_ROUTING_CONFIG)).toThrow('exactly one breadboard');
  });
});
```

- [ ] **Step 4: 確認測試失敗**

Run: `npx vitest run tests/routing/problem.test.ts`
Expected: FAIL，找不到 `colors` 模組。

- [ ] **Step 5: 實作**

`src/core/routing/config.ts`：

```ts
import type { DeepPartial, RoutingConfig } from '../../types/routing';

/** 起始值；Task 14 會用固定測試電路校準。 */
export const DEFAULT_ROUTING_CONFIG: RoutingConfig = {
  weights: { distance: 1, bend: 5, crossing: 1000, congestion: 20, aesthetic: 10 },
  negotiation: {
    overlapBase: 50,
    presentFactor: 0.5,
    presentFactorGrowth: 1.6,
    historyIncrement: 1,
    maxIterations: 60,
    maxImprovementPasses: 3,
  },
  timeBudgetMs: 5000,
  priority: { power: 1000, spread: 10, scarcity: 100 },
  scoring: { overlap: 30, crossing: 8, lengthMax: 20, extraBend: 1.5, extraBendMax: 15, shortJog: 2, shortJogMax: 10 },
};

export function mergeConfig(overrides?: DeepPartial<RoutingConfig>): RoutingConfig {
  const d = DEFAULT_ROUTING_CONFIG;
  return {
    weights: { ...d.weights, ...overrides?.weights },
    negotiation: { ...d.negotiation, ...overrides?.negotiation },
    timeBudgetMs: overrides?.timeBudgetMs ?? d.timeBudgetMs,
    priority: { ...d.priority, ...overrides?.priority },
    scoring: { ...d.scoring, ...overrides?.scoring },
  };
}
```

`src/core/routing/colors.ts`：

```ts
import type { Net } from '../../types/circuit';

export const POWER_COLOR = '#d32f2f';
export const GROUND_COLOR = '#212121';
/** 黃、綠、藍、橘、白、紫、棕、灰。 */
export const SIGNAL_PALETTE = ['#f9a825', '#2e7d32', '#1565c0', '#ef6c00', '#f5f5f5', '#6a1b9a', '#6d4c41', '#9e9e9e'];

export function netColor(kind: Net['kind'], signalIndex: number): string {
  if (kind === 'power') return POWER_COLOR;
  if (kind === 'ground') return GROUND_COLOR;
  return SIGNAL_PALETTE[Math.max(0, signalIndex) % SIGNAL_PALETTE.length];
}
```

`src/core/routing/problem.ts`：

```ts
import type { Breadboard } from '../../types/board';
import type { Circuit, Net } from '../../types/circuit';
import type { GridPoint } from '../../types/geometry';
import type { RoutingConfig } from '../../types/routing';
import { groupOfPoint, indexCircuit, pinPoint, type CircuitIndex } from '../circuit/circuitIndex';
import { compareIds, extractNetsWith, terminalClusters, terminalGroupIds } from '../circuit/nets';
import { netColor } from './colors';

export interface RoutingNet {
  netId: string;
  kind: Net['kind'];
  terminalGroups: string[];
  /** 依元件內部導通分好的終端群組簇；簇與簇之間各需要一條線。 */
  clusters: string[][];
  /** 生成樹從哪一簇開始（clusters 的索引）。 */
  startCluster: number;
  priority: number;
  color: string;
}

export interface RoutingProblem {
  board: Breadboard;
  width: number;
  height: number;
  size: number;
  /** 1 = 元件本體或元件腳：導線不能經過，也不能當端點。 */
  blocked: Uint8Array;
  /** 每個格點所屬的導通群組（surface 為 null）。 */
  groupAt: Array<string | null>;
  /** 群組 ID → 沒被元件佔用的孔（格點索引，遞增）。每個群組都有 key。 */
  freeHoles: Map<string, number[]>;
  /** 1 = 某個需要佈線的 Net 的終端群組空孔；導線經過會加 congestion 成本。 */
  terminalHole: Uint8Array;
  /** 依 priority 由高到低排序，同分依 netId。 */
  nets: RoutingNet[];
  referenceNets: Net[];
  index: CircuitIndex;
}

export function toIndex(problem: Pick<RoutingProblem, 'width'>, x: number, y: number): number {
  return (y - 1) * problem.width + (x - 1);
}

export function toPoint(problem: Pick<RoutingProblem, 'width' | 'board'>, i: number): GridPoint {
  return { boardId: problem.board.id, x: (i % problem.width) + 1, y: Math.floor(i / problem.width) + 1 };
}

export function describeGroup(groupId: string): string {
  const local = groupId.slice(groupId.indexOf(':') + 1);
  const column = /^c(\d+)-(top|bot)$/.exec(local);
  if (column) return `第 ${column[1]} 欄${column[2] === 'top' ? '上半（A–E）' : '下半（F–J）'}`;
  return `${local.replace('rail-', '')} 電源軌`;
}

export function buildRoutingProblem(circuit: Circuit, config: RoutingConfig): RoutingProblem {
  if (circuit.boards.length !== 1) throw new Error('autoRoute currently supports exactly one breadboard');
  const index = indexCircuit(circuit);
  const board = index.boards.get(circuit.boards[0].id)!;
  const { width, height } = board;
  const size = width * height;
  const at = (p: GridPoint) =>
    p.boardId === board.id && p.x >= 1 && p.y >= 1 && p.x <= width && p.y <= height ? (p.y - 1) * width + (p.x - 1) : -1;

  const blocked = new Uint8Array(size);
  for (const pc of index.placed) {
    for (const pin of pc.footprint.pins) {
      const i = at(pin.point);
      if (i >= 0) blocked[i] = 1;
    }
    for (const cell of pc.footprint.blocked) {
      const i = at(cell);
      if (i >= 0) blocked[i] = 1;
    }
  }

  const groupAt = board.nodes.map((n) => n.groupId);
  const freeHoles = new Map<string, number[]>(Object.keys(board.groups).sort(compareIds).map((g) => [g, []]));
  groupAt.forEach((g, i) => {
    if (g && !blocked[i]) freeHoles.get(g)!.push(i);
  });

  const referenceNets = extractNetsWith(index, circuit.wires);
  const routableSignals = referenceNets
    .filter((n) => n.kind === 'signal' && terminalClusters(n, index).length >= 2)
    .map((n) => n.id);

  const nets = referenceNets.map((net): RoutingNet => {
    const terminalGroups = terminalGroupIds(net, index);
    const clusters = terminalClusters(net, index);
    const pinsIn = (cluster: string[]) =>
      net.pins.filter((ref) => {
        const p = pinPoint(index, ref);
        const g = p ? groupOfPoint(index, p) : null;
        return g !== null && cluster.includes(g);
      }).length;
    let startCluster = clusters.findIndex((cl) => cl.some((g) => board.groups[g]?.kind === 'rail'));
    if (startCluster < 0) {
      startCluster = 0;
      for (let i = 1; i < clusters.length; i++) if (pinsIn(clusters[i]) > pinsIn(clusters[startCluster])) startCluster = i;
    }
    const holes = terminalGroups.flatMap((g) => freeHoles.get(g) ?? []);
    const xs = holes.map((i) => i % width);
    const ys = holes.map((i) => Math.floor(i / width));
    const spread = holes.length > 0 ? Math.max(...xs) - Math.min(...xs) + (Math.max(...ys) - Math.min(...ys)) : 0;
    const freeIn = (cluster: string[]) => cluster.reduce((sum, g) => sum + (freeHoles.get(g)?.length ?? 0), 0);
    const minFree = clusters.length > 0 ? Math.min(...clusters.map(freeIn)) : 0;
    const priority =
      (net.kind === 'signal' ? 0 : config.priority.power) +
      spread * config.priority.spread +
      config.priority.scarcity / (minFree + 1);
    return {
      netId: net.id,
      kind: net.kind,
      terminalGroups,
      clusters,
      startCluster,
      priority,
      color: netColor(net.kind, routableSignals.indexOf(net.id)),
    };
  });
  nets.sort((a, b) => b.priority - a.priority || compareIds(a.netId, b.netId));

  const terminalHole = new Uint8Array(size);
  for (const net of nets) {
    if (net.clusters.length < 2) continue;
    for (const g of net.terminalGroups) for (const i of freeHoles.get(g) ?? []) terminalHole[i] = 1;
  }

  return { board, width, height, size, blocked, groupAt, freeHoles, terminalHole, nets, referenceNets, index };
}
```

- [ ] **Step 6: 確認測試通過**

Run: `npx vitest run tests/routing/problem.test.ts`
Expected: PASS（11 tests）

Run: `npm run typecheck`
Expected: 無錯誤。

- [ ] **Step 7: Commit**

```bash
git add src/types/routing.ts src/core/routing/config.ts src/core/routing/colors.ts src/core/routing/problem.ts tests/fixtures/circuits.ts tests/routing/problem.test.ts
git commit -m "feat: build routing problem from circuit"
```

---

### Task 9: 最小堆積、佔用狀態與 A*

**Files:**
- Create: `src/core/routing/minHeap.ts`, `src/core/routing/routeState.ts`, `src/core/routing/astar.ts`
- Test: `tests/routing/astar.test.ts`

**Interfaces:**
- Consumes: `RoutingProblem`、`buildRoutingProblem`、`toIndex`（Task 8）；`RoutingWeights`、`RoutingNode`（Task 8）
- Produces:
  - `class MinHeap { size; push(key: number, value: number); pop(): { key; value } | undefined }`（同 key 先進先出）
  - `type Usage = 'E' | 'H' | 'V' | 'T'`、`StoredWire { id; netId; path: number[] }`、`NodeUse { wireId; usage }`
  - `pathUsages(path: number[]): Usage[]`、`isCrossPair(a: Usage, b: Usage): boolean`
  - `class RouteState { uses: NodeUse[][]; history: Float64Array; addWire(w); removeWire(id); removeNet(netId); wiresOf(netId): StoredWire[]; conflictedNodes(): number[]; netsAt(nodes): Set<string> }`
  - `type OverlapMode = { kind: 'negotiate'; overlapBase: number; presentFactor: number } | { kind: 'hard' }`
  - `SearchParams { weights: RoutingWeights; overlap: OverlapMode }`、`FoundWire { path: number[]; cost: number }`
  - `nodeUseCost(problem, state, node, usage, params): number`（Infinity = 不允許）
  - `findWire(problem, state, sources: number[], targets: number[], params): FoundWire | null`
  - `evaluatePath(problem, state, path: number[], params): number`（與 `findWire` 的成本定義完全相同）
  - `directionBetween(from, to, width): number`（0 N、1 E、2 S、3 W）、`decodeState(id): RoutingNode`

- [ ] **Step 1: 寫失敗的測試**

`tests/routing/astar.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { decodeState, evaluatePath, findWire, type SearchParams } from '../../src/core/routing/astar';
import { DEFAULT_ROUTING_CONFIG } from '../../src/core/routing/config';
import { MinHeap } from '../../src/core/routing/minHeap';
import { buildRoutingProblem, toIndex, type RoutingProblem } from '../../src/core/routing/problem';
import { pathUsages, RouteState } from '../../src/core/routing/routeState';
import type { ComponentInstance } from '../../src/types/component';
import { circuit, comp } from '../fixtures/build';

const W = DEFAULT_ROUTING_CONFIG.weights;
const hard: SearchParams = { weights: W, overlap: { kind: 'hard' } };
const negotiate: SearchParams = { weights: W, overlap: { kind: 'negotiate', overlapBase: 50, presentFactor: 0.5 } };

/** 沒有任何 Net 的佈線問題：不會有 congestion 成本，方便算出精確數字。 */
function emptyProblem(components: ComponentInstance[] = []): RoutingProblem {
  return buildRoutingProblem(circuit(components), DEFAULT_ROUTING_CONFIG);
}

const at = (p: RoutingProblem, x: number, y: number) => toIndex(p, x, y);
const xy = (p: RoutingProblem, path: number[]) => path.map((i) => [(i % p.width) + 1, Math.floor(i / p.width) + 1]);
const column = (p: RoutingProblem, x: number, fromY: number, toY: number) =>
  Array.from({ length: toY - fromY + 1 }, (_, k) => at(p, x, fromY + k));

describe('MinHeap', () => {
  it('pops by key, then by insertion order', () => {
    const heap = new MinHeap();
    heap.push(5, 1);
    heap.push(1, 2);
    heap.push(5, 3);
    heap.push(0, 4);
    expect([heap.pop()!.value, heap.pop()!.value, heap.pop()!.value, heap.pop()!.value]).toEqual([4, 2, 1, 3]);
    expect(heap.pop()).toBeUndefined();
  });
});

describe('RouteState', () => {
  it('records usages and flags conflicts, but not a legal crossing', () => {
    const p = emptyProblem();
    const state = new RouteState(p.size);
    const h = [at(p, 1, 5), at(p, 2, 5), at(p, 3, 5)];
    expect(pathUsages(h)).toEqual(['E', 'H', 'E']);
    state.addWire({ id: 'h#0', netId: 'h', path: h });
    state.addWire({ id: 'v#0', netId: 'v', path: column(p, 2, 4, 6) });
    expect(state.conflictedNodes()).toEqual([]);
    state.addWire({ id: 'x#0', netId: 'x', path: [at(p, 3, 4), at(p, 3, 5)] });
    expect(state.conflictedNodes()).toEqual([at(p, 3, 5)]);
    expect([...state.netsAt([at(p, 3, 5)])].sort()).toEqual(['h', 'x']);
    state.removeNet('x');
    expect(state.conflictedNodes()).toEqual([]);
    expect(state.wiresOf('h').map((w) => w.id)).toEqual(['h#0']);
    expect(() => state.addWire({ id: 'h#0', netId: 'h', path: h })).toThrow('already placed');
  });
});

describe('findWire', () => {
  it('finds a straight wire whose cost equals its length', () => {
    const p = emptyProblem();
    const r = findWire(p, new RouteState(p.size), [at(p, 10, 4)], [at(p, 20, 4)], hard)!;
    expect(xy(p, r.path)).toEqual(Array.from({ length: 11 }, (_, i) => [10 + i, 4]));
    expect(r.cost).toBe(10);
  });

  it('pays one bend for an L-shaped wire', () => {
    const p = emptyProblem();
    const r = findWire(p, new RouteState(p.size), [at(p, 10, 4)], [at(p, 20, 7)], hard)!;
    expect(r.path).toHaveLength(14);
    expect(r.cost).toBe(13 + W.bend);
  });

  it('picks the cheapest source/target pair', () => {
    const p = emptyProblem();
    const r = findWire(p, new RouteState(p.size), [at(p, 1, 4), at(p, 30, 4)], [at(p, 33, 4), at(p, 60, 4)], hard)!;
    expect(xy(p, [r.path[0], r.path[r.path.length - 1]])).toEqual([[30, 4], [33, 4]]);
  });

  it('never enters blocked nodes such as an IC body', () => {
    const p = emptyProblem([comp('U1', '74LS00', 'F10')]);
    const r = findWire(p, new RouteState(p.size), [at(p, 8, 8)], [at(p, 18, 11)], hard)!;
    expect(r.path.every((i) => p.blocked[i] === 0)).toBe(true);
  });

  it('detours instead of crossing when a detour exists', () => {
    const p = emptyProblem();
    const state = new RouteState(p.size);
    state.addWire({ id: 'v#0', netId: 'v', path: column(p, 20, 4, 15) });
    const r = findWire(p, state, [at(p, 10, 6)], [at(p, 30, 6)], hard)!;
    expect(r.path.includes(at(p, 20, 6))).toBe(false);
    expect(r.cost).toBeLessThan(W.crossing);
  });

  it('crosses exactly once when the other wire spans the whole board', () => {
    const p = emptyProblem();
    const state = new RouteState(p.size);
    state.addWire({ id: 'v#0', netId: 'v', path: column(p, 30, 1, 18) });
    const r = findWire(p, state, [at(p, 10, 6)], [at(p, 50, 6)], hard)!;
    expect(r.path.filter((i) => i % p.width === 29)).toHaveLength(1);
    expect(r.cost).toBe(40 + W.crossing);
  });

  it('returns null when every route is blocked', () => {
    const p = emptyProblem();
    const target = at(p, 30, 6);
    for (const n of [target - 1, target + 1, target - p.width, target + p.width]) p.blocked[n] = 1;
    expect(findWire(p, new RouteState(p.size), [at(p, 10, 6)], [target], hard)).toBeNull();
  });

  it('allows a priced overlap in negotiation mode but not in hard mode', () => {
    const p = emptyProblem();
    const state = new RouteState(p.size);
    const target = at(p, 30, 6);
    for (const n of [target - 1, target + 1, target - p.width]) p.blocked[n] = 1;
    state.addWire({ id: 'o#0', netId: 'o', path: [target + p.width, target + p.width + 1] });
    expect(findWire(p, state, [at(p, 10, 6)], [target], hard)).toBeNull();
    const r = findWire(p, state, [at(p, 10, 6)], [target], negotiate)!;
    expect(r.path).toContain(target + p.width);
  });

  it('reports the same cost as evaluatePath for the path it returns', () => {
    const p = emptyProblem([comp('U1', '74LS00', 'F10'), comp('R1', 'resistor', 'C20')]);
    const state = new RouteState(p.size);
    state.addWire({ id: 'v#0', netId: 'v', path: column(p, 40, 1, 18) });
    const r = findWire(p, state, [at(p, 5, 13)], [at(p, 50, 5)], hard)!;
    expect(evaluatePath(p, state, r.path, hard)).toBeCloseTo(r.cost, 9);
  });
});

describe('evaluatePath', () => {
  it('charges the aesthetic cost for a one-step jog between two bends', () => {
    const p = emptyProblem();
    const state = new RouteState(p.size);
    const z = [at(p, 1, 4), at(p, 2, 4), at(p, 2, 5), at(p, 3, 5), at(p, 4, 5)];
    const zLong = [at(p, 1, 4), at(p, 2, 4), at(p, 2, 5), at(p, 2, 6), at(p, 3, 6)];
    expect(evaluatePath(p, state, z, hard)).toBe(4 + 2 * W.bend + W.aesthetic);
    expect(evaluatePath(p, state, zLong, hard)).toBe(4 + 2 * W.bend);
  });
});

describe('decodeState', () => {
  it('decodes node, direction, run length and first-segment flags', () => {
    expect(decodeState(((7 * 5 + 2) * 2 + 1) * 2 + 0)).toEqual({ index: 7, direction: 2, longRun: true, firstSegment: false });
  });
});
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run tests/routing/astar.test.ts`
Expected: FAIL，找不到 `astar` 模組。

- [ ] **Step 3: 實作最小堆積**

`src/core/routing/minHeap.ts`：

```ts
/** 以 key 排序的最小堆積；key 相同時先放入者先出，確保結果確定。 */
export class MinHeap {
  private readonly keys: number[] = [];
  private readonly seqs: number[] = [];
  private readonly values: number[] = [];
  private counter = 0;

  get size(): number {
    return this.values.length;
  }

  push(key: number, value: number): void {
    this.keys.push(key);
    this.seqs.push(this.counter++);
    this.values.push(value);
    this.siftUp(this.values.length - 1);
  }

  pop(): { key: number; value: number } | undefined {
    if (this.values.length === 0) return undefined;
    const top = { key: this.keys[0], value: this.values[0] };
    this.swap(0, this.values.length - 1);
    this.keys.pop();
    this.seqs.pop();
    this.values.pop();
    if (this.values.length > 0) this.siftDown(0);
    return top;
  }

  private less(i: number, j: number): boolean {
    return this.keys[i] < this.keys[j] || (this.keys[i] === this.keys[j] && this.seqs[i] < this.seqs[j]);
  }

  private swap(i: number, j: number): void {
    const k = this.keys[i];
    this.keys[i] = this.keys[j];
    this.keys[j] = k;
    const s = this.seqs[i];
    this.seqs[i] = this.seqs[j];
    this.seqs[j] = s;
    const v = this.values[i];
    this.values[i] = this.values[j];
    this.values[j] = v;
  }

  private siftUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) return;
      this.swap(i, parent);
      i = parent;
    }
  }

  private siftDown(i: number): void {
    const n = this.values.length;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < n && this.less(left, smallest)) smallest = left;
      if (right < n && this.less(right, smallest)) smallest = right;
      if (smallest === i) return;
      this.swap(i, smallest);
      i = smallest;
    }
  }
}
```

- [ ] **Step 4: 實作佔用狀態**

`src/core/routing/routeState.ts`：

```ts
/** E = 端點、H = 水平直穿、V = 垂直直穿、T = 轉彎。 */
export type Usage = 'E' | 'H' | 'V' | 'T';

export interface StoredWire {
  id: string;
  netId: string;
  path: number[];
}

export interface NodeUse {
  wireId: string;
  usage: Usage;
}

export function pathUsages(path: number[]): Usage[] {
  return path.map((node, k) => {
    if (k === 0 || k === path.length - 1) return 'E';
    const into = node - path[k - 1];
    const out = path[k + 1] - node;
    if (into !== out) return 'T';
    return Math.abs(into) === 1 ? 'H' : 'V';
  });
}

export function isCrossPair(a: Usage, b: Usage): boolean {
  return (a === 'H' && b === 'V') || (a === 'V' && b === 'H');
}

/** 協商佈線時每個格點被哪些線、以什麼方式使用，以及每個格點的歷史擁擠成本。 */
export class RouteState {
  readonly uses: NodeUse[][];
  readonly history: Float64Array;
  private readonly wires = new Map<string, StoredWire>();
  private readonly byNet = new Map<string, string[]>();

  constructor(size: number) {
    this.uses = Array.from({ length: size }, () => []);
    this.history = new Float64Array(size);
  }

  addWire(wire: StoredWire): void {
    if (this.wires.has(wire.id)) throw new Error(`Wire ${wire.id} is already placed`);
    this.wires.set(wire.id, wire);
    const list = this.byNet.get(wire.netId);
    if (list) list.push(wire.id);
    else this.byNet.set(wire.netId, [wire.id]);
    pathUsages(wire.path).forEach((usage, k) => this.uses[wire.path[k]].push({ wireId: wire.id, usage }));
  }

  removeWire(id: string): void {
    const wire = this.wires.get(id);
    if (!wire) return;
    for (const node of wire.path) this.uses[node] = this.uses[node].filter((u) => u.wireId !== id);
    this.wires.delete(id);
    const rest = (this.byNet.get(wire.netId) ?? []).filter((w) => w !== id);
    if (rest.length > 0) this.byNet.set(wire.netId, rest);
    else this.byNet.delete(wire.netId);
  }

  removeNet(netId: string): void {
    for (const id of [...(this.byNet.get(netId) ?? [])]) this.removeWire(id);
  }

  wiresOf(netId: string): StoredWire[] {
    return (this.byNet.get(netId) ?? []).map((id) => this.wires.get(id)!);
  }

  /** 使用方式不合法的格點：兩條以上的線共用，而且不是「恰好兩條、一橫一直」的交叉。 */
  conflictedNodes(): number[] {
    const out: number[] = [];
    this.uses.forEach((list, node) => {
      if (list.length < 2) return;
      if (list.length === 2 && isCrossPair(list[0].usage, list[1].usage)) return;
      out.push(node);
    });
    return out;
  }

  netsAt(nodes: number[]): Set<string> {
    const nets = new Set<string>();
    for (const node of nodes) for (const u of this.uses[node]) nets.add(this.wires.get(u.wireId)!.netId);
    return nets;
  }
}
```

- [ ] **Step 5: 實作 A***

`src/core/routing/astar.ts`：

```ts
import type { RoutingNode, RoutingWeights } from '../../types/routing';
import { MinHeap } from './minHeap';
import type { RoutingProblem } from './problem';
import { isCrossPair, type RouteState, type Usage } from './routeState';

export type OverlapMode = { kind: 'negotiate'; overlapBase: number; presentFactor: number } | { kind: 'hard' };

export interface SearchParams {
  weights: RoutingWeights;
  overlap: OverlapMode;
}

export interface FoundWire {
  path: number[];
  cost: number;
}

const NONE = 4;
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const STATES_PER_NODE = 20; // 5 個方向（含「起點」）× 段長 ≥ 2 與否 × 是否第一段

const encode = (node: number, dir: number, long: number, first: number) => ((node * 5 + dir) * 2 + long) * 2 + first;

export function decodeState(id: number): RoutingNode {
  return {
    index: Math.floor(id / STATES_PER_NODE),
    direction: Math.floor(id / 4) % 5,
    longRun: (Math.floor(id / 2) & 1) === 1,
    firstSegment: (id & 1) === 1,
  };
}

export function directionBetween(from: number, to: number, width: number): number {
  const d = to - from;
  if (d === -width) return 0;
  if (d === 1) return 1;
  if (d === width) return 2;
  if (d === -1) return 3;
  throw new Error(`Nodes ${from} and ${to} are not adjacent`);
}

/** 以 usage 方式使用 node 時的額外成本（不含移動與轉彎）。Infinity 代表不允許。 */
export function nodeUseCost(problem: RoutingProblem, state: RouteState, node: number, usage: Usage, params: SearchParams): number {
  let cost = params.overlap.kind === 'negotiate' ? state.history[node] : 0;
  const others = state.uses[node];
  if (others.length > 0) {
    if (others.length === 1 && isCrossPair(others[0].usage, usage)) {
      cost += params.weights.crossing;
    } else if (params.overlap.kind === 'hard') {
      return Infinity;
    } else {
      cost += (params.overlap.overlapBase + state.history[node]) * (1 + params.overlap.presentFactor * others.length);
    }
  }
  if (usage !== 'E' && problem.terminalHole[node]) cost += params.weights.congestion;
  return cost;
}

interface Scratch {
  g: Float64Array;
  parent: Int32Array;
  closed: Uint8Array;
  hCache: Float64Array;
  isTarget: Uint8Array;
}

let scratch: Scratch | null = null;

/** 重複使用搜尋用的陣列，避免每次呼叫都配置新記憶體。 */
function buffers(totalStates: number, size: number): Scratch {
  if (!scratch || scratch.g.length !== totalStates || scratch.isTarget.length !== size) {
    scratch = {
      g: new Float64Array(totalStates),
      parent: new Int32Array(totalStates),
      closed: new Uint8Array(totalStates),
      hCache: new Float64Array(size),
      isTarget: new Uint8Array(size),
    };
  }
  scratch.g.fill(Infinity);
  scratch.parent.fill(-1);
  scratch.closed.fill(0);
  scratch.hCache.fill(-1);
  scratch.isTarget.fill(0);
  return scratch;
}

/**
 * 多起點、多終點 A*。狀態 = (格點, 進入方向, 本段長度是否 ≥ 2, 本段是否為第一段)。
 * 終點另用「goal 狀態」（索引 = STATES + 格點）表示，進入時加上端點使用成本。
 * 估計函式為最近終點的曼哈頓距離 × distance 權重：不高估且一致，第一次取出 goal 即為最佳解。
 */
export function findWire(
  problem: RoutingProblem,
  state: RouteState,
  sources: number[],
  targets: number[],
  params: SearchParams,
): FoundWire | null {
  const { width, height, size, blocked } = problem;
  const weights = params.weights;
  const STATES = size * STATES_PER_NODE;
  const { g, parent, closed, hCache, isTarget } = buffers(STATES + size, size);
  for (const t of targets) isTarget[t] = 1;
  const tx = targets.map((t) => t % width);
  const ty = targets.map((t) => Math.floor(t / width));
  const h = (v: number): number => {
    if (hCache[v] >= 0) return hCache[v];
    const x = v % width;
    const y = Math.floor(v / width);
    let best = Infinity;
    for (let k = 0; k < tx.length; k++) {
      const d = Math.abs(x - tx[k]) + Math.abs(y - ty[k]);
      if (d < best) best = d;
    }
    hCache[v] = best * weights.distance;
    return hCache[v];
  };

  const heap = new MinHeap();
  for (const s of [...sources].sort((a, b) => a - b)) {
    if (isTarget[s] || blocked[s]) continue;
    const c = nodeUseCost(problem, state, s, 'E', params);
    if (!Number.isFinite(c)) continue;
    const id = encode(s, NONE, 0, 1);
    if (c < g[id]) {
      g[id] = c;
      heap.push(c + h(s), id);
    }
  }

  while (heap.size > 0) {
    const id = heap.pop()!.value;
    if (closed[id]) continue;
    closed[id] = 1;
    if (id >= STATES) return { path: reconstruct(parent, id, STATES), cost: g[id] };

    const v = Math.floor(id / STATES_PER_NODE);
    const dir = Math.floor(id / 4) % 5;
    const long = Math.floor(id / 2) & 1;
    const first = id & 1;
    const x = v % width;
    const y = Math.floor(v / width);

    for (let nd = 0; nd < 4; nd++) {
      if (dir !== NONE && nd === (dir + 2) % 4) continue;
      const nx = x + DX[nd];
      const ny = y + DY[nd];
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const w = ny * width + nx;
      if (blocked[w]) continue;

      let cost = g[id] + weights.distance;
      let nLong = 0;
      let nFirst = 1;
      if (dir !== NONE) {
        if (nd === dir) {
          cost += nodeUseCost(problem, state, v, nd % 2 === 1 ? 'H' : 'V', params);
          nLong = 1;
          nFirst = first;
        } else {
          cost += nodeUseCost(problem, state, v, 'T', params) + weights.bend;
          if (!long && !first) cost += weights.aesthetic;
          nLong = 0;
          nFirst = 0;
        }
      }
      if (!Number.isFinite(cost)) continue;

      if (isTarget[w]) {
        const goal = STATES + w;
        const goalCost = cost + nodeUseCost(problem, state, w, 'E', params);
        if (goalCost < g[goal]) {
          g[goal] = goalCost;
          parent[goal] = id;
          heap.push(goalCost, goal);
        }
      }
      const next = encode(w, nd, nLong, nFirst);
      if (cost < g[next]) {
        g[next] = cost;
        parent[next] = id;
        heap.push(cost + h(w), next);
      }
    }
  }
  return null;
}

function reconstruct(parent: Int32Array, goal: number, STATES: number): number[] {
  const nodes = [goal - STATES];
  for (let cur = parent[goal]; cur !== -1; cur = parent[cur]) nodes.push(Math.floor(cur / STATES_PER_NODE));
  return nodes.reverse();
}

/** 用與 findWire 完全相同的成本定義計算一條既有路徑的成本。 */
export function evaluatePath(problem: RoutingProblem, state: RouteState, path: number[], params: SearchParams): number {
  const weights = params.weights;
  let cost = nodeUseCost(problem, state, path[0], 'E', params);
  let dir = NONE;
  let long = 0;
  let first = 1;
  for (let k = 1; k < path.length; k++) {
    const nd = directionBetween(path[k - 1], path[k], problem.width);
    cost += weights.distance;
    if (dir !== NONE) {
      if (nd === dir) {
        cost += nodeUseCost(problem, state, path[k - 1], nd % 2 === 1 ? 'H' : 'V', params);
        long = 1;
      } else {
        cost += nodeUseCost(problem, state, path[k - 1], 'T', params) + weights.bend;
        if (!long && !first) cost += weights.aesthetic;
        long = 0;
        first = 0;
      }
    }
    dir = nd;
  }
  return cost + nodeUseCost(problem, state, path[path.length - 1], 'E', params);
}
```

- [ ] **Step 6: 確認測試通過**

Run: `npx vitest run tests/routing/astar.test.ts`
Expected: PASS（13 tests）

Run: `npm run typecheck`
Expected: 無錯誤。

- [ ] **Step 7: Commit**

```bash
git add src/core/routing/minHeap.ts src/core/routing/routeState.ts src/core/routing/astar.ts tests/routing/astar.test.ts
git commit -m "feat: add multi-source multi-target A* router"
```

---

### Task 10: 單一 Net 的生成樹

**Files:**
- Create: `src/core/routing/netTree.ts`
- Test: `tests/routing/netTree.test.ts`

**Interfaces:**
- Consumes: `findWire`、`SearchParams`（Task 9）；`RouteState`（Task 9）；`RoutingProblem`、`RoutingNet`、`describeGroup`、`buildRoutingProblem`（Task 8）；`FailureReason`（Task 8）
- Produces:
  - `type NetRouteResult = { ok: true; cost: number; paths: number[][] } | { ok: false; reason: FailureReason; detail: string }`
  - `routeNet(problem, state, net: RoutingNet, params: SearchParams): NetRouteResult`（以 `net.clusters` 為單位建樹，從 `net.startCluster` 開始；呼叫前 state 裡不能有這個 Net 的線；成功時線已加入 state，ID 為 `${netId}#${k}`；失敗時這個 Net 的線全部移除）

- [ ] **Step 1: 寫失敗的測試**

`tests/routing/netTree.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import type { SearchParams } from '../../src/core/routing/astar';
import { DEFAULT_ROUTING_CONFIG } from '../../src/core/routing/config';
import { routeNet } from '../../src/core/routing/netTree';
import { buildRoutingProblem } from '../../src/core/routing/problem';
import { RouteState } from '../../src/core/routing/routeState';
import { circuit, comp, wire } from '../fixtures/build';

const hard: SearchParams = { weights: DEFAULT_ROUTING_CONFIG.weights, overlap: { kind: 'hard' } };

describe('routeNet', () => {
  it('connects three groups with two wires that end in the right groups', () => {
    const c = circuit(
      [comp('D1', 'led', 'C10'), comp('D2', 'led', 'C30'), comp('D3', 'led', 'H20')],
      [wire('w1', 'A10', 'A30'), wire('w2', 'B30', [30, 9], 'J20')],
    );
    const problem = buildRoutingProblem(c, DEFAULT_ROUTING_CONFIG);
    const net = problem.nets.find((n) => n.terminalGroups.length === 3)!;
    const state = new RouteState(problem.size);
    const result = routeNet(problem, state, net, hard);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.paths).toHaveLength(2);
    const reached = new Set(result.paths.flatMap((path) => [problem.groupAt[path[0]], problem.groupAt[path[path.length - 1]]]));
    expect([...reached].sort()).toEqual(net.terminalGroups);
    expect(state.wiresOf(net.netId).map((w) => w.id)).toEqual([`${net.netId}#0`, `${net.netId}#1`]);
  });

  it('fails with NO_FREE_HOLE when a terminal group is full', () => {
    const c = circuit(
      [
        comp('R1', 'resistor', 'A20', { rotation: 90, span: 1 }),
        comp('R2', 'resistor', 'C20', { rotation: 90, span: 1 }),
        comp('D1', 'led', 'E20'),
        comp('D2', 'led', 'C40'),
      ],
      [wire('w1', 'A20', 'A40')],
    );
    const problem = buildRoutingProblem(c, DEFAULT_ROUTING_CONFIG);
    const net = problem.nets.find((n) => n.terminalGroups.includes('b1:c20-top'))!;
    const result = routeNet(problem, new RouteState(problem.size), net, hard);
    expect(result).toEqual({ ok: false, reason: 'NO_FREE_HOLE', detail: '第 20 欄上半（A–E）沒有空孔可以接線' });
  });

  it('fails with UNROUTABLE and leaves no wires behind when a group is walled in', () => {
    const c = circuit([comp('D1', 'led', 'C10'), comp('D2', 'led', 'C30')], [wire('w1', 'A10', 'A30')]);
    const problem = buildRoutingProblem(c, DEFAULT_ROUTING_CONFIG);
    const net = problem.nets.find((n) => n.terminalGroups.length === 2)!;
    const holes = problem.freeHoles.get('b1:c30-top')!;
    for (const h of holes) {
      problem.blocked[h - 1] = 1;
      problem.blocked[h + 1] = 1;
    }
    problem.blocked[holes[0] - problem.width] = 1;
    problem.blocked[holes[holes.length - 1] + problem.width] = 1;
    const state = new RouteState(problem.size);
    const result = routeNet(problem, state, net, hard);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('UNROUTABLE');
    expect(state.wiresOf(net.netId)).toEqual([]);
  });
});
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run tests/routing/netTree.test.ts`
Expected: FAIL，找不到 `netTree` 模組。

- [ ] **Step 3: 實作**

`src/core/routing/netTree.ts`：

```ts
import type { FailureReason } from '../../types/routing';
import { findWire, type SearchParams } from './astar';
import { describeGroup, type RoutingNet, type RoutingProblem } from './problem';
import type { RouteState } from './routeState';

export type NetRouteResult =
  | { ok: true; cost: number; paths: number[][] }
  | { ok: false; reason: FailureReason; detail: string };

/**
 * 用 Prim 式貪婪法把 net 的終端群組簇連成一棵樹：每次找出「已連通部分 → 任一未連通簇」中最便宜的一條線。
 * 呼叫前 state 裡不能有這個 net 的線。
 */
export function routeNet(problem: RoutingProblem, state: RouteState, net: RoutingNet, params: SearchParams): NetRouteResult {
  const holesOf = (cluster: string[]) => cluster.flatMap((g) => problem.freeHoles.get(g) ?? []);
  const describe = (cluster: string[]) => cluster.map(describeGroup).join('＋');
  const full = net.clusters.find((cl) => holesOf(cl).length === 0);
  if (full) return { ok: false, reason: 'NO_FREE_HOLE', detail: `${describe(full)}沒有空孔可以接線` };

  const clusterOf = new Map<string, number>();
  net.clusters.forEach((cl, i) => cl.forEach((g) => clusterOf.set(g, i)));
  const connected = new Set([net.startCluster]);
  const remaining = new Set(net.clusters.map((_, i) => i).filter((i) => i !== net.startCluster));
  const paths: number[][] = [];
  let cost = 0;
  while (remaining.size > 0) {
    const sources = [...connected].flatMap((i) => holesOf(net.clusters[i]));
    const targets = [...remaining].flatMap((i) => holesOf(net.clusters[i]));
    const found = findWire(problem, state, sources, targets, params);
    if (!found) {
      state.removeNet(net.netId);
      const missing = [...remaining].map((i) => describe(net.clusters[i])).join('、');
      return { ok: false, reason: 'UNROUTABLE', detail: `${net.netId} 無法連到 ${missing}` };
    }
    state.addWire({ id: `${net.netId}#${paths.length}`, netId: net.netId, path: found.path });
    paths.push(found.path);
    cost += found.cost;
    const reached = clusterOf.get(problem.groupAt[found.path[found.path.length - 1]]!)!;
    connected.add(reached);
    remaining.delete(reached);
  }
  return { ok: true, cost, paths };
}
```

- [ ] **Step 4: 確認測試通過**

Run: `npx vitest run tests/routing/netTree.test.ts`
Expected: PASS（3 tests）

Run: `npm run typecheck`
Expected: 無錯誤。

- [ ] **Step 5: Commit**

```bash
git add src/core/routing/netTree.ts tests/routing/netTree.test.ts
git commit -m "feat: route one net as a spanning tree of wires"
```

---

### Task 11: 合法性檢查（最後一道防線）

**Files:**
- Create: `src/core/routing/legality.ts`
- Test: `tests/routing/legality.test.ts`

**Interfaces:**
- Consumes: `indexCircuit`、`nodeAt`、`pushTo`、`CircuitIndex`（Task 4）；`extractNetsWith`、`terminalGroupIds`、`compareIds`（Task 5）；`pathIssues`、`analyzeWireInteractions`（Task 6）；`nodeIdOf`（Task 1）；`LegalityViolation`（Task 8）
- Produces:
  - `checkRoutingLegality(circuit: Circuit, wires: Wire[]): LegalityViolation[]`（基準 Net 一律是 `extractNets(circuit)`，也就是用 `circuit.wires` 分析的結果）
  - `mismatchedNets(index: CircuitIndex, reference: Net[], wires: Wire[]): string[]`（終端群組沒被連成同一個 Net、或和別的 Net 併在一起的基準 Net ID，已排序）

這個模組**不得**呼叫任何佈線程式（`astar`、`netTree`、`autoRoute`），必須獨立判斷。

- [ ] **Step 1: 寫失敗的測試**

`tests/routing/legality.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { indexCircuit } from '../../src/core/circuit/circuitIndex';
import { extractNets } from '../../src/core/circuit/nets';
import { checkRoutingLegality, mismatchedNets } from '../../src/core/routing/legality';
import type { Wire } from '../../src/types/circuit';
import { circuit, comp, pt, wire, type Where } from '../fixtures/build';

// NET_1 = D1 陽極（第 10 欄上半）↔ D2 陽極（第 30 欄上半）；其他腳各自一個 Net。
const base = circuit([comp('D1', 'led', 'C10'), comp('D2', 'led', 'C30'), comp('D3', 'led', 'C50')], [wire('u1', 'A10', 'A30')]);
const NET = 'NET_1';
const auto = (id: string, ...points: Where[]): Wire => ({ ...wire(id, ...points), source: 'auto', netId: NET });
const codes = (wires: Wire[]) => checkRoutingLegality(base, wires).map((v) => v.code);

describe('checkRoutingLegality', () => {
  it('uses the expected reference net names', () => {
    expect(extractNets(base).map((n) => n.id)).toEqual(['NET_1', 'NET_2', 'NET_3', 'NET_4', 'NET_5']);
  });

  it('accepts a clean replacement wire', () => {
    expect(codes([auto('a1', 'B10', 'B30')])).toEqual([]);
  });

  it('flags broken paths', () => {
    const diagonal: Wire = { ...auto('a1', 'B10', 'B30'), path: [pt(10, 5), pt(11, 6)] };
    expect(codes([diagonal])).toContain('PATH_INVALID');
  });

  it('flags endpoints on pins, in a foreign group, shared, or without a net', () => {
    expect(codes([auto('a1', 'C10', 'B30')])).toContain('ENDPOINT_INVALID');
    expect(codes([auto('a1', 'B10', 'B50')])).toContain('ENDPOINT_INVALID');
    expect(codes([auto('a1', 'B10', 'B30'), auto('a2', 'B10', [10, 3], [30, 3], 'A30')])).toContain('ENDPOINT_INVALID');
    expect(codes([{ ...auto('a1', 'B10', 'B30'), netId: undefined }])).toContain('ENDPOINT_INVALID');
  });

  it('flags wires that pass over a pin', () => {
    expect(codes([auto('a1', 'B10', [11, 5], [11, 7], 'D30')])).toContain('THROUGH_OBSTACLE');
  });

  it('flags overlapping wires', () => {
    expect(codes([auto('a1', 'B10', 'B30'), auto('a2', 'A10', [12, 4], [12, 5], [20, 5], [20, 4], 'A30')])).toContain('OVERLAP');
  });

  it('flags missing and merged connections', () => {
    expect(codes([])).toContain('NET_MISMATCH');
    const index = indexCircuit(base);
    const reference = extractNets(base);
    expect(mismatchedNets(index, reference, [])).toEqual(['NET_1']);
    const merging: Wire[] = [auto('a1', 'B10', 'B30'), { ...auto('a2', 'B50', [50, 3], [31, 3], 'A31'), netId: 'NET_4' }];
    expect(mismatchedNets(index, reference, merging)).toEqual(['NET_3', 'NET_4']);
  });
});
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run tests/routing/legality.test.ts`
Expected: FAIL，找不到 `legality` 模組。

- [ ] **Step 3: 實作**

`src/core/routing/legality.ts`：

```ts
import { nodeIdOf } from '../breadboard/naming';
import { indexCircuit, nodeAt, pushTo, type CircuitIndex } from '../circuit/circuitIndex';
import { compareIds, extractNetsWith, terminalGroupIds } from '../circuit/nets';
import { analyzeWireInteractions, pathIssues } from '../circuit/wireGeometry';
import type { Circuit, Net, Wire } from '../../types/circuit';
import type { GridPoint } from '../../types/geometry';
import type { LegalityViolation } from '../../types/routing';

/** 獨立於佈線器的檢查：任何一項不通過，autoRoute 就不能輸出那個 Net 的線。 */
export function checkRoutingLegality(circuit: Circuit, wires: Wire[]): LegalityViolation[] {
  const index = indexCircuit(circuit);
  const reference = extractNetsWith(index, circuit.wires);
  const terminals = new Map(reference.map((net) => [net.id, new Set(terminalGroupIds(net, index))]));
  const isOnBoard = (p: GridPoint) => nodeAt(index, p) !== undefined;
  const endsAt = new Map<string, string[]>();
  for (const w of wires) for (const p of [w.start, w.end]) pushTo(endsAt, nodeIdOf(p), w.id);
  const out: LegalityViolation[] = [];

  for (const w of wires) {
    const netIds = w.netId ? [w.netId] : [];
    const issues = pathIssues(w, isOnBoard);
    if (issues.length > 0) out.push({ code: 'PATH_INVALID', wireIds: [w.id], netIds, detail: issues.join(', ') });

    const allowed = w.netId ? terminals.get(w.netId) : undefined;
    for (const end of [w.start, w.end]) {
      const node = nodeAt(index, end);
      const id = nodeIdOf(end);
      const ok =
        node !== undefined &&
        node.kind === 'hole' &&
        node.groupId !== null &&
        allowed !== undefined &&
        allowed.has(node.groupId) &&
        !index.pinsAt.has(id) &&
        !index.bodiesAt.has(id) &&
        (endsAt.get(id)?.length ?? 0) === 1;
      if (!ok) out.push({ code: 'ENDPOINT_INVALID', wireIds: [w.id], netIds, detail: node?.name ?? id });
    }

    const obstacle = w.path.slice(1, -1).find((p) => {
      const id = nodeIdOf(p);
      return index.pinsAt.has(id) || index.bodiesAt.has(id) || endsAt.has(id);
    });
    if (obstacle) out.push({ code: 'THROUGH_OBSTACLE', wireIds: [w.id], netIds, detail: nodeIdOf(obstacle) });
  }

  const netOfWire = new Map(wires.map((w) => [w.id, w.netId]));
  for (const o of analyzeWireInteractions(wires).overlaps) {
    const netIds = [...new Set(o.wireIds.map((id) => netOfWire.get(id)).filter((n): n is string => n !== undefined))].sort(compareIds);
    out.push({ code: 'OVERLAP', wireIds: [...o.wireIds], netIds, detail: o.nodeId });
  }

  for (const netId of mismatchedNets(index, reference, wires)) {
    out.push({
      code: 'NET_MISMATCH',
      wireIds: wires.filter((w) => w.netId === netId).map((w) => w.id),
      netIds: [netId],
      detail: `${netId} 的連接關係與原電路不同`,
    });
  }
  return out;
}

/** 用「元件 + wires」重新分析 Net，回傳終端群組沒連在一起、或和別的 Net 併在一起的基準 Net。 */
export function mismatchedNets(index: CircuitIndex, reference: Net[], wires: Wire[]): string[] {
  const produced = extractNetsWith(index, wires);
  const producedOf = new Map<string, string>();
  for (const net of produced) for (const g of net.groupIds) producedOf.set(g, net.id);

  const bad = new Set<string>();
  const owner = new Map<string, string>();
  for (const net of reference) {
    const ids = new Set(terminalGroupIds(net, index).map((g) => producedOf.get(g) ?? `missing:${g}`));
    if (ids.size > 1) bad.add(net.id);
    for (const pid of ids) {
      const previous = owner.get(pid);
      if (previous !== undefined && previous !== net.id) {
        bad.add(previous);
        bad.add(net.id);
      } else {
        owner.set(pid, net.id);
      }
    }
  }
  return [...bad].sort(compareIds);
}
```

- [ ] **Step 4: 確認測試通過**

Run: `npx vitest run tests/routing/legality.test.ts`
Expected: PASS（7 tests）

Run: `npm run typecheck`
Expected: 無錯誤。

- [ ] **Step 5: Commit**

```bash
git add src/core/routing/legality.ts tests/routing/legality.test.ts
git commit -m "feat: add independent routing legality checker"
```

---

### Task 12: 統計、Routing Score 與套用結果

**Files:**
- Create: `src/core/routing/metrics.ts`, `src/core/routing/score.ts`, `src/core/routing/apply.ts`
- Test: `tests/routing/score.test.ts`

**Interfaces:**
- Consumes: `analyzeWireInteractions`、`countBends`、`countShortJogs`、`pathIssues`（Task 6）；`mismatchedNets`（Task 11）；`mergeConfig`（Task 8）；`indexCircuit`、`nodeAt`、`groupInfo`（Task 4）；`extractNetsWith`、`terminalClusters`（Task 5）；`nodeIdOf`、`parseNodeId`（Task 1）
- Produces:
  - `computeMetrics(wires: Wire[]): RoutingMetrics`
  - `netLowerBound(index: CircuitIndex, clusters: string[][]): number`（輸入是 `terminalClusters` 的結果）
  - `scoreRouting(circuit: Circuit, wires?: Wire[], overrides?: DeepPartial<RoutingConfig>): { metrics: RoutingMetrics; score: number }`（0–100，小數一位）
  - `applyRouting(circuit: Circuit, result: RoutingResult): Circuit`（只接受 `success`，否則丟出 `Only a successful routing result can be applied`）

- [ ] **Step 1: 寫失敗的測試**

`tests/routing/score.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { applyRouting } from '../../src/core/routing/apply';
import { computeMetrics } from '../../src/core/routing/metrics';
import { scoreRouting } from '../../src/core/routing/score';
import type { RoutingResult } from '../../src/types/routing';
import { circuit, comp, pt, wire } from '../fixtures/build';

// 兩顆 LED 的陽極（第 10、30 欄上半）要接在一起；u1 是最短的直線。
const c = circuit([comp('D1', 'led', 'C10'), comp('D2', 'led', 'C30')], [wire('u1', 'B10', 'B30')]);

describe('computeMetrics', () => {
  it('counts wires, length, bends, crossings, overlaps and short jogs', () => {
    expect(computeMetrics([wire('a', 'A10', 'A30'), wire('b', [20, 3], [20, 6])])).toEqual({
      wireCount: 2,
      totalLength: 23,
      bends: 0,
      crossings: 1,
      overlaps: 0,
      shortJogs: 0,
    });
  });
});

describe('scoreRouting', () => {
  it('gives 100 to the shortest straight wiring', () => {
    expect(scoreRouting(c).score).toBe(100);
  });

  it('deducts for a detour and its extra bend', () => {
    expect(scoreRouting(c, [wire('u1', 'B10', [10, 3], [30, 3], 'B30')]).score).toBe(95.2);
  });

  it('deducts 8 per crossing', () => {
    const crossed = circuit(
      [comp('D1', 'led', 'C10'), comp('D2', 'led', 'C30'), comp('V1', 'vcc', 'T+5'), comp('D3', 'led', 'E21')],
      [wire('u1', 'B10', 'B30'), wire('u2', 'T+21', 'D21')],
    );
    expect(scoreRouting(crossed).score).toBe(89.6);
  });

  it('treats a wire through a component as an overlap', () => {
    const blocked = circuit(
      [comp('D1', 'led', 'C10'), comp('D2', 'led', 'C30'), comp('D3', 'led', 'B20', { rotation: 90 })],
      [wire('u1', 'B10', 'B30')],
    );
    expect(scoreRouting(blocked).score).toBe(70);
  });

  it('scores 0 when a connection is missing or a wire is broken', () => {
    expect(scoreRouting(c, []).score).toBe(0);
    expect(scoreRouting(c, [{ ...wire('u1', 'B10', 'B30'), path: [pt(10, 5), pt(11, 6)] }]).score).toBe(0);
  });

  it('scores an empty circuit as 100', () => {
    expect(scoreRouting(circuit([])).score).toBe(100);
  });
});

describe('applyRouting', () => {
  const result: RoutingResult = {
    status: 'success',
    message: 'Standard Routing Complete',
    wires: [{ ...wire('a1', 'A10', 'A30'), source: 'auto', netId: 'NET_1' }],
    failedNets: [],
    metrics: computeMetrics([]),
    score: 100,
    stats: { iterations: 1, elapsedMs: 0 },
  };

  it('replaces the wires without touching the original circuit', () => {
    const applied = applyRouting(c, result);
    expect(applied.wires.map((w) => w.id)).toEqual(['a1']);
    expect(c.wires.map((w) => w.id)).toEqual(['u1']);
    expect(applied.wires[0]).not.toBe(result.wires[0]);
  });

  it('refuses partial results', () => {
    expect(() => applyRouting(c, { ...result, status: 'partial' })).toThrow('Only a successful routing result can be applied');
  });
});
```

數字的由來：

- 繞路：長度 24（理論下限 20）→ 20 × (1 − 20/24) = 3.33；轉彎 2、導線 1 → 多 1 個轉彎 × 1.5；100 − 4.83 = 95.2。
- 交叉：理論下限 20 + 2 = 22、實際 25 → 20 × 0.12 = 2.4；交叉 1 × 8；100 − 10.4 = 89.6。
- 穿過元件：D3 的腳在 B20，u1 經過它 → 視為 1 處重疊 × 30 → 70。

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run tests/routing/score.test.ts`
Expected: FAIL，找不到 `apply` 模組。

- [ ] **Step 3: 實作**

`src/core/routing/metrics.ts`：

```ts
import type { Wire } from '../../types/circuit';
import type { RoutingMetrics } from '../../types/routing';
import { analyzeWireInteractions, countBends, countShortJogs } from '../circuit/wireGeometry';

export function computeMetrics(wires: Wire[]): RoutingMetrics {
  const { overlaps, crossings } = analyzeWireInteractions(wires);
  return {
    wireCount: wires.length,
    totalLength: wires.reduce((sum, w) => sum + Math.max(0, w.path.length - 1), 0),
    bends: wires.reduce((sum, w) => sum + countBends(w.path), 0),
    crossings: crossings.length,
    overlaps: overlaps.length,
    shortJogs: wires.reduce((sum, w) => sum + countShortJogs(w.path), 0),
  };
}
```

`src/core/routing/score.ts`：

```ts
import { nodeIdOf, parseNodeId } from '../breadboard/naming';
import { groupInfo, indexCircuit, nodeAt, type CircuitIndex } from '../circuit/circuitIndex';
import { extractNetsWith, terminalClusters } from '../circuit/nets';
import { pathIssues } from '../circuit/wireGeometry';
import type { Circuit, Wire } from '../../types/circuit';
import type { GridPoint } from '../../types/geometry';
import type { DeepPartial, RoutingConfig, RoutingMetrics } from '../../types/routing';
import { mergeConfig } from './config';
import { mismatchedNets } from './legality';
import { computeMetrics } from './metrics';

function holePoints(index: CircuitIndex, groupId: string): GridPoint[] {
  const all = (groupInfo(index, groupId)?.nodeIds ?? []).map(parseNodeId);
  const free = all.filter((p) => {
    const id = nodeIdOf(p);
    return !index.pinsAt.has(id) && !index.bodiesAt.has(id);
  });
  return free.length > 0 ? free : all;
}

function groupDistance(a: GridPoint[], b: GridPoint[]): number {
  let best = Infinity;
  for (const p of a) for (const q of b) best = Math.min(best, Math.abs(p.x - q.x) + Math.abs(p.y - q.y));
  return best;
}

/** 不考慮障礙物時，把各簇連成一棵樹的最短總長（Prim 最小生成樹）。 */
export function netLowerBound(index: CircuitIndex, clusters: string[][]): number {
  if (clusters.length < 2) return 0;
  const points = clusters.map((cl) => cl.flatMap((g) => holePoints(index, g)));
  const inTree = new Array<boolean>(clusters.length).fill(false);
  const best = new Array<number>(clusters.length).fill(Infinity);
  best[0] = 0;
  let total = 0;
  for (let step = 0; step < clusters.length; step++) {
    let pick = -1;
    for (let i = 0; i < clusters.length; i++) if (!inTree[i] && (pick < 0 || best[i] < best[pick])) pick = i;
    inTree[pick] = true;
    total += best[pick];
    for (let j = 0; j < clusters.length; j++) {
      if (!inTree[j]) best[j] = Math.min(best[j], groupDistance(points[pick], points[j]));
    }
  }
  return total;
}

/** 以 circuit.wires 分析出的 Net 為基準，替任何一組導線評分（0–100）。 */
export function scoreRouting(
  circuit: Circuit,
  wires: Wire[] = circuit.wires,
  overrides?: DeepPartial<RoutingConfig>,
): { metrics: RoutingMetrics; score: number } {
  const weights = mergeConfig(overrides).scoring;
  const index = indexCircuit(circuit);
  const metrics = computeMetrics(wires);
  const isOnBoard = (p: GridPoint) => nodeAt(index, p) !== undefined;
  const broken = wires.some(
    (w) => pathIssues(w, isOnBoard).length > 0 || [w.start, w.end].some((p) => nodeAt(index, p)?.kind !== 'hole'),
  );
  const reference = extractNetsWith(index, circuit.wires);
  if (broken || mismatchedNets(index, reference, wires).length > 0) return { metrics, score: 0 };

  const obstacleHits = wires.filter((w) =>
    w.path.slice(1, -1).some((p) => {
      const id = nodeIdOf(p);
      return index.pinsAt.has(id) || index.bodiesAt.has(id);
    }),
  ).length;
  const lowerBound = reference.reduce((sum, net) => sum + netLowerBound(index, terminalClusters(net, index)), 0);
  const efficiency = metrics.totalLength === 0 ? 1 : Math.min(1, lowerBound / metrics.totalLength);
  const penalty =
    (metrics.overlaps + obstacleHits) * weights.overlap +
    metrics.crossings * weights.crossing +
    weights.lengthMax * (1 - efficiency) +
    Math.min(weights.extraBendMax, Math.max(0, metrics.bends - metrics.wireCount) * weights.extraBend) +
    Math.min(weights.shortJogMax, metrics.shortJogs * weights.shortJog);
  return { metrics, score: Math.round(Math.max(0, Math.min(100, 100 - penalty)) * 10) / 10 };
}
```

`src/core/routing/apply.ts`：

```ts
import type { Circuit } from '../../types/circuit';
import type { RoutingResult } from '../../types/routing';

/** 回傳新的 Circuit，導線全部換成佈線結果；原本的 circuit 不會被修改。 */
export function applyRouting(circuit: Circuit, result: RoutingResult): Circuit {
  if (result.status !== 'success') throw new Error('Only a successful routing result can be applied');
  return {
    ...circuit,
    wires: result.wires.map((w) => ({
      ...w,
      start: { ...w.start },
      end: { ...w.end },
      path: w.path.map((p) => ({ ...p })),
    })),
  };
}
```

- [ ] **Step 4: 確認測試通過**

Run: `npx vitest run tests/routing/score.test.ts`
Expected: PASS（9 tests）

Run: `npm run typecheck`
Expected: 無錯誤。

- [ ] **Step 5: Commit**

```bash
git add src/core/routing/metrics.ts src/core/routing/score.ts src/core/routing/apply.ts tests/routing/score.test.ts
git commit -m "feat: add routing metrics, score and applyRouting"
```

---

### Task 13: autoRoute（協商迴圈、改善階段、結果組裝）

**Files:**
- Create: `src/core/routing/autoRoute.ts`
- Test: `tests/routing/autoRoute.test.ts`

**Interfaces:**
- Consumes: `mergeConfig`（Task 8）；`buildRoutingProblem`、`toPoint`、`RoutingNet`、`RoutingProblem`（Task 8）；`RouteState`、`StoredWire`（Task 9）；`evaluatePath`、`SearchParams`（Task 9）；`routeNet`（Task 10）；`checkRoutingLegality`（Task 11）；`scoreRouting`（Task 12）；`compareIds`（Task 5）
- Produces: `autoRoute(circuit: Circuit, overrides?: DeepPartial<RoutingConfig>): RoutingResult`
  - 輸出導線 ID 為 `w_${netId}_${k}`（k 從 1 起算），`source: 'auto'`、帶 `netId` 與 Net 顏色
  - `status`：沒有失敗 → `success`；部分失敗 → `partial`；需要佈線的 Net 全部失敗 → `failed`

- [ ] **Step 1: 寫失敗的測試**

`tests/routing/autoRoute.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { nodeIdOf } from '../../src/core/breadboard/naming';
import { validateCircuit } from '../../src/core/circuit/validate';
import { applyRouting } from '../../src/core/routing/apply';
import { autoRoute } from '../../src/core/routing/autoRoute';
import { GROUND_COLOR, POWER_COLOR } from '../../src/core/routing/colors';
import { checkRoutingLegality } from '../../src/core/routing/legality';
import type { RoutingResult } from '../../src/types/routing';
import { circuit, comp, wire } from '../fixtures/build';
import { acceptanceCircuit } from '../fixtures/circuits';

const withoutTiming = (r: RoutingResult) => ({ ...r, stats: { ...r.stats, elapsedMs: 0 } });

/** 第 20 欄上半五個孔都插滿了腳，接不出任何線。 */
const fullColumn = () => [
  comp('R1', 'resistor', 'A20', { rotation: 90, span: 1 }),
  comp('R2', 'resistor', 'C20', { rotation: 90, span: 1 }),
  comp('D1', 'led', 'E20'),
  comp('D2', 'led', 'C40'),
];

describe('autoRoute', () => {
  it('routes the acceptance circuit legally and deterministically', () => {
    const c = acceptanceCircuit();
    const r = autoRoute(c);
    expect(r.status).toBe('success');
    expect(r.message).toBe('Standard Routing Complete');
    expect(r.failedNets).toEqual([]);
    expect(checkRoutingLegality(c, r.wires)).toEqual([]);
    expect(r.metrics.overlaps).toBe(0);
    expect(r.wires.every((w) => w.source === 'auto' && w.netId !== undefined)).toBe(true);
    expect(r.wires.filter((w) => w.netId === 'VCC').every((w) => w.color === POWER_COLOR)).toBe(true);
    expect(r.wires.filter((w) => w.netId === 'GND').every((w) => w.color === GROUND_COLOR)).toBe(true);
    expect(withoutTiming(autoRoute(c))).toEqual(withoutTiming(r));
  });

  it('uses one wire per extra terminal group', () => {
    // VCC 2 群組、GND 5 群組、1Y 2 群組、R1→LED 2 群組 → 1 + 4 + 1 + 1
    expect(autoRoute(acceptanceCircuit()).metrics.wireCount).toBe(7);
  });

  it('reports "No valid routing solution." when a group has no free hole', () => {
    const r = autoRoute(circuit(fullColumn(), [wire('w1', 'A20', 'A40')]));
    expect(r.status).toBe('failed');
    expect(r.message).toBe('No valid routing solution.');
    expect(r.failedNets).toEqual([expect.objectContaining({ reason: 'NO_FREE_HOLE' })]);
    expect(r.wires).toEqual([]);
    expect(r.score).toBe(0);
  });

  it('reports partial results and keeps only the successful nets', () => {
    const c = circuit(
      [...fullColumn(), comp('D3', 'led', 'H10'), comp('D4', 'led', 'H50')],
      [wire('w1', 'A20', 'A40'), wire('w2', 'J10', 'J50')],
    );
    const r = autoRoute(c);
    expect(r.status).toBe('partial');
    expect(r.failedNets.map((f) => f.reason)).toEqual(['NO_FREE_HOLE']);
    expect(r.wires).toHaveLength(1);
    expect(r.score).toBe(0);
  });

  it('returns success with no wires for an empty circuit', () => {
    expect(autoRoute(circuit([]))).toMatchObject({ status: 'success', wires: [], failedNets: [], score: 100 });
    expect(validateCircuit(circuit([])).map((e) => e.code)).toEqual(['CIRCUIT_VALID']);
  });

  it('still routes when the user plugged wires into pin holes', () => {
    const c = circuit([comp('D1', 'led', 'C10'), comp('D2', 'led', 'C30')], [wire('u1', 'C10', 'C30')]);
    const r = autoRoute(c);
    expect(r.status).toBe('success');
    expect(r.wires).toHaveLength(1);
    expect(checkRoutingLegality(c, r.wires)).toEqual([]);
  });

  it('never shares an endpoint hole, even when a group has a single free hole', () => {
    // 第 20 欄上半只剩 E20 一個空孔，而且它在 3 群組 Net 的中間。
    const c = circuit(
      [
        comp('R1', 'resistor', 'A20', { rotation: 90, span: 1 }),
        comp('R2', 'resistor', 'C20', { rotation: 90, span: 1 }),
        comp('D1', 'led', 'C10'),
        comp('D2', 'led', 'C30'),
      ],
      [wire('u1', 'A10', 'B20'), wire('u2', 'D20', 'A30')],
    );
    const r = autoRoute(c);
    expect(r.status).toBe('success');
    const ends = r.wires.flatMap((w) => [nodeIdOf(w.start), nodeIdOf(w.end)]);
    expect(new Set(ends).size).toBe(ends.length);
    expect(checkRoutingLegality(c, r.wires)).toEqual([]);
  });

  it('produces a result that applyRouting accepts', () => {
    const c = acceptanceCircuit();
    expect(applyRouting(c, autoRoute(c)).wires.every((w) => w.source === 'auto')).toBe(true);
  });
});
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run tests/routing/autoRoute.test.ts`
Expected: FAIL，找不到 `autoRoute` 模組。

- [ ] **Step 3: 實作**

`src/core/routing/autoRoute.ts`：

```ts
import type { Circuit, Wire } from '../../types/circuit';
import type { DeepPartial, FailedNet, FailureReason, RoutingConfig, RoutingResult } from '../../types/routing';
import { compareIds } from '../circuit/nets';
import { evaluatePath, type SearchParams } from './astar';
import { mergeConfig } from './config';
import { checkRoutingLegality } from './legality';
import { routeNet } from './netTree';
import { buildRoutingProblem, toPoint, type RoutingNet, type RoutingProblem } from './problem';
import { RouteState, type StoredWire } from './routeState';
import { scoreRouting } from './score';

export function autoRoute(circuit: Circuit, overrides?: DeepPartial<RoutingConfig>): RoutingResult {
  const started = performance.now();
  const config = mergeConfig(overrides);
  const problem = buildRoutingProblem(circuit, config);
  const state = new RouteState(problem.size);
  const failed = new Map<string, FailedNet>();
  const outOfTime = () => performance.now() - started > config.timeBudgetMs;
  const markFailed = (net: RoutingNet, reason: FailureReason, detail: string) => {
    state.removeNet(net.netId);
    failed.set(net.netId, { netId: net.netId, reason, detail });
  };

  const routable = problem.nets.filter((n) => n.clusters.length >= 2);
  const hard: SearchParams = { weights: config.weights, overlap: { kind: 'hard' } };
  const negotiate = (presentFactor: number): SearchParams => ({
    weights: config.weights,
    overlap: { kind: 'negotiate', overlapBase: config.negotiation.overlapBase, presentFactor },
  });

  // 1. 協商迴圈：先允許重疊，逐輪提高重疊成本，只重排有衝突的 Net。
  let active = routable;
  let toRoute = routable;
  let presentFactor = config.negotiation.presentFactor;
  let iterations = 0;
  while (toRoute.length > 0) {
    iterations++;
    for (const net of toRoute) {
      state.removeNet(net.netId);
      const result = routeNet(problem, state, net, negotiate(presentFactor));
      if (!result.ok) markFailed(net, result.reason, result.detail);
    }
    active = active.filter((n) => !failed.has(n.netId));
    const conflicts = state.conflictedNodes();
    if (conflicts.length === 0) break;
    if (iterations >= config.negotiation.maxIterations || outOfTime()) {
      const reason: FailureReason = outOfTime() ? 'TIME_LIMIT' : 'ITERATION_LIMIT';
      active = dropConflicts(problem, state, active, hard, (net) =>
        markFailed(net, reason, `${net.netId} 在 ${iterations} 輪協商後仍無法避開其他導線`),
      );
      break;
    }
    for (const node of conflicts) state.history[node] += config.negotiation.historyIncrement;
    presentFactor *= config.negotiation.presentFactorGrowth;
    const touched = state.netsAt(conflicts);
    toRoute = active.filter((n) => touched.has(n.netId));
  }

  // 2. 改善階段：其他線一律不准碰，逐一重排，總成本下降才採用。
  for (let pass = 0; pass < config.negotiation.maxImprovementPasses && !outOfTime(); pass++) {
    let improved = false;
    for (const net of active) {
      if (outOfTime()) break;
      if (rerouteIfCheaper(problem, state, net, hard)) improved = true;
    }
    if (!improved) break;
  }

  // 3. 組裝結果，交給獨立的合法性檢查把關。
  let wires: Wire[] = active.flatMap((net) => state.wiresOf(net.netId).map((stored, k) => toWire(problem, stored, net, k)));
  const violations = checkRoutingLegality(circuit, wires);
  for (const netId of [...new Set(violations.flatMap((v) => v.netIds))].sort(compareIds)) {
    if (failed.has(netId)) continue;
    const codes = [...new Set(violations.filter((v) => v.netIds.includes(netId)).map((v) => v.code))].join(', ');
    failed.set(netId, { netId, reason: 'LEGALITY_CHECK', detail: `${netId} 沒有通過合法性檢查（${codes}）` });
  }
  wires = wires.filter((w) => w.netId !== undefined && !failed.has(w.netId));

  const failedNets = [...failed.values()].sort((a, b) => compareIds(a.netId, b.netId));
  const status = failedNets.length === 0 ? 'success' : failedNets.length < routable.length ? 'partial' : 'failed';
  const { metrics, score } = scoreRouting(circuit, wires, overrides);
  return {
    status,
    message: status === 'success' ? 'Standard Routing Complete' : 'No valid routing solution.',
    wires,
    failedNets,
    metrics,
    score,
    stats: { iterations, elapsedMs: Math.round(performance.now() - started) },
  };
}

/** 把優先序最低、仍有衝突的 Net 逐一拿掉直到沒有衝突，再用嚴格模式試著放回去（優先序高的先放）。 */
function dropConflicts(
  problem: RoutingProblem,
  state: RouteState,
  active: RoutingNet[],
  hard: SearchParams,
  onFail: (net: RoutingNet) => void,
): RoutingNet[] {
  const dropped: RoutingNet[] = [];
  for (let conflicts = state.conflictedNodes(); conflicts.length > 0; conflicts = state.conflictedNodes()) {
    const touched = state.netsAt(conflicts);
    const victim = [...active].reverse().find((n) => touched.has(n.netId) && !dropped.includes(n));
    if (!victim) break;
    state.removeNet(victim.netId);
    dropped.push(victim);
  }
  const failedIds = new Set<string>();
  for (const net of [...dropped].reverse()) {
    const result = routeNet(problem, state, net, hard);
    if (!result.ok) {
      onFail(net);
      failedIds.add(net.netId);
    }
  }
  return active.filter((n) => !failedIds.has(n.netId));
}

/** 在其他線都不准碰的條件下重排 net；總成本下降才保留，否則還原。 */
function rerouteIfCheaper(problem: RoutingProblem, state: RouteState, net: RoutingNet, hard: SearchParams): boolean {
  const old = state.wiresOf(net.netId).map((w) => ({ ...w, path: [...w.path] }));
  state.removeNet(net.netId);
  let oldCost = 0;
  for (const w of old) {
    oldCost += evaluatePath(problem, state, w.path, hard);
    state.addWire(w);
  }
  state.removeNet(net.netId);
  const result = routeNet(problem, state, net, hard);
  if (result.ok && result.cost < oldCost - 1e-9) return true;
  state.removeNet(net.netId);
  for (const w of old) state.addWire(w);
  return false;
}

function toWire(problem: RoutingProblem, stored: StoredWire, net: RoutingNet, k: number): Wire {
  const path = stored.path.map((i) => toPoint(problem, i));
  return {
    id: `w_${net.netId}_${k + 1}`,
    color: net.color,
    source: 'auto',
    netId: net.netId,
    start: path[0],
    end: path[path.length - 1],
    path,
  };
}
```

- [ ] **Step 4: 確認測試通過**

Run: `npx vitest run tests/routing/autoRoute.test.ts`
Expected: PASS（8 tests）

如果「acceptance circuit」或「single free hole」失敗，先用 superpowers:systematic-debugging 找出是哪個 Net、哪一輪出問題（可暫時印出 `r.failedNets` 與 `state.conflictedNodes()`），不要調鬆測試。

Run: `npm run typecheck`
Expected: 無錯誤。

- [ ] **Step 5: 跑全部測試**

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/core/routing/autoRoute.ts tests/routing/autoRoute.test.ts
git commit -m "feat: add negotiated-congestion autoRoute"
```

---

### Task 14: 固定測試電路、需求文件 Test 1–6、效能與校準

**Files:**
- Modify: `tests/fixtures/circuits.ts`（新增 `counterCircuit`、`adderCircuit`、`syntheticCircuit`）
- Test: `tests/routing/specTests.test.ts`、`tests/routing/fixtures.test.ts`、`tests/routing/performance.test.ts`
- Modify（只在校準時）：`src/core/routing/config.ts`

**Interfaces:**
- Consumes: `autoRoute`（Task 13）、`checkRoutingLegality`（Task 11）、`scoreRouting`（Task 12）、`stepDirection`、`analyzeWireInteractions`（Task 6）、`indexCircuit`（Task 4）、`nodeIdOf`（Task 1）、`circuit`/`comp`/`wire`（Task 4）
- Produces: `counterCircuit(): Circuit`、`adderCircuit(): Circuit`、`syntheticCircuit(): Circuit`（Task 15 的 demo 會用）

- [ ] **Step 1: 新增固定測試電路**

在 `tests/fixtures/circuits.ts` 檔尾加上（並把 import 改成 `import type { ComponentInstance } from '../../src/types/component';` 與既有的 import 並列）：

```ts
/** 74LS93 4 位元計數器：Push Button 當時脈，QA–QD 各接 電阻 → LED → GND。GND 上下兩條軌由使用者接通。 */
export function counterCircuit(): Circuit {
  return circuit(
    [
      comp('V1', 'vcc', 'B+3'),
      comp('G1', 'gnd', 'T-3'),
      comp('U1', '74LS93', 'F10'),
      comp('SW1', 'pushbutton', 'F4'),
      comp('R1', 'resistor', 'A25'),
      comp('R2', 'resistor', 'A31'),
      comp('R3', 'resistor', 'A37'),
      comp('R4', 'resistor', 'A43'),
      comp('D1', 'led', 'E29', { rotation: 90, span: 3 }),
      comp('D2', 'led', 'E35', { rotation: 90, span: 3 }),
      comp('D3', 'led', 'E41', { rotation: 90, span: 3 }),
      comp('D4', 'led', 'E47', { rotation: 90, span: 3 }),
    ],
    [
      wire('g0', 'T-61', 'B-61'), // 上下 GND 軌接通
      wire('v1', 'B+15', 'J14'), // VCC → U1 第 5 腳
      wire('g1', 'T-15', 'A14'), // GND → U1 第 10 腳
      wire('g2', 'B-11', 'J11'), // GND → R0(1)
      wire('g3', 'B-13', 'J12'), // GND → R0(2)
      wire('g4', 'T-4', 'A4'), // GND → 按鈕一側
      wire('g5', 'B-29', 'J29'), // LED 陰極 → GND
      wire('g6', 'B-35', 'J35'),
      wire('g7', 'B-41', 'J41'),
      wire('g8', 'B-47', 'J47'),
      wire('c1', 'A6', 'A10'), // 按鈕另一側 → CKA
      wire('q1', 'B12', 'B25'), // QA → R1
      wire('q2', 'D12', 'G10'), // QA → CKB（串成 4 位元）
      wire('q3', 'C15', 'C31'), // QB → R2
      wire('q4', 'D16', 'D37'), // QC → R3
      wire('q5', 'B13', 'B43'), // QD → R4
    ],
  );
}

/** 8 位元指撥開關 → 74LS283 4 位元加法器 → 5 顆 LED（S1–S4、C4）。開關另一側接 GND。 */
export function adderCircuit(): Circuit {
  return circuit(
    [
      comp('V1', 'vcc', 'T+3'),
      comp('G1', 'gnd', 'B-3'),
      comp('SW1', 'dipsw-8', 'F5'),
      comp('U1', '74LS283', 'F25'),
      comp('R1', 'resistor', 'A36'),
      comp('D1', 'led', 'C40'),
      comp('R2', 'resistor', 'A43'),
      comp('D2', 'led', 'C47'),
      comp('R3', 'resistor', 'A50'),
      comp('D3', 'led', 'C54'),
      comp('R4', 'resistor', 'A57'),
      comp('D4', 'led', 'C61'),
      comp('R5', 'resistor', 'J36'),
      comp('D5', 'led', 'H40'),
    ],
    [
      wire('g0', 'T-61', 'B-61'), // 上下 GND 軌接通
      wire('v1', 'T+25', 'A25'), // VCC → U1 第 16 腳
      wire('g1', 'B-5', 'J5'), // 開關下側 → GND
      wire('g2', 'B-6', 'J6'),
      wire('g3', 'B-7', 'J7'),
      wire('g4', 'I8', 'I7'),
      wire('g5', 'B-9', 'J9'),
      wire('g6', 'B-10', 'J10'),
      wire('g7', 'B-11', 'J11'),
      wire('g8', 'B-12', 'J12'),
      wire('g9', 'J31', 'B-31'), // C0 → GND
      wire('g10', 'J32', 'B-33'), // U1 GND
      wire('g11', 'A41', 'T-41'), // LED 陰極 → GND
      wire('g12', 'A48', 'T-48'),
      wire('g13', 'A55', 'T-55'),
      wire('g14', 'B62', [62, 3], [60, 3], 'T-60'),
      wire('g15', 'J41', 'B-41'),
      wire('a1', 'A5', 'J29'), // 開關上側 → A1
      wire('a2', 'A6', 'J27'), // → A2
      wire('a3', 'A7', 'A27'), // → A3
      wire('a4', 'A8', 'A29'), // → A4
      wire('b1', 'A9', 'J30'), // → B1
      wire('b2', 'A10', 'J26'), // → B2
      wire('b3', 'A11', 'A26'), // → B3
      wire('b4', 'A12', 'A30'), // → B4
      wire('s1', 'J28', 'B36'), // S1 → R1
      wire('s2', 'J25', 'B43'), // S2 → R2
      wire('s3', 'A28', 'B50'), // S3 → R3
      wire('s4', 'A31', 'B57'), // S4 → R4
      wire('c4', 'A32', 'I36'), // C4 → R5
    ],
  );
}

/** 效能測試用：50 個兩腳元件、50 條使用者導線，每條把元件 k 的腳 1 接到元件 (k+17) mod 50 的腳 2。 */
export function syntheticCircuit(): Circuit {
  const parts: Array<{ instance: ComponentInstance; pins: [[number, number], [number, number]] }> = [];
  for (let k = 0; k < 12; k++) {
    const x = 1 + 5 * k;
    parts.push({ instance: comp(`RA${k}`, 'resistor', [x, 4]), pins: [[x, 4], [x + 4, 4]] });
    parts.push({ instance: comp(`RJ${k}`, 'resistor', [x, 15]), pins: [[x, 15], [x + 4, 15]] });
  }
  for (let k = 0; k < 13; k++) {
    const x = 2 + 5 * k;
    parts.push({ instance: comp(`DC${k}`, 'led', [x, 6]), pins: [[x, 6], [x + 1, 6]] });
    parts.push({ instance: comp(`DH${k}`, 'led', [x, 13]), pins: [[x, 13], [x + 1, 13]] });
  }
  const wires = parts.map((part, k) => wire(`u${k}`, part.pins[0], parts[(k + 17) % parts.length].pins[1]));
  return circuit(parts.map((p) => p.instance), wires);
}
```

- [ ] **Step 2: 寫需求文件 Test 1–6**

`tests/routing/specTests.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { nodeIdOf } from '../../src/core/breadboard/naming';
import { indexCircuit } from '../../src/core/circuit/circuitIndex';
import { analyzeWireInteractions, stepDirection } from '../../src/core/circuit/wireGeometry';
import { autoRoute } from '../../src/core/routing/autoRoute';
import { checkRoutingLegality } from '../../src/core/routing/legality';
import { circuit, comp, wire } from '../fixtures/build';
import { acceptanceCircuit } from '../fixtures/circuits';

describe('需求文件第三十三章 Test 1–6', () => {
  it('Test 1：兩個孔之間的線只走水平/垂直', () => {
    const c = circuit([comp('R1', 'resistor', 'C10'), comp('R2', 'resistor', 'H30')], [wire('u1', 'A14', 'J30')]);
    const r = autoRoute(c);
    expect(r.status).toBe('success');
    expect(r.wires).toHaveLength(1);
    const path = r.wires[0].path;
    for (let i = 1; i < path.length; i++) expect(stepDirection(path[i - 1], path[i])).not.toBeNull();
  });

  it('Test 2：兩條線不能重疊', () => {
    const c = circuit(
      [comp('D1', 'led', 'C10'), comp('D2', 'led', 'C30'), comp('D3', 'led', 'D12'), comp('D4', 'led', 'D28')],
      [wire('u1', 'A10', 'A30'), wire('u2', 'B12', 'B28')],
    );
    const r = autoRoute(c);
    expect(r.status).toBe('success');
    expect(r.wires).toHaveLength(2);
    expect(analyzeWireInteractions(r.wires).overlaps).toEqual([]);
    expect(checkRoutingLegality(c, r.wires)).toEqual([]);
  });

  it('Test 3：可能交叉時選擇不交叉的路徑', () => {
    // VCC：T+ 與 B+ 兩條軌要接通（必然是一條垂直線）；訊號：第 1 欄下半 ↔ 第 63 欄下半（橫跨整塊板）。
    const c = circuit(
      [comp('V1', 'vcc', 'T+3'), comp('D1', 'led', 'H1'), comp('D2', 'led', 'H62')],
      [wire('u1', 'T+4', 'B+4'), wire('u2', 'J1', 'J63')],
    );
    const r = autoRoute(c);
    expect(r.status).toBe('success');
    expect(r.metrics.crossings).toBe(0);
    expect(checkRoutingLegality(c, r.wires)).toEqual([]);
  });

  it('Test 4：導線不能穿過 IC', () => {
    const c = circuit([comp('U1', '74LS00', 'F8'), comp('D1', 'led', 'H5'), comp('D2', 'led', 'B25')], [wire('u1', 'J5', 'A25')]);
    const r = autoRoute(c);
    expect(r.status).toBe('success');
    const icCells = new Set(indexCircuit(c).placedById.get('U1')!.footprint.blocked.map(nodeIdOf));
    expect(r.wires.flatMap((w) => w.path).some((p) => icCells.has(nodeIdOf(p)))).toBe(false);
  });

  it('Test 5：多個 Net 全部完成', () => {
    const c = acceptanceCircuit();
    const r = autoRoute(c);
    expect(r.status).toBe('success');
    expect(r.failedNets).toEqual([]);
    expect(checkRoutingLegality(c, r.wires)).toEqual([]);
  });

  it('Test 6：沒有合法路徑時回報 "No valid routing solution."，而且不輸出錯誤線路', () => {
    const c = circuit(
      [
        comp('R1', 'resistor', 'A20', { rotation: 90, span: 1 }),
        comp('R2', 'resistor', 'C20', { rotation: 90, span: 1 }),
        comp('D1', 'led', 'E20'),
        comp('D2', 'led', 'C40'),
      ],
      [wire('u1', 'A20', 'A40')],
    );
    const r = autoRoute(c);
    expect(r.message).toBe('No valid routing solution.');
    expect(r.status).toBe('failed');
    expect(r.wires).toEqual([]);
  });
});
```

- [ ] **Step 3: 寫固定電路與效能測試**

`tests/routing/fixtures.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { autoRoute } from '../../src/core/routing/autoRoute';
import { checkRoutingLegality } from '../../src/core/routing/legality';
import { scoreRouting } from '../../src/core/routing/score';
import type { RoutingResult } from '../../src/types/routing';
import { acceptanceCircuit, adderCircuit, counterCircuit } from '../fixtures/circuits';

const withoutTiming = (r: RoutingResult) => ({ ...r, stats: { ...r.stats, elapsedMs: 0 } });

describe.each([
  ['acceptance', acceptanceCircuit],
  ['counter', counterCircuit],
  ['adder', adderCircuit],
])('%s fixture', (_name, build) => {
  it('routes successfully, legally and deterministically', () => {
    const c = build();
    const r = autoRoute(c);
    expect(r.failedNets).toEqual([]);
    expect(r.status).toBe('success');
    expect(r.metrics.overlaps).toBe(0);
    expect(checkRoutingLegality(c, r.wires)).toEqual([]);
    expect(withoutTiming(autoRoute(c))).toEqual(withoutTiming(r));
  });
});

describe('completion criteria', () => {
  it('routes the acceptance circuit with no crossings and a score of at least 90', () => {
    const r = autoRoute(acceptanceCircuit());
    expect(r.metrics.crossings).toBe(0);
    expect(r.score).toBeGreaterThanOrEqual(90);
  });

  it('beats the user wiring of the acceptance circuit', () => {
    const c = acceptanceCircuit();
    expect(autoRoute(c).score).toBeGreaterThan(scoreRouting(c).score);
  });
});
```

`tests/routing/performance.test.ts`：

```ts
import { expect, it } from 'vitest';
import { autoRoute } from '../../src/core/routing/autoRoute';
import { checkRoutingLegality } from '../../src/core/routing/legality';
import { syntheticCircuit } from '../fixtures/circuits';

it('handles 50 components and 50 wires within the time budget and never outputs illegal wires', () => {
  const c = syntheticCircuit();
  expect(c.components).toHaveLength(50);
  const started = performance.now();
  const r = autoRoute(c);
  expect(performance.now() - started).toBeLessThan(6000);
  const failedIds = new Set(r.failedNets.map((f) => f.netId));
  const violations = checkRoutingLegality(c, r.wires);
  expect(violations.every((v) => v.code === 'NET_MISMATCH' && v.netIds.every((id) => failedIds.has(id)))).toBe(true);
}, 20000);
```

- [ ] **Step 4: 執行並記錄結果**

Run: `npx vitest run tests/routing/specTests.test.ts tests/routing/fixtures.test.ts tests/routing/performance.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 若有失敗，依下列順序校準（不得放寬測試）**

1. 先用 superpowers:systematic-debugging 找出是哪個 Net 失敗、失敗原因（`r.failedNets`）、以及衝突發生在哪些格點。
2. 固定電路本身擺錯（例如兩個元件真的擠在同一個孔、或 Net 因為佈局根本無解）：修正 `tests/fixtures/circuits.ts` 的擺放，並在註解中寫明原因。
3. 驗收電路分數 < 90：檢查 `r.metrics`。長度效率低 → 降低 `weights.congestion`（例如 20 → 8）；轉彎過多 → 提高 `weights.bend`；小折角多 → 提高 `weights.aesthetic`。每次只改一個數字，改完重跑 Step 4。
4. 協商不收斂（`ITERATION_LIMIT`）：提高 `negotiation.presentFactorGrowth`（1.6 → 2）或 `historyIncrement`（1 → 2）。
5. 效能超時：先確認 `findWire` 沒有在迴圈中配置新陣列；再把 `negotiation.maxIterations` 降到 40。

校準後的數值寫回 `DEFAULT_ROUTING_CONFIG`，並同步更新規格第 8.7 節的數值。

- [ ] **Step 6: 跑全部測試與型別檢查**

Run: `npm test`
Expected: 全部 PASS。

Run: `npm run typecheck`
Expected: 無錯誤。

- [ ] **Step 7: Commit**

```bash
git add tests/fixtures/circuits.ts tests/routing/specTests.test.ts tests/routing/fixtures.test.ts tests/routing/performance.test.ts src/core/routing/config.ts docs/superpowers/specs/2026-10-05-core-engine-design.md
git commit -m "test: add spec tests 1-6, fixture circuits and performance check"
```

---

### Task 15: ASCII 預覽、對外 API 與 demo

**Files:**
- Create: `src/debug/ascii.ts`, `src/index.ts`, `scripts/demo.ts`
- Test: `tests/api.test.ts`

**Interfaces:**
- Consumes: 前面所有 Task 的對外函式；`counterCircuit`、`adderCircuit`、`acceptanceCircuit`（Task 8、14）
- Produces:
  - `renderAscii(circuit: Circuit, wires?: Wire[]): string`（2 行欄號 + 18 行板面）
  - `src/index.ts`：規格第 10 節列出的全部對外 API 與型別
  - `npm run demo`

- [ ] **Step 1: 寫失敗的測試**

`tests/api.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import * as api from '../src/index';
import { acceptanceCircuit } from './fixtures/circuits';

describe('public API', () => {
  it('exposes the documented functions', () => {
    const names = [
      'buildBoard', 'getBoard', 'holeName', 'parseHoleName', 'getComponentDefinitions', 'getComponentDefinition',
      'resolveFootprint', 'getNodeState', 'extractNets', 'validateCircuit', 'autoRoute', 'checkRoutingLegality',
      'scoreRouting', 'applyRouting', 'mergeConfig', 'renderAscii',
    ];
    const exported = api as unknown as Record<string, unknown>;
    for (const name of names) expect(typeof exported[name], name).toBe('function');
    expect(api.MB102_LAYOUT.id).toBe('MB102');
    expect(api.DEFAULT_ROUTING_CONFIG.weights.crossing).toBe(1000);
  });

  it('round-trips a routing result through JSON', () => {
    const result = api.autoRoute(acceptanceCircuit());
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('renders the board as text with pins, bodies and wires', () => {
    const c = acceptanceCircuit();
    const before = api.renderAscii(c);
    const lines = before.split('\n');
    expect(lines).toHaveLength(20);
    expect(lines[2].startsWith('T- ')).toBe(true);
    expect(lines[5].startsWith('A  ')).toBe(true);
    expect(before).toContain('U');
    expect(before).toContain('#');
    const after = api.renderAscii(c, api.autoRoute(c).wires);
    expect(after).toMatch(/[─│┌┐└┘]/);
    expect(after).not.toContain('*');
  });
});
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run tests/api.test.ts`
Expected: FAIL，找不到 `../src/index`。

- [ ] **Step 3: 實作 ASCII 預覽**

`src/debug/ascii.ts`：

```ts
import { getNode, nodeIdOf } from '../core/breadboard/naming';
import { indexCircuit } from '../core/circuit/circuitIndex';
import { stepDirection } from '../core/circuit/wireGeometry';
import type { Circuit, Wire } from '../types/circuit';
import type { ComponentCategory } from '../types/component';
import type { Direction, GridPoint } from '../types/geometry';

const PIN_CHAR: Record<ComponentCategory, string> = {
  ic: 'U',
  resistor: 'R',
  led: 'D',
  vcc: '+',
  gnd: '-',
  'dc-power': 'P',
  'dip-switch': 'S',
  pushbutton: 'B',
};

const LINE_CHAR: Record<string, string> = { EW: '─', NS: '│', ES: '┌', SW: '┐', EN: '└', NW: '┘', ENSW: '┼' };

/**
 * 把第一塊板畫成文字：· 空孔、# 元件本體、字母 = 元件腳、o 導線端點、線條 = 導線、┼ 交叉、* 重疊。
 * 只用於終端機預覽與除錯。
 */
export function renderAscii(circuit: Circuit, wires: Wire[] = circuit.wires): string {
  const index = indexCircuit(circuit);
  const board = circuit.boards[0] ? index.boards.get(circuit.boards[0].id) : undefined;
  if (!board) return '';
  const grid = board.nodes.map((n) => (n.kind === 'hole' ? '·' : ' '));
  const put = (p: GridPoint, ch: string) => {
    if (p.boardId === board.id && getNode(board, p.x, p.y)) grid[(p.y - 1) * board.width + (p.x - 1)] = ch;
  };

  for (const pc of index.placed) for (const cell of pc.footprint.blocked) put(cell, '#');

  const dirs = new Map<string, Set<Direction>>();
  const uses = new Map<string, number>();
  const ends = new Set<string>();
  for (const w of wires) {
    w.path.forEach((p, i) => {
      const id = nodeIdOf(p);
      uses.set(id, (uses.get(id) ?? 0) + 1);
      if (i === 0 || i === w.path.length - 1) ends.add(id);
      const set = dirs.get(id) ?? new Set<Direction>();
      const prev = i > 0 ? stepDirection(p, w.path[i - 1]) : null;
      const next = i < w.path.length - 1 ? stepDirection(p, w.path[i + 1]) : null;
      if (prev) set.add(prev);
      if (next) set.add(next);
      dirs.set(id, set);
    });
  }
  for (const w of wires) {
    for (const p of w.path) {
      const id = nodeIdOf(p);
      const count = uses.get(id)!;
      const key = (['E', 'N', 'S', 'W'] as Direction[]).filter((d) => dirs.get(id)!.has(d)).join('');
      let ch: string;
      if (ends.has(id)) ch = count > 1 ? '*' : 'o';
      else if (count > 2 || (count === 2 && key !== 'ENSW')) ch = '*';
      else ch = LINE_CHAR[key] ?? '*';
      put(p, ch);
    }
  }
  for (const pc of index.placed) for (const pin of pc.footprint.pins) put(pin.point, PIN_CHAR[pc.def.category]);

  const rowLabel = (y: number) => (board.nodes.find((n) => n.y === y && n.name !== null)?.name ?? '').replace(/\d+$/, '').padEnd(3);
  const columns = Array.from({ length: board.width }, (_, i) => i + 1);
  const lines = [
    '   ' + columns.map((c) => (c % 10 === 0 ? String((c / 10) % 10) : ' ')).join(''),
    '   ' + columns.map((c) => String(c % 10)).join(''),
  ];
  for (let y = 1; y <= board.height; y++) {
    lines.push(rowLabel(y) + grid.slice((y - 1) * board.width, y * board.width).join(''));
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: 實作對外 API**

`src/index.ts`：

```ts
export type { Direction, GridPoint } from './types/geometry';
export type {
  BoardLayout, Breadboard, BreadboardGroup, BreadboardInstance, BreadboardNode, LayoutRow, NodeKind, RailLabel,
} from './types/board';
export type {
  ComponentCategory, ComponentDefinition, ComponentInstance, ComponentProps, Footprint, LedColor, PackageSpec,
  PinDefinition, PinRole, ResolvedPin, Rotation,
} from './types/component';
export type { Circuit, CircuitError, CircuitErrorCode, Net, NodeState, PinRef, Wire } from './types/circuit';
export type {
  DeepPartial, FailedNet, FailureReason, LegalityCode, LegalityViolation, RoutingConfig, RoutingMetrics, RoutingNode,
  RoutingPath, RoutingResult, RoutingWeights,
} from './types/routing';

export { MB102_LAYOUT } from './core/breadboard/layouts';
export { buildBoard } from './core/breadboard/buildBoard';
export { getBoard } from './core/breadboard/registry';
export { getNode, holeName, nodeIdOf, parseHoleName, parseNodeId } from './core/breadboard/naming';
export { getComponentDefinition, getComponentDefinitions, parseDefinition, RESISTOR_PRESETS } from './core/circuit/library';
export { resolveFootprint } from './core/circuit/footprint';
export { getNodeState } from './core/circuit/nodeState';
export { extractNets } from './core/circuit/nets';
export { validateCircuit } from './core/circuit/validate';
export { DEFAULT_ROUTING_CONFIG, mergeConfig } from './core/routing/config';
export { autoRoute } from './core/routing/autoRoute';
export { checkRoutingLegality } from './core/routing/legality';
export { scoreRouting } from './core/routing/score';
export { applyRouting } from './core/routing/apply';
export { renderAscii } from './debug/ascii';
```

- [ ] **Step 5: 實作 demo**

`scripts/demo.ts`：

```ts
import { autoRoute, renderAscii, scoreRouting, type Circuit } from '../src/index';
import { acceptanceCircuit, adderCircuit, counterCircuit } from '../tests/fixtures/circuits';

const fixtures: Array<[string, Circuit]> = [
  ['驗收電路：74LS00 + 電阻 + LED', acceptanceCircuit()],
  ['74LS93 計數器 + Push Button + 4 顆 LED', counterCircuit()],
  ['8 位元指撥開關 → 74LS283 → 5 顆 LED', adderCircuit()],
];

for (const [title, circuit] of fixtures) {
  const before = scoreRouting(circuit);
  const result = autoRoute(circuit);
  console.log(`\n=== ${title} ===\n`);
  console.log('使用者接線：');
  console.log(renderAscii(circuit));
  console.log('\nAI 標準佈線：');
  console.log(renderAscii(circuit, result.wires));
  console.log(`\n${result.message}`);
  console.table({
    使用者接線: { ...before.metrics, score: before.score },
    標準佈線: { ...result.metrics, score: result.score },
  });
  for (const f of result.failedNets) console.log(`  ✗ ${f.netId}：${f.reason}（${f.detail}）`);
  console.log(`  協商 ${result.stats.iterations} 輪，耗時 ${result.stats.elapsedMs} ms`);
}
```

- [ ] **Step 6: 確認測試通過並執行 demo**

Run: `npx vitest run tests/api.test.ts`
Expected: PASS（3 tests）

Run: `npm run demo`
Expected: 三個電路各印出「使用者接線」與「AI 標準佈線」兩張板面、`Standard Routing Complete`、前後統計表；標準佈線欄 `overlaps` 為 0，驗收電路 `score` ≥ 90。

- [ ] **Step 7: 最終驗證**

Run: `npm test`
Expected: 全部 PASS。

Run: `npm run typecheck`
Expected: 無錯誤。

- [ ] **Step 8: Commit**

```bash
git add src/debug/ascii.ts src/index.ts scripts/demo.ts tests/api.test.ts
git commit -m "feat: add public API, ASCII preview and demo script"
```
