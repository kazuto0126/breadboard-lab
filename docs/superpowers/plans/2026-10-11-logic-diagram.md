# 邏輯圖編輯器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 同一頁切換「邏輯圖｜麵包板」；邏輯圖可以拖拉六種閘、輸入端、輸出端並連線，即時模擬、自動真值表、檢查，和麵包板存在同一個檔案。

**Architecture:** 純函式放在新的 `src/logic/`（型別、形狀、編輯、計算、檢查、讀檔、範例），不碰網頁；
獨立的 Zustand store `useLogic`（`src/state/logic.ts`）放邏輯圖、Undo、選取、放置與畫面縮放；主 store 只加 `workspace` 與存檔整合；
畫面在 `src/components/Logic/`，App 依 `workspace` 換掉左、中、右三塊。

**Tech Stack:** TypeScript、React、Zustand、Vitest、Playwright

**Spec:** `docs/superpowers/specs/2026-10-11-logic-diagram-design.md`

## Global Constraints

- 文件、介面文字、註解用繁體中文；commit message 英文。
- `src/logic/` 不能用瀏覽器 API：加進 `tsconfig.json` 的 `include`。
- 閘：AND / OR / NAND / NOR 輸入 2–4；XOR 2；NOT 1。名稱 `/^[A-Za-z][A-Za-z0-9_]{0,7}$/`、不重複。
- 真值表最多 8 個輸入端。輸入端依名稱字母順序（第一個是最高位元）。
- 檔案格式不升版：`CircuitFile.logic?` 可省略。
- 每個 task 結束跑 `npm run typecheck && npm test`；畫面 task 跑 e2e（本機 Edge：`PLAYWRIGHT_CHROMIUM_EXECUTABLE="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"`）。

## Review Focus

1. 改輸入數變少時，接在被拿掉那幾個腳的線要一起刪；變多時原本的線維持在原本的腳（Task 2 測試）。
2. 讀檔時線指到不存在的節點、輸入腳號超出範圍、同一個輸入腳兩條線 → 整個檔案拒絕（Task 4 測試）。
3. 舊檔案（沒有 `logic`）、自動暫存還原、開新電路：邏輯圖狀態正確（Task 5 測試）。
4. 間接迴圈（g1→g2→g1）→ 不計算、真值表顯示迴圈錯誤，畫面不能當掉（Task 3 測試）。
5. 主 store 的 `view`（edit / compare）已經存在：新的切換叫 `workspace`，兩者不能混用（Task 5 Ruling）。

---

### Task 1: 型別與形狀

**Files:**
- Create: `src/logic/types.ts`、`src/logic/shapes.ts`
- Modify: `tsconfig.json`（`include` 加 `src/logic`）
- Test: `tests/logic/shapes.test.ts`

**Interfaces:**
- Produces: 規格第 2 節的 `GateKind`、`LogicNode`、`LogicWire`、`LogicDiagram`、`NodeKind = GateKind | 'INPUT' | 'OUTPUT'`；
  `emptyDiagram(): LogicDiagram`；`GATE_KINDS: GateKind[]`；`inputCountOf(node): number`；
  `nodeSize(node): { w: number; h: number }`；`inputPins(node): Array<{ x: number; y: number }>`（絕對格子座標）；
  `outputPin(node): { x: number; y: number } | null`；`overlaps(a: LogicNode, b: LogicNode): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { inputPins, nodeSize, outputPin, overlaps } from '../../src/logic/shapes';
import type { LogicNode } from '../../src/logic/types';

const gate = (inputs: number, x = 10, y = 20): LogicNode => ({ id: 'g1', kind: 'AND', x, y, inputs });

describe('logic shapes', () => {
  it('places pins on whole grid points for every input count', () => {
    expect([nodeSize(gate(2)), inputPins(gate(2)), outputPin(gate(2))]).toEqual([{ w: 4, h: 3 }, [{ x: 10, y: 20 }, { x: 10, y: 22 }], { x: 14, y: 21 }]);
    expect(inputPins(gate(3))).toEqual([{ x: 10, y: 20 }, { x: 10, y: 21 }, { x: 10, y: 22 }]);
    expect([nodeSize(gate(4)), inputPins(gate(4)), outputPin(gate(4))]).toEqual([
      { w: 4, h: 5 },
      [{ x: 10, y: 20 }, { x: 10, y: 21 }, { x: 10, y: 23 }, { x: 10, y: 24 }],
      { x: 14, y: 22 },
    ]);
    const not: LogicNode = { id: 'g2', kind: 'NOT', x: 0, y: 0, inputs: 1 };
    expect([nodeSize(not), inputPins(not), outputPin(not)]).toEqual([{ w: 3, h: 1 }, [{ x: 0, y: 0 }], { x: 3, y: 0 }]);
    const input: LogicNode = { id: 'i1', kind: 'INPUT', x: 0, y: 5, name: 'A', value: 0 };
    const output: LogicNode = { id: 'o1', kind: 'OUTPUT', x: 30, y: 5, name: 'X' };
    expect([inputPins(input), outputPin(input)]).toEqual([[], { x: 2, y: 5 }]);
    expect([inputPins(output), outputPin(output)]).toEqual([[{ x: 30, y: 5 }], null]);
  });

  it('lets parts touch but not overlap', () => {
    expect(overlaps(gate(2, 0, 0), gate(2, 4, 0))).toBe(false);
    expect(overlaps(gate(2, 0, 0), gate(2, 3, 2))).toBe(true);
    expect(overlaps(gate(2, 0, 0), gate(2, 0, 3))).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/logic/shapes.test.ts` → FAIL（模組不存在）

- [ ] **Step 3: Implement**

`src/logic/types.ts`：

```ts
/** 規格（2026-10-11 logic-diagram）第 2 節：邏輯圖的資料。座標是格子（整數），x 往右、y 往下。 */
export type GateKind = 'AND' | 'OR' | 'NOT' | 'NAND' | 'NOR' | 'XOR';
export type NodeKind = GateKind | 'INPUT' | 'OUTPUT';

export const GATE_KINDS: GateKind[] = ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR'];

export interface LogicNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  /** 只有閘：AND / OR / NAND / NOR 為 2–4；NOT = 1；XOR = 2。 */
  inputs?: number;
  /** 只有輸入端、輸出端。 */
  name?: string;
  /** 只有輸入端：開關目前的狀態。 */
  value?: 0 | 1;
}

export interface LogicWire {
  id: string;
  /** 來源：閘或輸入端的 id。 */
  from: string;
  /** 目的：閘的第 pin 個輸入（從 0 起算），或輸出端（pin = 0）。 */
  to: { node: string; pin: number };
}

export interface LogicDiagram {
  version: 1;
  nodes: LogicNode[];
  wires: LogicWire[];
}

export function emptyDiagram(): LogicDiagram {
  return { version: 1, nodes: [], wires: [] };
}

export const isGate = (kind: NodeKind): kind is GateKind => kind !== 'INPUT' && kind !== 'OUTPUT';
```

`src/logic/shapes.ts`：

```ts
import { isGate, type LogicNode } from './types';

export interface GridXY {
  x: number;
  y: number;
}

/** 這個節點有幾個輸入腳（輸入端 0、輸出端 1）。 */
export function inputCountOf(node: LogicNode): number {
  if (node.kind === 'INPUT') return 0;
  if (node.kind === 'OUTPUT' || node.kind === 'NOT') return 1;
  if (node.kind === 'XOR') return 2;
  return node.inputs ?? 2;
}

/** 規格 2.1 的表。 */
export function nodeSize(node: LogicNode): { w: number; h: number } {
  if (node.kind === 'INPUT' || node.kind === 'OUTPUT') return { w: 2, h: 1 };
  if (node.kind === 'NOT') return { w: 3, h: 1 };
  return { w: 4, h: inputCountOf(node) === 4 ? 5 : 3 };
}

const OFFSETS: Record<number, number[]> = { 1: [0], 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 3, 4] };

export function inputPins(node: LogicNode): GridXY[] {
  const n = inputCountOf(node);
  return (OFFSETS[n] ?? []).map((dy) => ({ x: node.x, y: node.y + dy }));
}

export function outputPin(node: LogicNode): GridXY | null {
  if (node.kind === 'OUTPUT') return null;
  const { w, h } = nodeSize(node);
  return { x: node.x + w, y: node.y + (isGate(node.kind) ? Math.floor(h / 2) : 0) };
}

/** 方框重疊（相鄰不算）。 */
export function overlaps(a: LogicNode, b: LogicNode): boolean {
  const sa = nodeSize(a);
  const sb = nodeSize(b);
  return a.x < b.x + sb.w && b.x < a.x + sa.w && a.y < b.y + sb.h && b.y < a.y + sa.h;
}
```

（NOT 的 `h` 是 1、`floor(1/2) = 0`；2、3 輸入 `h = 3` → 1；4 輸入 `h = 5` → 2，符合表格。）

`tsconfig.json`：`include` 陣列加 `"src/logic"`。

- [ ] **Step 4: Run** → PASS；`npm run typecheck` → PASS
- [ ] **Step 5: Commit** `feat(logic): logic diagram types and gate shapes`

---

### Task 2: 編輯（純函式）

**Files:**
- Create: `src/logic/edit.ts`
- Test: `tests/logic/edit.test.ts`

**Interfaces:**
- Consumes: Task 1
- Produces:
  ```ts
  type EditResult = { ok: true; diagram: LogicDiagram; id?: string } | { ok: false; diagram: LogicDiagram; reason: string };
  function nextNodeId(d, kind: NodeKind): string;          // g / i / o + 最小未用編號
  function defaultName(d, kind: 'INPUT' | 'OUTPUT'): string;
  function addNode(d, kind: NodeKind, x: number, y: number): EditResult;   // 新節點 id 在 result.id
  function canPlace(d, node: LogicNode, ignoreId?: string): boolean;
  function moveNode(d, id: string, x: number, y: number): EditResult;
  function removeNodes(d, ids: string[]): LogicDiagram;    // 連同相連的線
  function removeWire(d, id: string): LogicDiagram;
  function connect(d, from: string, to: { node: string; pin: number }): EditResult; // 取代那個輸入腳原本的線
  function setGateKind(d, id: string, kind: GateKind): EditResult;
  function setInputCount(d, id: string, n: number): EditResult;
  function renameNode(d, id: string, name: string): EditResult;
  function setInputValue(d, id: string, value: 0 | 1): LogicDiagram;
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { addNode, connect, moveNode, removeNodes, renameNode, setGateKind, setInputCount, setInputValue } from '../../src/logic/edit';
import { emptyDiagram, type LogicDiagram } from '../../src/logic/types';

const ok = (r: { ok: boolean; diagram: LogicDiagram }) => {
  expect(r.ok).toBe(true);
  return r.diagram;
};

function build() {
  let d = emptyDiagram();
  d = ok(addNode(d, 'INPUT', 0, 0)); // i1 A
  d = ok(addNode(d, 'INPUT', 0, 4)); // i2 B
  d = ok(addNode(d, 'AND', 6, 0)); // g1
  d = ok(addNode(d, 'OUTPUT', 14, 1)); // o1 X
  return d;
}

describe('editing a logic diagram', () => {
  it('names inputs A, B… and outputs X, Y…, and numbers ids', () => {
    const d = build();
    expect(d.nodes.map((n) => [n.id, n.name ?? n.kind])).toEqual([['i1', 'A'], ['i2', 'B'], ['g1', 'AND'], ['o1', 'X']]);
    expect(d.nodes.find((n) => n.id === 'g1')!.inputs).toBe(2);
    expect(d.nodes.find((n) => n.id === 'i1')!.value).toBe(0);
  });

  it('refuses overlapping parts and moves', () => {
    const d = build();
    expect(addNode(d, 'OR', 7, 1)).toMatchObject({ ok: false, reason: '這裡已經有元件了' });
    expect(moveNode(d, 'g1', 1, 0).ok).toBe(false);
    expect(ok(moveNode(d, 'g1', 6, 6)).nodes.find((n) => n.id === 'g1')).toMatchObject({ x: 6, y: 6 });
  });

  it('connects outputs to inputs, replaces an input’s old wire and refuses wrong directions', () => {
    let d = build();
    d = ok(connect(d, 'i1', { node: 'g1', pin: 0 }));
    d = ok(connect(d, 'i2', { node: 'g1', pin: 1 }));
    d = ok(connect(d, 'g1', { node: 'o1', pin: 0 }));
    d = ok(connect(d, 'i1', { node: 'g1', pin: 1 })); // 取代 i2 → g1.1
    expect(d.wires.map((w) => `${w.from}->${w.to.node}.${w.to.pin}`)).toEqual(['i1->g1.0', 'g1->o1.0', 'i1->g1.1']);
    expect(connect(d, 'o1', { node: 'g1', pin: 0 }).ok).toBe(false); // 輸出端沒有輸出
    expect(connect(d, 'i1', { node: 'i2', pin: 0 }).ok).toBe(false); // 輸入端沒有輸入
    expect(connect(d, 'g1', { node: 'g1', pin: 0 }).ok).toBe(false); // 自己接自己
    expect(connect(d, 'i1', { node: 'g1', pin: 5 }).ok).toBe(false); // 沒有這個腳
  });

  it('changes gate kind and input count, dropping wires on removed pins', () => {
    let d = build();
    d = ok(setInputCount(d, 'g1', 4));
    d = ok(connect(d, 'i1', { node: 'g1', pin: 0 }));
    d = ok(connect(d, 'i2', { node: 'g1', pin: 3 }));
    d = ok(setInputCount(d, 'g1', 2));
    expect(d.wires.map((w) => w.to.pin)).toEqual([0]);
    d = ok(setGateKind(d, 'g1', 'NOT'));
    expect(d.nodes.find((n) => n.id === 'g1')).toMatchObject({ kind: 'NOT', inputs: 1 });
    expect(d.wires.map((w) => w.to.pin)).toEqual([0]);
    d = ok(setGateKind(d, 'g1', 'OR'));
    expect(d.nodes.find((n) => n.id === 'g1')).toMatchObject({ kind: 'OR', inputs: 2 });
    expect(setInputCount(d, 'g1', 5).ok).toBe(false);
    expect(setGateKind(d, 'g1', 'XOR').ok).toBe(true);
    expect(setInputCount(ok(setGateKind(d, 'g1', 'XOR')), 'g1', 3).ok).toBe(false);
  });

  it('refuses a gate change that would overlap its neighbour', () => {
    let d = build();
    d = ok(addNode(d, 'OR', 6, 3)); // 緊貼在 g1 下面
    expect(setInputCount(d, 'g1', 4)).toMatchObject({ ok: false, reason: '改成 4 個輸入會和旁邊的元件重疊' });
  });

  it('checks names and keeps switch values', () => {
    const d = build();
    expect(renameNode(d, 'i1', 'B')).toMatchObject({ ok: false, reason: '名稱 B 已經用過了' });
    expect(renameNode(d, 'i1', '1A').ok).toBe(false);
    expect(renameNode(d, 'i1', '').ok).toBe(false);
    expect(renameNode(d, 'i1', 'ABCDEFGHI').ok).toBe(false);
    expect(ok(renameNode(d, 'i1', ' Cin ')).nodes[0].name).toBe('Cin');
    expect(renameNode(d, 'g1', 'Q').ok).toBe(false);
    expect(setInputValue(d, 'i1', 1).nodes[0].value).toBe(1);
  });

  it('removes nodes with their wires', () => {
    let d = build();
    d = ok(connect(d, 'i1', { node: 'g1', pin: 0 }));
    d = ok(connect(d, 'g1', { node: 'o1', pin: 0 }));
    d = removeNodes(d, ['g1']);
    expect(d.nodes.map((n) => n.id)).toEqual(['i1', 'i2', 'o1']);
    expect(d.wires).toEqual([]);
    expect(ok(addNode(d, 'AND', 6, 0)).nodes.at(-1)!.id).toBe('g1');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/logic/edit.test.ts` → FAIL
- [ ] **Step 3: Implement** `src/logic/edit.ts`

```ts
import { inputCountOf, overlaps } from './shapes';
import { isGate, type GateKind, type LogicDiagram, type LogicNode, type NodeKind } from './types';

export type EditResult = { ok: true; diagram: LogicDiagram; id?: string } | { ok: false; diagram: LogicDiagram; reason: string };

const fail = (diagram: LogicDiagram, reason: string): EditResult => ({ ok: false, diagram, reason });
const PREFIX: Record<'gate' | 'INPUT' | 'OUTPUT', string> = { gate: 'g', INPUT: 'i', OUTPUT: 'o' };
const NAME_RULE = /^[A-Za-z][A-Za-z0-9_]{0,7}$/;
const OUTPUT_NAMES = ['X', 'Y', 'Z', 'W', 'V', 'U', 'T', 'S', 'R', 'Q', 'P'];
const INPUT_NAMES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export function nextNodeId(d: LogicDiagram, kind: NodeKind): string {
  const prefix = PREFIX[isGate(kind) ? 'gate' : kind];
  const used = new Set(d.nodes.map((n) => n.id));
  for (let i = 1; ; i++) if (!used.has(`${prefix}${i}`)) return `${prefix}${i}`;
}

function nextWireId(d: LogicDiagram): string {
  const used = new Set(d.wires.map((w) => w.id));
  for (let i = 1; ; i++) if (!used.has(`w${i}`)) return `w${i}`;
}

export function defaultName(d: LogicDiagram, kind: 'INPUT' | 'OUTPUT'): string {
  const used = new Set(d.nodes.map((n) => n.name));
  const pool = kind === 'INPUT' ? INPUT_NAMES : [...OUTPUT_NAMES, ...INPUT_NAMES];
  const free = pool.find((n) => !used.has(n));
  if (free) return free;
  for (let i = 1; ; i++) if (!used.has(`${pool[0]}${i}`)) return `${pool[0]}${i}`;
}

export function canPlace(d: LogicDiagram, node: LogicNode, ignoreId?: string): boolean {
  return d.nodes.every((n) => n.id === ignoreId || n.id === node.id || !overlaps(n, node));
}

function defaultInputs(kind: GateKind): number {
  return kind === 'NOT' ? 1 : 2;
}

export function addNode(d: LogicDiagram, kind: NodeKind, x: number, y: number): EditResult {
  const id = nextNodeId(d, kind);
  const node: LogicNode =
    kind === 'INPUT'
      ? { id, kind, x, y, name: defaultName(d, 'INPUT'), value: 0 }
      : kind === 'OUTPUT'
        ? { id, kind, x, y, name: defaultName(d, 'OUTPUT') }
        : { id, kind, x, y, inputs: defaultInputs(kind) };
  if (!canPlace(d, node)) return fail(d, '這裡已經有元件了');
  return { ok: true, diagram: { ...d, nodes: [...d.nodes, node] }, id };
}

function replaceNode(d: LogicDiagram, node: LogicNode): LogicDiagram {
  return { ...d, nodes: d.nodes.map((n) => (n.id === node.id ? node : n)) };
}

export function moveNode(d: LogicDiagram, id: string, x: number, y: number): EditResult {
  const node = d.nodes.find((n) => n.id === id);
  if (!node) return fail(d, '找不到元件');
  if (node.x === x && node.y === y) return { ok: true, diagram: d };
  const moved = { ...node, x, y };
  if (!canPlace(d, moved)) return fail(d, '這裡已經有元件了');
  return { ok: true, diagram: replaceNode(d, moved) };
}

export function removeNodes(d: LogicDiagram, ids: string[]): LogicDiagram {
  const gone = new Set(ids);
  return { ...d, nodes: d.nodes.filter((n) => !gone.has(n.id)), wires: d.wires.filter((w) => !gone.has(w.from) && !gone.has(w.to.node)) };
}

export function removeWire(d: LogicDiagram, id: string): LogicDiagram {
  return { ...d, wires: d.wires.filter((w) => w.id !== id) };
}

export function connect(d: LogicDiagram, from: string, to: { node: string; pin: number }): EditResult {
  const source = d.nodes.find((n) => n.id === from);
  const target = d.nodes.find((n) => n.id === to.node);
  if (!source || !target) return fail(d, '找不到元件');
  if (source.kind === 'OUTPUT') return fail(d, '輸出端沒有可以接出去的腳');
  if (target.kind === 'INPUT') return fail(d, '輸入端沒有可以接進來的腳');
  if (source.id === target.id) return fail(d, '不能把自己的輸出接回自己的輸入');
  if (!Number.isInteger(to.pin) || to.pin < 0 || to.pin >= inputCountOf(target)) return fail(d, '沒有這個輸入腳');
  const kept = d.wires.filter((w) => !(w.to.node === to.node && w.to.pin === to.pin));
  if (kept.length !== d.wires.length && d.wires.some((w) => w.to.node === to.node && w.to.pin === to.pin && w.from === from)) return { ok: true, diagram: d };
  const wire = { id: nextWireId({ ...d, wires: kept }), from, to: { node: to.node, pin: to.pin } };
  return { ok: true, diagram: { ...d, wires: [...kept, wire] }, id: wire.id };
}

function withInputs(d: LogicDiagram, node: LogicNode, n: number, reason: string): EditResult {
  const changed = { ...node, inputs: n };
  if (!canPlace(d, changed)) return fail(d, reason);
  const next = replaceNode(d, changed);
  return { ok: true, diagram: { ...next, wires: next.wires.filter((w) => w.to.node !== node.id || w.to.pin < n) } };
}

export function setGateKind(d: LogicDiagram, id: string, kind: GateKind): EditResult {
  const node = d.nodes.find((n) => n.id === id);
  if (!node || !isGate(node.kind)) return fail(d, '只有邏輯閘可以換種類');
  const n = kind === 'NOT' ? 1 : kind === 'XOR' ? 2 : node.kind === 'NOT' || node.kind === 'XOR' ? 2 : (node.inputs ?? 2);
  return withInputs(d, { ...node, kind }, n, `改成 ${kind} 會和旁邊的元件重疊`);
}

export function setInputCount(d: LogicDiagram, id: string, n: number): EditResult {
  const node = d.nodes.find((x) => x.id === id);
  if (!node || !isGate(node.kind) || node.kind === 'NOT' || node.kind === 'XOR') return fail(d, '這個元件不能改輸入數');
  if (!Number.isInteger(n) || n < 2 || n > 4) return fail(d, '輸入數只能是 2、3、4');
  return withInputs(d, node, n, `改成 ${n} 個輸入會和旁邊的元件重疊`);
}

export function renameNode(d: LogicDiagram, id: string, raw: string): EditResult {
  const node = d.nodes.find((n) => n.id === id);
  if (!node || isGate(node.kind)) return fail(d, '只有輸入端、輸出端有名稱');
  const name = raw.trim();
  if (!NAME_RULE.test(name)) return fail(d, '名稱要用英文字母開頭，只能有英文字母、數字、底線，最多 8 個字');
  if (d.nodes.some((n) => n.id !== id && n.name === name)) return fail(d, `名稱 ${name} 已經用過了`);
  return { ok: true, diagram: replaceNode(d, { ...node, name }) };
}

export function setInputValue(d: LogicDiagram, id: string, value: 0 | 1): LogicDiagram {
  const node = d.nodes.find((n) => n.id === id);
  return node && node.kind === 'INPUT' && node.value !== value ? replaceNode(d, { ...node, value }) : d;
}
```

（`connect` 的「同一條線再接一次」：舊線 from 一樣時保留原本的圖。）

- [ ] **Step 4: Run** → PASS（若「緊貼在下面」的 OR 位置算出來沒有重疊，以 `nodeSize` 實際值調整測試座標並記 Ruling）
- [ ] **Step 5: Commit** `feat(logic): edit logic diagrams (place, move, connect, rename)`

---

### Task 3: 計算、真值表、檢查、範例

**Files:**
- Create: `src/logic/evaluate.ts`、`src/logic/check.ts`、`src/logic/examples.ts`
- Test: `tests/logic/evaluate.test.ts`、`tests/logic/check.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type Bit = 0 | 1 | 'X';
  function gateValue(kind: GateKind, inputs: Bit[]): Bit;
  function topoOrder(d): { order: LogicNode[]; loop: string[] | null };   // loop：迴圈上的節點 id
  function evaluate(d, values?: Record<string, 0 | 1>): { loop: string[] | null; nodes: Map<string, Bit> }; // values 以輸入端 id 為鍵，預設用節點的 value
  function sortedIo(d): { inputs: LogicNode[]; outputs: LogicNode[] };   // 依名稱
  type TruthTable = { ok: true; inputs: string[]; outputs: string[]; rows: Array<{ in: Array<0 | 1>; out: Bit[] }> } | { ok: false; reason: 'loop' | 'too-many' | 'empty'; loop?: string[] };
  function truthTable(d): TruthTable;
  interface LogicIssue { code: 'LOGIC_LOOP' | 'LOGIC_INPUT_OPEN' | 'LOGIC_OUTPUT_OPEN' | 'LOGIC_UNUSED' | 'LOGIC_NO_IO'; severity: 'error' | 'warning'; message: string; nodeIds: string[] }
  function checkDiagram(d): LogicIssue[];
  function nodeLabel(node): string;   // 'g1（AND）'、'輸入 A'、'輸出 X'
  function majorityDiagram(): LogicDiagram;   // 圖 2-5
  const LOGIC_EXAMPLES: Array<{ id: string; name: string; description: string; build: () => LogicDiagram }>;
  ```

- [ ] **Step 1: Write the failing tests**

`tests/logic/evaluate.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { addNode, connect } from '../../src/logic/edit';
import { evaluate, gateValue, truthTable } from '../../src/logic/evaluate';
import { majorityDiagram } from '../../src/logic/examples';
import { emptyDiagram, type LogicDiagram } from '../../src/logic/types';

describe('three-valued gates', () => {
  it('handles 0, 1 and unknown', () => {
    expect(gateValue('AND', [1, 1, 1])).toBe(1);
    expect(gateValue('AND', [1, 'X'])).toBe('X');
    expect(gateValue('AND', [0, 'X'])).toBe(0);
    expect(gateValue('OR', [0, 0, 0, 0])).toBe(0);
    expect(gateValue('OR', ['X', 1])).toBe(1);
    expect(gateValue('OR', ['X', 0])).toBe('X');
    expect(gateValue('NAND', [1, 1])).toBe(0);
    expect(gateValue('NAND', [0, 'X'])).toBe(1);
    expect(gateValue('NOR', [0, 0])).toBe(1);
    expect(gateValue('NOT', [0])).toBe(1);
    expect(gateValue('NOT', ['X'])).toBe('X');
    expect(gateValue('XOR', [1, 0])).toBe(1);
    expect(gateValue('XOR', [1, 1])).toBe(0);
    expect(gateValue('XOR', [1, 'X'])).toBe('X');
  });
});

describe('figure 2-5 (majority)', () => {
  it('gives X = AB + AC + BC', () => {
    const t = truthTable(majorityDiagram());
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.inputs).toEqual(['A', 'B', 'C']);
    expect(t.outputs).toEqual(['X']);
    expect(t.rows.map((r) => `${r.in.join('')}:${r.out.join('')}`)).toEqual(['000:0', '001:0', '010:0', '011:1', '100:0', '101:1', '110:1', '111:1']);
  });

  it('evaluates with the switch values', () => {
    const d = majorityDiagram();
    const ids = Object.fromEntries(d.nodes.filter((n) => n.name).map((n) => [n.name!, n.id]));
    const v = evaluate(d, { [ids.A]: 1, [ids.B]: 1, [ids.C]: 0 });
    expect(v.loop).toBeNull();
    expect(v.nodes.get(ids.X)).toBe(1);
    expect(evaluate(d).nodes.get(ids.X)).toBe(0);
  });
});

describe('problems', () => {
  const ok = (r: { ok: boolean; diagram: LogicDiagram }) => r.diagram;
  it('marks open inputs as unknown', () => {
    let d = emptyDiagram();
    d = ok(addNode(d, 'INPUT', 0, 0));
    d = ok(addNode(d, 'AND', 4, 0));
    d = ok(addNode(d, 'OUTPUT', 10, 1));
    d = ok(connect(d, 'i1', { node: 'g1', pin: 0 }));
    d = ok(connect(d, 'g1', { node: 'o1', pin: 0 }));
    const t = truthTable(d);
    expect(t.ok && t.rows.map((r) => r.out[0])).toEqual([0, 'X']);
  });

  it('refuses loops and too many inputs', () => {
    let d = emptyDiagram();
    d = ok(addNode(d, 'OR', 0, 0));
    d = ok(addNode(d, 'OR', 10, 0));
    d = ok(connect(d, 'g1', { node: 'g2', pin: 0 }));
    d = ok(connect(d, 'g2', { node: 'g1', pin: 0 }));
    expect(evaluate(d).loop?.sort()).toEqual(['g1', 'g2']);
    expect(truthTable(d)).toMatchObject({ ok: false, reason: 'loop' });
    let big = emptyDiagram();
    for (let i = 0; i < 9; i++) big = ok(addNode(big, 'INPUT', 0, i * 2));
    expect(truthTable(big)).toMatchObject({ ok: false, reason: 'too-many' });
    expect(truthTable(emptyDiagram())).toMatchObject({ ok: false, reason: 'empty' });
  });
});
```

`tests/logic/check.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { checkDiagram } from '../../src/logic/check';
import { addNode, connect } from '../../src/logic/edit';
import { majorityDiagram } from '../../src/logic/examples';
import { emptyDiagram, type LogicDiagram } from '../../src/logic/types';

const ok = (r: { diagram: LogicDiagram }) => r.diagram;

describe('checkDiagram', () => {
  it('finds nothing wrong with figure 2-5', () => {
    expect(checkDiagram(majorityDiagram())).toEqual([]);
  });

  it('lists open pins, unused outputs and missing terminals', () => {
    let d = emptyDiagram();
    d = ok(addNode(d, 'AND', 4, 0));
    const codes = checkDiagram(d).map((i) => [i.code, i.severity, i.message]);
    expect(codes).toEqual([
      ['LOGIC_NO_IO', 'warning', '邏輯圖還沒有輸入端'],
      ['LOGIC_NO_IO', 'warning', '邏輯圖還沒有輸出端'],
      ['LOGIC_INPUT_OPEN', 'warning', 'g1（AND）第 1 個輸入沒有接線，值不確定'],
      ['LOGIC_INPUT_OPEN', 'warning', 'g1（AND）第 2 個輸入沒有接線，值不確定'],
      ['LOGIC_UNUSED', 'warning', 'g1（AND）的輸出沒有接到任何地方'],
    ]);
    d = ok(addNode(d, 'OUTPUT', 12, 1));
    expect(checkDiagram(d).some((i) => i.code === 'LOGIC_OUTPUT_OPEN' && i.message === '輸出 X 沒有接到任何閘')).toBe(true);
  });

  it('reports loops as errors first', () => {
    let d = emptyDiagram();
    d = ok(addNode(d, 'OR', 0, 0));
    d = ok(addNode(d, 'OR', 10, 0));
    d = ok(connect(d, 'g1', { node: 'g2', pin: 0 }));
    d = ok(connect(d, 'g2', { node: 'g1', pin: 0 }));
    const [first] = checkDiagram(d);
    expect(first).toMatchObject({ code: 'LOGIC_LOOP', severity: 'error' });
    expect(first.message).toMatch(/^g1、g2 形成迴圈/);
  });
});
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**

`src/logic/evaluate.ts`：

```ts
import { inputCountOf } from './shapes';
import { isGate, type GateKind, type LogicDiagram, type LogicNode } from './types';

export type Bit = 0 | 1 | 'X';

/** 規格第 3 節：三值邏輯。 */
export function gateValue(kind: GateKind, inputs: Bit[]): Bit {
  const and = (): Bit => (inputs.includes(0) ? 0 : inputs.includes('X') ? 'X' : 1);
  const or = (): Bit => (inputs.includes(1) ? 1 : inputs.includes('X') ? 'X' : 0);
  const not = (b: Bit): Bit => (b === 'X' ? 'X' : b === 1 ? 0 : 1);
  switch (kind) {
    case 'AND':
      return and();
    case 'OR':
      return or();
    case 'NAND':
      return not(and());
    case 'NOR':
      return not(or());
    case 'NOT':
      return not(inputs[0] ?? 'X');
    case 'XOR':
      return inputs.includes('X') ? 'X' : ((inputs.filter((b) => b === 1).length % 2) as 0 | 1);
  }
}

/** 拓撲順序（Kahn）；排不完的節點就是迴圈（以及被迴圈影響、排不進去的節點中，真的在環上的那些）。 */
export function topoOrder(d: LogicDiagram): { order: LogicNode[]; loop: string[] | null } {
  const indegree = new Map(d.nodes.map((n) => [n.id, 0]));
  const next = new Map<string, string[]>(d.nodes.map((n) => [n.id, []]));
  for (const w of d.wires) {
    if (!indegree.has(w.from) || !indegree.has(w.to.node)) continue;
    indegree.set(w.to.node, indegree.get(w.to.node)! + 1);
    next.get(w.from)!.push(w.to.node);
  }
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  const queue = d.nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  const order: LogicNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(byId.get(id)!);
    for (const t of next.get(id)!) {
      indegree.set(t, indegree.get(t)! - 1);
      if (indegree.get(t) === 0) queue.push(t);
    }
  }
  if (order.length === d.nodes.length) return { order, loop: null };
  // 剩下的節點裡，能從自己走回自己的才是環上的節點。
  const left = new Set(d.nodes.filter((n) => !order.includes(n)).map((n) => n.id));
  const onCycle = [...left].filter((start) => {
    const seen = new Set<string>();
    const stack = [...(next.get(start) ?? [])];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (id === start) return true;
      if (seen.has(id) || !left.has(id)) continue;
      seen.add(id);
      stack.push(...(next.get(id) ?? []));
    }
    return false;
  });
  return { order, loop: onCycle.sort() };
}

/** values：輸入端 id → 0 / 1；沒給的用節點自己的 value。 */
export function evaluate(d: LogicDiagram, values: Record<string, 0 | 1> = {}): { loop: string[] | null; nodes: Map<string, Bit> } {
  const { order, loop } = topoOrder(d);
  const nodes = new Map<string, Bit>();
  if (loop) return { loop, nodes };
  const driver = new Map(d.wires.map((w) => [`${w.to.node}#${w.to.pin}`, w.from]));
  const inputOf = (node: LogicNode, pin: number): Bit => {
    const from = driver.get(`${node.id}#${pin}`);
    return from === undefined ? 'X' : (nodes.get(from) ?? 'X');
  };
  for (const node of order) {
    if (node.kind === 'INPUT') nodes.set(node.id, values[node.id] ?? node.value ?? 0);
    else if (node.kind === 'OUTPUT') nodes.set(node.id, inputOf(node, 0));
    else if (isGate(node.kind)) {
      const ins = Array.from({ length: inputCountOf(node) }, (_, i) => inputOf(node, i));
      nodes.set(node.id, gateValue(node.kind, ins));
    }
  }
  return { loop: null, nodes };
}

const byName = (a: LogicNode, b: LogicNode) => ((a.name ?? '') < (b.name ?? '') ? -1 : (a.name ?? '') > (b.name ?? '') ? 1 : 0);

export function sortedIo(d: LogicDiagram): { inputs: LogicNode[]; outputs: LogicNode[] } {
  return {
    inputs: d.nodes.filter((n) => n.kind === 'INPUT').sort(byName),
    outputs: d.nodes.filter((n) => n.kind === 'OUTPUT').sort(byName),
  };
}

export const MAX_TABLE_INPUTS = 8;

export type TruthTable =
  | { ok: true; inputs: string[]; outputs: string[]; rows: Array<{ in: Array<0 | 1>; out: Bit[] }> }
  | { ok: false; reason: 'loop' | 'too-many' | 'empty'; loop?: string[] };

/** 規格第 3 節：輸入端依名稱排序，第一個是最高位元，從全 0 數到全 1。 */
export function truthTable(d: LogicDiagram): TruthTable {
  const { inputs, outputs } = sortedIo(d);
  if (inputs.length === 0 && outputs.length === 0) return { ok: false, reason: 'empty' };
  if (inputs.length > MAX_TABLE_INPUTS) return { ok: false, reason: 'too-many' };
  const loop = topoOrder(d).loop;
  if (loop) return { ok: false, reason: 'loop', loop };
  const rows = [];
  for (let r = 0; r < 1 << inputs.length; r++) {
    const bits = inputs.map((_, i) => ((r >> (inputs.length - 1 - i)) & 1) as 0 | 1);
    const v = evaluate(d, Object.fromEntries(inputs.map((n, i) => [n.id, bits[i]])));
    rows.push({ in: bits, out: outputs.map((o) => v.nodes.get(o.id) ?? 'X') });
  }
  return { ok: true, inputs: inputs.map((n) => n.name ?? n.id), outputs: outputs.map((n) => n.name ?? n.id), rows };
}
```

`src/logic/check.ts`：

```ts
import { topoOrder } from './evaluate';
import { inputCountOf } from './shapes';
import { isGate, type LogicDiagram, type LogicNode } from './types';

export interface LogicIssue {
  code: 'LOGIC_LOOP' | 'LOGIC_INPUT_OPEN' | 'LOGIC_OUTPUT_OPEN' | 'LOGIC_UNUSED' | 'LOGIC_NO_IO';
  severity: 'error' | 'warning';
  message: string;
  nodeIds: string[];
}

export function nodeLabel(node: LogicNode): string {
  if (node.kind === 'INPUT') return `輸入 ${node.name}`;
  if (node.kind === 'OUTPUT') return `輸出 ${node.name}`;
  return `${node.id}（${node.kind}）`;
}

/** 規格第 4 節。順序：迴圈、缺輸入 / 輸出端、每個節點（依圖上的順序）的開路與沒用到。 */
export function checkDiagram(d: LogicDiagram): LogicIssue[] {
  const issues: LogicIssue[] = [];
  const loop = topoOrder(d).loop;
  if (loop) issues.push({ code: 'LOGIC_LOOP', severity: 'error', message: `${loop.join('、')} 形成迴圈：邏輯圖只能畫組合邏輯（輸出不能再接回前面）`, nodeIds: loop });
  if (d.nodes.some((n) => isGate(n.kind))) {
    if (!d.nodes.some((n) => n.kind === 'INPUT')) issues.push({ code: 'LOGIC_NO_IO', severity: 'warning', message: '邏輯圖還沒有輸入端', nodeIds: [] });
    if (!d.nodes.some((n) => n.kind === 'OUTPUT')) issues.push({ code: 'LOGIC_NO_IO', severity: 'warning', message: '邏輯圖還沒有輸出端', nodeIds: [] });
  }
  const driven = new Set(d.wires.map((w) => `${w.to.node}#${w.to.pin}`));
  const used = new Set(d.wires.map((w) => w.from));
  for (const node of d.nodes) {
    if (node.kind === 'OUTPUT') {
      if (!driven.has(`${node.id}#0`)) issues.push({ code: 'LOGIC_OUTPUT_OPEN', severity: 'warning', message: `輸出 ${node.name} 沒有接到任何閘`, nodeIds: [node.id] });
      continue;
    }
    for (let pin = 0; pin < inputCountOf(node); pin++) {
      if (!driven.has(`${node.id}#${pin}`))
        issues.push({ code: 'LOGIC_INPUT_OPEN', severity: 'warning', message: `${nodeLabel(node)}第 ${pin + 1} 個輸入沒有接線，值不確定`, nodeIds: [node.id] });
    }
    if (!used.has(node.id)) issues.push({ code: 'LOGIC_UNUSED', severity: 'warning', message: `${nodeLabel(node)}的輸出沒有接到任何地方`, nodeIds: [node.id] });
  }
  return issues;
}
```

`src/logic/examples.ts`（圖 2-5：A、B、C 在左；AND g1 = AB、g2 = AC、g3 = BC；3 輸入 OR g4；輸出 X）：

```ts
import { addNode, connect, setInputCount } from './edit';
import { emptyDiagram, type LogicDiagram, type NodeKind } from './types';

function must(r: { ok: boolean; diagram: LogicDiagram }): LogicDiagram {
  if (!r.ok) throw new Error('example is invalid');
  return r.diagram;
}

/** 課本「圖 2-5」多數決電路：X = AB + AC + BC。 */
export function majorityDiagram(): LogicDiagram {
  let d = emptyDiagram();
  const place: Array<[NodeKind, number, number]> = [
    ['INPUT', 0, 2], // i1 A
    ['INPUT', 0, 4], // i2 B
    ['INPUT', 0, 10], // i3 C
    ['AND', 12, 1], // g1
    ['AND', 12, 8], // g2
    ['AND', 12, 15], // g3
    ['OR', 22, 8], // g4
    ['OUTPUT', 30, 9], // o1 X
  ];
  for (const [kind, x, y] of place) d = must(addNode(d, kind, x, y));
  d = must(setInputCount(d, 'g4', 3));
  const links: Array<[string, string, number]> = [
    ['i1', 'g1', 0], ['i2', 'g1', 1],
    ['i3', 'g2', 0], ['i1', 'g2', 1],
    ['i2', 'g3', 0], ['i3', 'g3', 1],
    ['g1', 'g4', 0], ['g2', 'g4', 1], ['g3', 'g4', 2],
    ['g4', 'o1', 0],
  ];
  for (const [from, node, pin] of links) d = must(connect(d, from, { node, pin }));
  return d;
}

export const LOGIC_EXAMPLES = [
  { id: 'majority', name: '多數決電路（圖 2-5）', description: 'X = AB + AC + BC：三個輸入有兩個以上是 1 時 X = 1', build: majorityDiagram },
];
```

- [ ] **Step 4: Run** `npx vitest run tests/logic` → PASS
- [ ] **Step 5: Commit** `feat(logic): evaluate, truth table, checks and the figure 2-5 example`

---

### Task 4: 讀檔與存檔格式

**Files:**
- Create: `src/logic/file.ts`
- Modify: `src/editor/fileFormat.ts`（`CircuitFile.logic?`、`toCircuitFile` 第 5 個參數 `logic?`、`serializeCircuitFile` 第 4 個參數 `logic?`、`ParseResult` 的 ok 分支多 `logic?: LogicDiagram`、`parseCircuitData` 讀 `top.logic`）
- Test: `tests/logic/file.test.ts`

**Interfaces:**
- Produces: `parseLogicDiagram(raw: unknown): { ok: true; diagram: LogicDiagram } | { ok: false; error: string }`；
  `toCircuitFile(circuit, name, now?, checklist?, logic?)`（只有在 `logic.nodes.length > 0` 時寫入）；`serializeCircuitFile(circuit, name, now?, logic?)`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { emptyCircuit, parseCircuitData, parseCircuitText, serializeCircuitFile, toCircuitFile } from '../../src/editor/fileFormat';
import { majorityDiagram } from '../../src/logic/examples';
import { parseLogicDiagram } from '../../src/logic/file';

describe('logic diagram files', () => {
  it('round-trips through the circuit file', () => {
    const logic = majorityDiagram();
    const text = serializeCircuitFile(emptyCircuit(), 'm', new Date(0), logic);
    const r = parseCircuitText(text);
    expect(r.ok && r.logic).toEqual(logic);
  });

  it('keeps old files and empty diagrams without a logic field', () => {
    const file = toCircuitFile(emptyCircuit(), 'x', new Date(0));
    expect('logic' in file).toBe(false);
    expect('logic' in toCircuitFile(emptyCircuit(), 'x', new Date(0), undefined, { version: 1, nodes: [], wires: [] })).toBe(false);
    const r = parseCircuitData(file);
    expect(r.ok && r.logic).toBeUndefined();
  });

  it('rejects broken diagrams with a reason', () => {
    const good = majorityDiagram();
    const bad = (patch: object) => parseLogicDiagram({ ...good, ...patch });
    expect(parseLogicDiagram(good)).toEqual({ ok: true, diagram: good });
    expect(bad({ version: 2 })).toMatchObject({ ok: false });
    expect(bad({ nodes: [...good.nodes, { id: 'g9', kind: 'MUX', x: 0, y: 0 }] })).toMatchObject({ ok: false, error: expect.stringContaining('MUX') });
    expect(bad({ nodes: good.nodes.map((n) => (n.id === 'g4' ? { ...n, inputs: 5 } : n)) })).toMatchObject({ ok: false });
    expect(bad({ nodes: good.nodes.map((n) => (n.id === 'i2' ? { ...n, name: 'A' } : n)) })).toMatchObject({ ok: false, error: expect.stringContaining('A') });
    expect(bad({ wires: [...good.wires, { id: 'w99', from: 'zz', to: { node: 'g1', pin: 0 } }] })).toMatchObject({ ok: false });
    expect(bad({ wires: [...good.wires, { id: 'w99', from: 'i3', to: { node: 'g1', pin: 0 } }] })).toMatchObject({ ok: false });
    expect(bad({ wires: [...good.wires, { id: 'w99', from: 'i3', to: { node: 'g1', pin: 7 } }] })).toMatchObject({ ok: false });
    expect(bad({ wires: [...good.wires, { id: 'w99', from: 'o1', to: { node: 'g1', pin: 0 } }] })).toMatchObject({ ok: false });
    const r = parseCircuitData({ ...toCircuitFile(emptyCircuit(), 'x', new Date(0)), logic: { version: 1, nodes: 'no', wires: [] } });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('邏輯圖') });
  });
});
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**

`src/logic/file.ts`：

```ts
import { inputCountOf, overlaps } from './shapes';
import { isGate, type LogicDiagram, type LogicNode, type LogicWire, type NodeKind } from './types';

const KINDS: NodeKind[] = ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'INPUT', 'OUTPUT'];
const NAME_RULE = /^[A-Za-z][A-Za-z0-9_]{0,7}$/;
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);

class LogicFormatError extends Error {}
const fail = (msg: string): never => {
  throw new LogicFormatError(msg);
};

function parseNode(raw: unknown, i: number): LogicNode {
  if (!isObj(raw)) fail(`第 ${i + 1} 個元件格式不對`);
  const n = raw as Obj;
  if (typeof n.id !== 'string' || !n.id) fail(`第 ${i + 1} 個元件沒有 id`);
  if (!KINDS.includes(n.kind as NodeKind)) fail(`元件 ${String(n.id)} 的種類 ${String(n.kind)} 不認得`);
  if (!isInt(n.x) || !isInt(n.y)) fail(`元件 ${String(n.id)} 的位置要是整數`);
  const node: LogicNode = { id: n.id as string, kind: n.kind as NodeKind, x: n.x as number, y: n.y as number };
  if (isGate(node.kind)) {
    const expected = node.kind === 'NOT' ? [1] : node.kind === 'XOR' ? [2] : [2, 3, 4];
    if (!expected.includes(n.inputs as number)) fail(`元件 ${node.id}（${node.kind}）的輸入數 ${String(n.inputs)} 不合法`);
    node.inputs = n.inputs as number;
  } else {
    if (typeof n.name !== 'string' || !NAME_RULE.test(n.name)) fail(`元件 ${node.id} 的名稱 ${String(n.name)} 不合法`);
    node.name = n.name as string;
    if (node.kind === 'INPUT') node.value = n.value === 1 ? 1 : 0;
  }
  return node;
}

function parseWire(raw: unknown, i: number, nodes: Map<string, LogicNode>): LogicWire {
  if (!isObj(raw) || !isObj((raw as Obj).to)) fail(`第 ${i + 1} 條線格式不對`);
  const w = raw as Obj;
  const to = w.to as Obj;
  if (typeof w.id !== 'string' || typeof w.from !== 'string' || typeof to.node !== 'string' || !isInt(to.pin)) fail(`第 ${i + 1} 條線格式不對`);
  const source = nodes.get(w.from as string);
  const target = nodes.get(to.node as string);
  if (!source || !target) fail(`線 ${String(w.id)} 接到不存在的元件`);
  if (source!.kind === 'OUTPUT' || target!.kind === 'INPUT' || source === target) fail(`線 ${String(w.id)} 的方向不對`);
  if ((to.pin as number) < 0 || (to.pin as number) >= inputCountOf(target!)) fail(`線 ${String(w.id)} 接到不存在的輸入腳`);
  return { id: w.id as string, from: w.from as string, to: { node: to.node as string, pin: to.pin as number } };
}

/** 規格第 6 節：讀檔時檢查邏輯圖；不合法就整個拒絕並說明原因。 */
export function parseLogicDiagram(raw: unknown): { ok: true; diagram: LogicDiagram } | { ok: false; error: string } {
  try {
    if (!isObj(raw) || raw.version !== 1 || !Array.isArray(raw.nodes) || !Array.isArray(raw.wires)) fail('格式不對');
    const r = raw as Obj;
    const nodes = (r.nodes as unknown[]).map(parseNode);
    const byId = new Map<string, LogicNode>();
    const names = new Set<string>();
    for (const n of nodes) {
      if (byId.has(n.id)) fail(`元件 id ${n.id} 重複`);
      byId.set(n.id, n);
      if (n.name !== undefined) {
        if (names.has(n.name)) fail(`名稱 ${n.name} 重複`);
        names.add(n.name);
      }
    }
    nodes.forEach((a, i) => nodes.slice(i + 1).forEach((b) => overlaps(a, b) && fail(`元件 ${a.id} 和 ${b.id} 重疊`)));
    const wires = (r.wires as unknown[]).map((w, i) => parseWire(w, i, byId));
    const ids = new Set<string>();
    const pins = new Set<string>();
    for (const w of wires) {
      if (ids.has(w.id)) fail(`線 id ${w.id} 重複`);
      ids.add(w.id);
      const key = `${w.to.node}#${w.to.pin}`;
      if (pins.has(key)) fail(`${w.to.node} 的第 ${w.to.pin + 1} 個輸入接了兩條線`);
      pins.add(key);
    }
    return { ok: true, diagram: { version: 1, nodes, wires } };
  } catch (err) {
    if (err instanceof LogicFormatError) return { ok: false, error: err.message };
    throw err;
  }
}
```

`fileFormat.ts`：
- import `type LogicDiagram` 與 `parseLogicDiagram`。
- `CircuitFile` 加 `/** 邏輯圖（選填；子專案 12）。 */ logic?: LogicDiagram;`
- `ParseResult` ok 分支加 `logic?: LogicDiagram`。
- `toCircuitFile(circuit, name, now = new Date(), checklist?, logic?)`：`if (logic && logic.nodes.length > 0) file.logic = logic;`
- `serializeCircuitFile(circuit, name, now?, logic?)` → `toCircuitFile(circuit, name, now, undefined, logic)`。
- `parseCircuitData` 的 CircuitFile 分支：

```ts
      let logic: LogicDiagram | undefined;
      if (top.logic !== undefined) {
        const parsed = parseLogicDiagram(top.logic);
        if (!parsed.ok) fail('logic', `邏輯圖有問題：${parsed.error}`);
        else logic = parsed.diagram;
      }
      const base = { ok: true as const, circuit: parseCircuit(top.circuit), name };
      return { ...base, ...(checklist ? { checklist } : {}), ...(logic ? { logic } : {}) };
```

（`fail(path, msg)` 是 fileFormat 既有的函式；若它的訊息會加上路徑前綴，測試用 `stringContaining('邏輯圖')` 仍成立。）

- [ ] **Step 4: Run** `npx vitest run tests/logic tests/editor/fileFormat.test.ts` → PASS
- [ ] **Step 5: Commit** `feat(logic): save logic diagrams in the circuit file`

---

### Task 5: `useLogic` store 與主 store 整合

**Files:**
- Create: `src/state/logic.ts`
- Modify: `src/state/persistence.ts`（`Autosave.logic?`、`writeAutosave(…, logic?)`、`saveProject(…, logic?)`）、`src/state/store.ts`、`src/state/fileActions.ts`（`exportJson` 帶上邏輯圖）
- Test: `tests/web/logic.test.ts`

**Interfaces:**
- Consumes: Task 1–4
- Produces（`useLogic`）：
  ```ts
  type LogicSelection = { kind: 'node'; id: string } | { kind: 'wire'; id: string } | null;
  interface LogicState {
    diagram: LogicDiagram; saved: LogicDiagram; history: History<LogicDiagram>;
    selection: LogicSelection; placing: NodeKind | null; viewport: Viewport; canvasSize: { width: number; height: number };
    tab: 'inspect' | 'table' | 'check';
    load(d: LogicDiagram): void;          // 換掉圖、清 Undo、saved = d
    markSaved(): void;
    apply(r: EditResult, label: string): boolean;   // ok → 記 Undo、更新；不 ok → 回傳 false
    undo(): void; redo(): void;
    select(sel: LogicSelection): void;
    startPlacing(kind: NodeKind | null): void;
    place(kind: NodeKind, x: number, y: number): boolean;
    deleteSelection(): void;
    toggleInput(id: string): void;        // 不進 Undo
    setInputs(values: Record<string, 0 | 1>): void; // 真值表點列，不進 Undo
    setViewport(v: Viewport): void; setCanvasSize(w: number, h: number): void; fit(): void; setTab(t): void;
  }
  function logicDirty(s?: LogicState): boolean;   // diagram !== saved 且（有節點或 saved 有節點）
  ```
  主 store：`workspace: 'breadboard' | 'logic'`、`setWorkspace(w)`；`loadCircuit(circuit, name, message?, checklist?, logic?)`；
  `isDirty(s)` 也看 `logicDirty()`；`saveProject` / 自動暫存 / `exportJson` 帶上 `useLogic.getState().diagram`；
  `loadExampleLogic(id)`：清空麵包板、載入邏輯圖範例、切到 logic。

- [ ] **Step 1: Write the failing test**（`tests/web/logic.test.ts`）

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { addNode } from '../../src/logic/edit';
import { majorityDiagram } from '../../src/logic/examples';
import { emptyDiagram } from '../../src/logic/types';
import { initialLogicState, logicDirty, useLogic } from '../../src/state/logic';
import { initialState, isDirty, useStore } from '../../src/state/store';
import { comp } from '../fixtures/build';

const L = () => useLogic.getState();
const S = () => useStore.getState();

beforeEach(() => {
  useStore.setState(initialState());
  useLogic.setState(initialLogicState());
});

describe('logic store', () => {
  it('places parts with its own undo history, separate from the breadboard', () => {
    expect(L().place('AND', 4, 0)).toBe(true);
    expect(L().place('AND', 5, 0)).toBe(false);
    expect(L().diagram.nodes).toHaveLength(1);
    S().addComponent(comp('R1', 'resistor', 'A10'));
    L().undo();
    expect(L().diagram.nodes).toHaveLength(0);
    expect(S().circuit.components).toHaveLength(1);
    L().redo();
    expect(L().diagram.nodes).toHaveLength(1);
  });

  it('toggles switches without undo, and deletes the selection', () => {
    L().load(majorityDiagram());
    L().toggleInput('i1');
    expect(L().diagram.nodes.find((n) => n.id === 'i1')!.value).toBe(1);
    expect(L().history.past).toHaveLength(0);
    L().setInputs({ i1: 0, i2: 1, i3: 1 });
    expect(L().diagram.nodes.filter((n) => n.kind === 'INPUT').map((n) => n.value)).toEqual([0, 1, 1]);
    L().select({ kind: 'node', id: 'g4' });
    L().deleteSelection();
    expect(L().diagram.nodes.some((n) => n.id === 'g4')).toBe(false);
    expect(L().diagram.wires.some((w) => w.from === 'g4' || w.to.node === 'g4')).toBe(false);
    expect(L().selection).toBeNull();
  });

  it('counts as unsaved work and is cleared by a new circuit', () => {
    expect(logicDirty()).toBe(false);
    L().apply(addNode(L().diagram, 'INPUT', 0, 0), '新增輸入端');
    expect(logicDirty()).toBe(true);
    expect(isDirty(S())).toBe(true);
    S().newCircuit();
    expect(L().diagram).toEqual(emptyDiagram());
    expect(logicDirty()).toBe(false);
  });

  it('loads the figure 2-5 example into the logic workspace', () => {
    S().loadExampleLogic('majority');
    expect(S().workspace).toBe('logic');
    expect(L().diagram.nodes).toHaveLength(8);
    expect(S().circuit.components).toHaveLength(0);
    expect(logicDirty()).toBe(false);
  });
});
```

（若主 store 沒有 `addComponent` 這個名稱，用 store 既有的新增元件動作或直接 `S().loadCircuit(circuit([comp…]), null)` 後確認 `circuit` 不受 `L().undo()` 影響，記 Ruling。）

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**

`src/state/logic.ts`：

```ts
import { create } from 'zustand';
import { emptyHistory, record, redo, undo, type History } from '../editor/history';
import { DEFAULT_VIEWPORT, fitRect, type Viewport } from '../editor/viewport';
import { addNode, removeNodes, removeWire, setInputValue, type EditResult } from '../logic/edit';
import { nodeSize } from '../logic/shapes';
import { emptyDiagram, type LogicDiagram, type NodeKind } from '../logic/types';
import * as persistence from './persistence';

export type LogicSelection = { kind: 'node'; id: string } | { kind: 'wire'; id: string } | null;
export type LogicTab = 'inspect' | 'table' | 'check';
/** 邏輯圖一格的畫面大小（px，縮放 1 時）。 */
export const LOGIC_CELL = 20;

export interface LogicState {
  diagram: LogicDiagram;
  saved: LogicDiagram;
  history: History<LogicDiagram>;
  selection: LogicSelection;
  placing: NodeKind | null;
  viewport: Viewport;
  canvasSize: { width: number; height: number };
  tab: LogicTab;
  load(d: LogicDiagram): void;
  markSaved(): void;
  apply(r: EditResult, label: string, selection?: LogicSelection): boolean;
  undo(): void;
  redo(): void;
  select(sel: LogicSelection): void;
  startPlacing(kind: NodeKind | null): void;
  place(kind: NodeKind, x: number, y: number): boolean;
  deleteSelection(): void;
  toggleInput(id: string): void;
  setInputs(values: Record<string, 0 | 1>): void;
  setViewport(v: Viewport): void;
  setCanvasSize(width: number, height: number): void;
  fit(): void;
  setTab(tab: LogicTab): void;
}

export function initialLogicState(): Pick<LogicState, 'diagram' | 'saved' | 'history' | 'selection' | 'placing' | 'viewport' | 'canvasSize' | 'tab'> {
  const restored = typeof window !== 'undefined' ? persistence.loadAutosave()?.logic : undefined;
  const diagram = restored ?? emptyDiagram();
  return { diagram, saved: diagram, history: emptyHistory(), selection: null, placing: null, viewport: DEFAULT_VIEWPORT, canvasSize: { width: 1200, height: 700 }, tab: 'inspect' };
}

/** 規格第 1、2 節：邏輯圖自己的狀態與 Undo（不進主 store 的 Undo）。 */
export const useLogic = create<LogicState>((set, get) => ({
  ...initialLogicState(),

  load(d) {
    set({ diagram: d, saved: d, history: emptyHistory(), selection: null, placing: null });
    get().fit();
  },
  markSaved() {
    set({ saved: get().diagram });
  },
  apply(r, label, selection) {
    if (!r.ok) return false;
    if (r.diagram === get().diagram) return true;
    set({ history: record(get().history, get().diagram, label), diagram: r.diagram, ...(selection !== undefined ? { selection } : {}) });
    return true;
  },
  undo() {
    const step = undo(get().history, get().diagram);
    if (step) set({ history: step.history, diagram: step.state, selection: null });
  },
  redo() {
    const step = redo(get().history, get().diagram);
    if (step) set({ history: step.history, diagram: step.state, selection: null });
  },
  select(selection) {
    set({ selection });
  },
  startPlacing(placing) {
    set({ placing, selection: null });
  },
  place(kind, x, y) {
    const r = addNode(get().diagram, kind, x, y);
    const done = get().apply(r, `新增 ${kind === 'INPUT' ? '輸入端' : kind === 'OUTPUT' ? '輸出端' : kind}`, r.ok && r.id ? { kind: 'node', id: r.id } : undefined);
    if (done) set({ placing: null });
    return done;
  },
  deleteSelection() {
    const { selection, diagram } = get();
    if (!selection) return;
    const next = selection.kind === 'node' ? removeNodes(diagram, [selection.id]) : removeWire(diagram, selection.id);
    get().apply({ ok: true, diagram: next }, selection.kind === 'node' ? `刪除 ${selection.id}` : '刪除線', null);
  },
  toggleInput(id) {
    const node = get().diagram.nodes.find((n) => n.id === id);
    if (node?.kind === 'INPUT') set({ diagram: setInputValue(get().diagram, id, node.value === 1 ? 0 : 1) });
  },
  setInputs(values) {
    let d = get().diagram;
    for (const [id, v] of Object.entries(values)) d = setInputValue(d, id, v);
    set({ diagram: d });
  },
  setViewport(viewport) {
    set({ viewport });
  },
  setCanvasSize(width, height) {
    set({ canvasSize: { width, height } });
  },
  fit() {
    const { diagram, canvasSize } = get();
    if (diagram.nodes.length === 0) {
      set({ viewport: DEFAULT_VIEWPORT });
      return;
    }
    const xs = diagram.nodes.flatMap((n) => [n.x, n.x + nodeSize(n).w + 1]);
    const ys = diagram.nodes.flatMap((n) => [n.y, n.y + nodeSize(n).h]);
    const rect = { x: (Math.min(...xs) - 2) * LOGIC_CELL, y: (Math.min(...ys) - 2) * LOGIC_CELL, width: (Math.max(...xs) - Math.min(...xs) + 4) * LOGIC_CELL, height: (Math.max(...ys) - Math.min(...ys) + 4) * LOGIC_CELL };
    set({ viewport: fitRect(rect, canvasSize.width, canvasSize.height, 32) });
  },
  setTab(tab) {
    set({ tab });
  },
}));

/** 邏輯圖有沒有還沒儲存的修改（開關切換也算：開關狀態會存檔）。 */
export function logicDirty(s: LogicState = useLogic.getState()): boolean {
  return s.diagram !== s.saved && (s.diagram.nodes.length > 0 || s.saved.nodes.length > 0);
}
```

（`fitRect` 的 `Rect` 欄位名稱以 `editor/geometry.ts` 的 `Rect` 為準：若是 `{ x, y, w, h }` 就改用那個名稱。開關切換是否算「未儲存」：算，因為會存檔。）

`persistence.ts`：`Autosave` 加 `logic?: LogicDiagram`（`loadAutosave` 取 `result.logic`）；`writeAutosave(circuit, name, checklist?, unsaved = false, logic?)` 傳給 `toCircuitFile(…, checklist, logic)`；
`saveProject(name, circuit, checklist?, logic?)` 同樣傳入。

`store.ts`：
- `AppState` 加 `workspace: 'breadboard' | 'logic'`（註解：規格第 5 節的「邏輯圖｜麵包板」切換；和 `view`（edit / compare）無關）與 `setWorkspace(w)`、`loadExampleLogic(id: string)`。`initialState()` 加 `workspace: 'breadboard'`。
- `loadCircuit(circuit, name, message?, checklist?, logic?)`：最後呼叫 `useLogic.getState().load(logic ?? emptyDiagram())`。
- `openProject`、`importJson` 傳入 `result.logic`。
- `saveProject`：`persistence.saveProject(target, s.circuit, checklist, useLogic.getState().diagram)`，成功後 `useLogic.getState().markSaved()`。
- `isDirty(s)`：`return logicDirty() || (原本的條件)`。
- `startAutosave`：另外 `useLogic.subscribe((l, prev) => { if (l.diagram !== prev.diagram || l.saved !== prev.saved) schedule(); })`；
  寫入時帶 `useLogic.getState().diagram`；回傳的清除函式兩個訂閱都取消。（把原本 setTimeout 內容抽成 `schedule()`。）
- `loadExampleLogic(id)`：找 `LOGIC_EXAMPLES`，`get().loadCircuit(emptyCircuit(), ex.name, \`已載入範例「${ex.name}」：${ex.description}\`, undefined, ex.build())`，再 `set({ workspace: 'logic' })`。
- `setWorkspace(workspace)`：`set({ workspace, placing: null, drawer: null })`；切到 logic 時 `useLogic.getState().startPlacing(null)`。

`fileActions.ts`：`exportJson` 用 `serializeCircuitFile(s.circuit, name, undefined, useLogic.getState().diagram)`。

- [ ] **Step 4: Run** `npx vitest run tests/web` 與 `npm run typecheck` → PASS（既有的 store / persistence 測試也要過）
- [ ] **Step 5: Commit** `feat(state): logic diagram store with its own undo, saved with the circuit`

---

### Task 6: 邏輯圖畫布、元件庫、閘的圖示

**Files:**
- Create: `src/components/Logic/GateSymbol.tsx`、`src/components/Logic/LogicCanvas.tsx`、`src/components/Logic/LogicLibrary.tsx`、`src/logic/wiring.ts`（線的畫法，純函式）
- Test: `tests/logic/wiring.test.ts`

**Interfaces:**
- Produces（`src/logic/wiring.ts`）：
  ```ts
  function wireRoute(d: LogicDiagram, wire: LogicWire): GridXY[];        // 輸出腳 → 匯流線（輸出 x+1）→ 目的列 → 目的腳
  function junctions(d: LogicDiagram): GridXY[];                         // 匯流線上的分岔點
  ```
  `LogicCanvas`：`data-testid="logic-canvas"`；節點 `g[data-logic-node="<id>"]`；輸入腳 `[data-logic-pin="<id>:in:<pin>"]`、輸出腳 `[data-logic-pin="<id>:out"]`；
  線 `[data-logic-wire="<id>"]`；輸入端開關 `[data-logic-switch="<id>"]`；輸出端燈號 `[data-logic-lamp="<id>"]`（文字 1 / 0 / ?）。
  `LogicLibrary`：按鈕名稱 `AND`、`OR`、`NOT`、`NAND`、`NOR`、`XOR`、`輸入端`、`輸出端`（`data-logic-part="<kind>"`）。

- [ ] **Step 1: Write the failing test**（`tests/logic/wiring.test.ts`）

```ts
import { describe, expect, it } from 'vitest';
import { majorityDiagram } from '../../src/logic/examples';
import { junctions, wireRoute } from '../../src/logic/wiring';

describe('logic wire drawing', () => {
  it('runs out to a bus one cell right of the source, then across to the target pin', () => {
    const d = majorityDiagram();
    // i1（A）在 (0, 2)，輸出腳 (2, 2)；g1 在 (12, 1)，第 0 個輸入 (12, 1)
    const w = d.wires.find((x) => x.from === 'i1' && x.to.node === 'g1')!;
    expect(wireRoute(d, w)).toEqual([{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 1 }, { x: 12, y: 1 }]);
  });

  it('puts a dot where a source branches to more than one target', () => {
    const dots = junctions(majorityDiagram());
    // A 接 g1.0（y 1）與 g2.1（y 10）：匯流線 x = 3，從 y 2 分到 1 與 10 → 在 (3, 2) 分岔
    expect(dots).toContainEqual({ x: 3, y: 2 });
    expect(dots.every((p) => Number.isInteger(p.x) && Number.isInteger(p.y))).toBe(true);
  });
});
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**

`src/logic/wiring.ts`：

```ts
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
```

（`junctions`：來源列在匯流線端點時（全部目的都在同一側），從那裡分出兩條以上 → 畫點；在中間時已經被 `y > lo && y < hi` 包含。目的列在兩端的不畫。）

`GateSymbol.tsx`：依 `kind` 畫 IEEE 形狀（SVG path，座標以 `LOGIC_CELL` 為單位）：
- AND / NAND：左邊直線、右半圓（D 形）；OR / NOR / XOR：盾形（左邊內凹弧、上下兩條弧到尖端）；XOR 多一條左側弧；NOT：三角形；NAND / NOR / NOT 輸出端一個小圓圈（半徑 0.25 格）。
- 輸入腳、輸出腳畫短線（0.5 格）延伸到腳的格點。
- 填色：選取時 sky、平常 slate；線條顏色依輸出值（1 紅 `#ef4444`、0 藍 `#3b82f6`、X 灰 `#94a3b8`）。
- 輸入端：圓角方塊，左邊名稱、右邊開關（`data-logic-switch`，顯示 0 / 1，點一下 `toggleInput`，`stopPropagation`）。輸出端：左邊燈號（圓形，`data-logic-lamp`，顯示 1 / 0 / ?）、右邊名稱。

`LogicCanvas.tsx`（參考 `BreadboardCanvas` 的平移縮放寫法，但簡化）：
- `<svg data-testid="logic-canvas">`，`ResizeObserver` → `setCanvasSize`；第一次有大小時 `fit()`。
- 背景：每格一個淺灰點（`<pattern>`，大小 `LOGIC_CELL × scale`）。
- 世界座標 = 格子 × `LOGIC_CELL`；`transform = translate(v.x, v.y) scale(v.scale)`。
- 滾輪：`zoomAt`；在空白處按下拖曳：`panBy`；平板兩指：沿用 `pinchViewport`（可以只做滾輪與拖曳，記 Ruling）。
- 放置：`placing` 不為 null 時，游標位置四捨五入到格子當左上角，畫半透明預覽（`canPlace` 為 false 時紅色）；點一下 `place(kind, x, y)`。
  元件庫用 pointer 拖曳時：`LogicLibrary` 呼叫 `startPlacing(kind)`，在畫布上 pointerup 時放下（同一套邏輯：pointerup 在畫布內就 `place`）。
- 移動：在節點上按下拖曳 → 預覽位置，放開 `apply(moveNode(...), '移動 g1')`；沒移動就是選取。
- 連線：在腳上按下 → 拖曳中畫預覽直線（起點腳到游標）；在另一個腳上放開：
  一端是輸出腳、另一端是輸入腳 → `apply(connect(d, 來源 id, { node, pin }), '連線')`；否則不建立。預覽線在游標停在不合法的腳時變紅。
- 線：`wireRoute` 畫成 polyline，`data-logic-wire`；點線選取；選取時加粗。分岔點用 `junctions` 畫實心圓（半徑 0.18 格）。
- 值：`useMemo(() => evaluate(diagram), [diagram])`，線與腳的顏色依來源的值；有迴圈時全部灰色。
- Esc / Delete / Ctrl+Z 由 `useShortcuts` 處理（Task 7）。

`LogicLibrary.tsx`：和 `ComponentLibrary` 一樣的外框（`aside`，窄螢幕抽屜 `drawer === 'library'`）；標題「邏輯閘」；八個按鈕，每個有小圖示（`GateSymbol` 縮小）與名稱；
點一下 `startPlacing(kind)`（再點一下同一個取消）；正在放置的那個標亮；下方說明「點一下元件，再點畫布放下；從腳拖到另一個腳連線」。
`LOGIC_EXAMPLES` 的按鈕「載入範例：多數決電路（圖 2-5）」→ `useStore.getState().loadExampleLogic('majority')`（有未儲存修改時先 `openDialog('confirm-new')` 的做法不適用，直接載入前用 `window.confirm` 也不要；沿用 Toolbar 範例的行為：直接載入）。

- [ ] **Step 4: Run** `npx vitest run tests/logic` 與 `npm run typecheck` → PASS
- [ ] **Step 5: Commit** `feat(ui): logic diagram canvas, gate symbols and parts list`

---

### Task 7: 右側面板、工具列切換、快捷鍵、狀態列、App

**Files:**
- Create: `src/components/Logic/LogicPanel.tsx`
- Modify: `src/components/App.tsx`、`src/components/Toolbar/Toolbar.tsx`、`src/components/useShortcuts.ts`、`src/components/StatusBar/StatusBar.tsx`

**Interfaces:**
- Produces：`LogicPanel`（分頁「屬性」「真值表」「檢查」，`role="tab"`；真值表 `data-testid="truth-table"`，每列 `tr[data-row="<二進位>"]`、目前那列 `aria-current="true"`）；
  工具列切換 `data-testid="view-switch"`，兩個按鈕「邏輯圖」「麵包板」（`aria-pressed`）。

- [ ] **Step 1: Implement**

`LogicPanel.tsx`：
- 屬性（`tab === 'inspect'`）：
  - 選到閘：標題 `g1`，「種類」六個按鈕（目前的標亮）→ `apply(setGateKind(...), '改成 OR')`，失敗時顯示 `reason`；
    AND / OR / NAND / NOR 時「輸入數」2 / 3 / 4 三個按鈕 → `setInputCount`；「刪除」按鈕。
  - 選到輸入端 / 輸出端：名稱輸入框（`aria-label="名稱"`，Enter 或離開時 `renameNode`；不合法時紅字顯示原因並還原）；輸入端多「目前值」0 / 1 切換。
  - 選到線：`來源 → 目的`（用 `nodeLabel`）與「刪除」。
  - 沒選：「閘 N・輸入端 N・輸出端 N・線 N」與說明文字。
- 真值表（`tab === 'table'`）：`truthTable(diagram)`；ok 時表格（輸入欄、分隔線、輸出欄；值 1 紅字、0 藍字、X 顯示「?」）；
  目前開關組合的列 `aria-current="true"` 標亮；點列 → `setInputs`（依 `sortedIo` 的輸入順序對應 id）。
  不 ok：`loop` → 「邏輯圖有迴圈（g1、g2），不能算真值表」；`too-many` → 規格的文字；`empty` → 「先放輸入端和輸出端」。
- 檢查（`tab === 'check'`）：`checkDiagram`；沒有問題時「沒有發現問題」；每項一列（錯誤紅、警告黃），點一下選取第一個 `nodeIds` 並把畫面移過去（`setViewport(centerOn(...))`）。分頁標籤上顯示問題數。

`App.tsx`：`const workspace = useStore((s) => s.workspace);`
`workspace === 'logic'` 時：`<LogicLibrary />`、`<main …><LogicCanvas /></main>`、`<LogicPanel />`；否則維持原本。

`Toolbar.tsx`：
- 選單後面加切換（`data-testid="view-switch"`）：兩個按鈕「邏輯圖」「麵包板」，`aria-pressed`，點了 `store.setWorkspace(...)`。
- `workspace === 'logic'` 時：「電路」「自動佈線」選單與右邊的 MANUAL / AUTO ROUTE / COMPARE、Check Circuit、模擬、AI 標準佈線、可移動 IC 按鈕不顯示；
  「編輯」選單的復原 / 重做 / 刪除 / 取消選取改用 `useLogic`（標籤用 `undoLabel(logic.history)`）；旋轉停用；
  「檢視」選單 Fit / 放大 / 縮小改用 `useLogic` 的 `fit` 與 `zoomAt`；「檔案」選單的「範例電路」多一個標題「邏輯圖範例」與 `LOGIC_EXAMPLES`。
- 未儲存判斷：`const logicChanged = useLogic((l) => logicDirty(l));` 與 `dirty` 合併。

`useShortcuts.ts`：`if (s.workspace === 'logic')` 時：Esc → `startPlacing(null)` 或 `select(null)`；Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y → `useLogic` 的 undo / redo；Delete / Backspace → `deleteSelection`；F → `fit`；其他麵包板快捷鍵不處理。Ctrl+S / Ctrl+O 照舊。

`StatusBar.tsx`：`workspace === 'logic'` 時只顯示「閘 N・輸入 N・輸出 N・線 N」與檢查問題數。

- [ ] **Step 2: typecheck、單元測試** `npm run typecheck && npm test` → PASS
- [ ] **Step 3: Commit** `feat(ui): switch between the logic diagram and the breadboard; truth table and checks panel`

---

### Task 8: 端對端測試、文件

**Files:**
- Create: `e2e/logic-diagram.spec.ts`
- Modify: `CHANGELOG.md`、`README.md`、`docs/PROGRESS.md`、規格狀態

- [ ] **Step 1: Write the e2e test**

```ts
import { expect, test, type Page } from '@playwright/test';

/** 格子座標 → 畫布上的螢幕座標（讀 LogicCanvas 的 viewport）。 */
async function cell(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('logic-canvas').boundingBox())!;
  const v = await page.evaluate(() => (window as unknown as { __logicViewport: () => { x: number; y: number; scale: number } }).__logicViewport());
  return { x: box.x + v.x + x * 20 * v.scale, y: box.y + v.y + y * 20 * v.scale };
}

async function placeAt(page: Page, part: string, x: number, y: number) {
  await page.locator(`[data-logic-part="${part}"]`).click();
  const p = await cell(page, x, y);
  await page.mouse.click(p.x, p.y);
}

async function drag(page: Page, from: string, to: string) {
  const a = (await page.locator(`[data-logic-pin="${from}"]`).boundingBox())!;
  const b = (await page.locator(`[data-logic-pin="${to}"]`).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

test('畫出圖 2-5：真值表正確、撥開關看輸出、存檔再開圖還在', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('view-switch').getByRole('button', { name: '邏輯圖' }).click();
  await expect(page.getByTestId('logic-canvas')).toBeVisible();

  await placeAt(page, 'INPUT', 0, 2);
  await placeAt(page, 'INPUT', 0, 4);
  await placeAt(page, 'INPUT', 0, 10);
  await placeAt(page, 'AND', 12, 1);
  await placeAt(page, 'AND', 12, 8);
  await placeAt(page, 'AND', 12, 15);
  await placeAt(page, 'OR', 22, 8);
  await page.getByRole('button', { name: '3', exact: true }).click(); // 剛放的 OR 被選取：輸入數改 3
  await placeAt(page, 'OUTPUT', 30, 9);

  for (const [from, to] of [
    ['i1:out', 'g1:in:0'], ['i2:out', 'g1:in:1'],
    ['i3:out', 'g2:in:0'], ['i1:out', 'g2:in:1'],
    ['i2:out', 'g3:in:0'], ['i3:out', 'g3:in:1'],
    ['g1:out', 'g4:in:0'], ['g2:out', 'g4:in:1'], ['g3:out', 'g4:in:2'],
    ['g4:out', 'o1:in:0'],
  ]) await drag(page, from, to);
  await expect(page.locator('[data-logic-wire]')).toHaveCount(10);

  await page.getByRole('tab', { name: /真值表/ }).click();
  const table = page.getByTestId('truth-table');
  await expect(table.locator('tr[data-row]')).toHaveCount(8);
  await expect(table.locator('tr[data-row="011"] td').last()).toHaveText('1');
  await expect(table.locator('tr[data-row="100"] td').last()).toHaveText('0');

  await page.locator('[data-logic-switch="i1"]').click();
  await page.locator('[data-logic-switch="i2"]').click();
  await expect(page.locator('[data-logic-lamp="o1"]')).toHaveText('1');
  await expect(table.locator('tr[data-row="110"]')).toHaveAttribute('aria-current', 'true');
  await table.locator('tr[data-row="000"]').click();
  await expect(page.locator('[data-logic-lamp="o1"]')).toHaveText('0');

  await page.reload();
  await page.getByTestId('view-switch').getByRole('button', { name: '邏輯圖' }).click();
  await expect(page.locator('[data-logic-wire]')).toHaveCount(10);
});

test('範例「多數決電路（圖 2-5）」載入到邏輯圖', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: '多數決電路（圖 2-5）' }).click();
  await expect(page.locator('[data-logic-node]')).toHaveCount(8);
  await page.getByRole('tab', { name: /檢查/ }).click();
  await expect(page.getByText('沒有發現問題')).toBeVisible();
});
```

`LogicCanvas` 在開發與測試時把 `window.__logicViewport = () => useLogic.getState().viewport` 掛上（只在 `import.meta.env.DEV` 或 `MODE !== 'production'` 時；若 e2e 跑的是 production build，改成一律掛上並記 Ruling——這只是唯讀的除錯函式）。
（OR 的輸入數按鈕：屬性面板裡「輸入數」的按鈕名稱是 `2`、`3`、`4`；若和其他按鈕衝突，加 `aria-label="輸入數 3"` 並改用該名稱。）

- [ ] **Step 2: Run** e2e（新檔與全部）→ PASS；`npm run build && npm run build:single` → PASS
- [ ] **Step 3: 文件**：CHANGELOG 最上面「[未發布] — 子專案 12：邏輯圖編輯器」（新增、測試數、文件）；README 功能表加「邏輯圖」一列、路線圖第 12 列；PROGRESS 的進行中與測試數；規格狀態「已完成」。
- [ ] **Step 4: Commit 並 push** `docs: sub-project 12 (logic diagram editor)`
