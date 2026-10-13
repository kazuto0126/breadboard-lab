# 邏輯圖轉成麵包板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 邏輯圖按「轉成麵包板…」產生 74LS IC、指撥開關、電阻、LED 的麵包板，交給 AI 佈線（可移動 IC），並用模擬逐列比對真值表。

**Architecture:** `src/logic/synth.ts`（拆閘、分配 IC、產生 Netlist）→ `src/logic/toBreadboard.ts`（放置元件、用連線導線表示 Netlist）→
主 store `convertLogic` 取代電路並執行 AI 佈線 → `src/logic/verifyBreadboard.ts` 在麵包板上逐列模擬比對。三個 logic 檔案都是純函式。

**Tech Stack:** TypeScript、React、Zustand、Vitest、Playwright

**Spec:** `docs/superpowers/specs/2026-10-13-logic-to-breadboard-design.md`

## Global Constraints

- `src/logic/` 不用瀏覽器 API。文件、介面、註解用繁體中文；commit message 英文。
- IC 對應與拆法照規格第 3 節；腳位一律從元件定義的 `logic.gates`（名稱 → `pins[].number`）取得，不寫死。
- 開關極性：`switchTo: 'vcc'`（撥 ON = 1，330 Ω 下拉）／`'gnd'`（撥 ON = 0，1 kΩ 上拉）。輸出：220 Ω → LED（紅）→ GND。
- 新放的電阻 `span: 3`；每個導通群組只能有一個 Net 的腳（不能讓兩個 Net 的腳插在同一排）。
- 每個 task 結束：`npm run typecheck && npm test`；畫面 task 加 e2e（Edge）。

## Review Focus

1. 兩個 Net 的腳被放進同一個導通群組（短路）→ 產生的電路 `validateCircuit` 不能有非 WIRE_* 的錯誤（Task 2 測試，對圖 2-5、全部閘種類的圖、9 個閘的大圖）。
2. 多輸入 NAND / NOR 拆法錯 → 拆開後在三值邏輯上算的真值表要和原圖相同（Task 1 測試，每種 2/3/4 輸入）。
3. 開關接 GND 時比對要反過來換算（Task 3 測試兩種接法）。
4. IC 太多放不下 MB-102 → 自動換 EIC-1106；指定 MB-102 時回報原因（Task 2 測試）。
5. 轉換後 Undo 要回到原本的麵包板，比對卡片在開新電路後消失（Task 4 測試）。

---

### Task 1: 拆閘、分配 IC、Netlist（`src/logic/synth.ts`）

**Produces:**
```ts
type UnitKind = 'AND2' | 'AND3' | 'AND4' | 'OR2' | 'NOT' | 'NAND2' | 'NOR2' | 'XOR2';
interface Unit { kind: UnitKind; inputs: string[]; output: string }   // 訊號名稱：來源節點 id，或拆開時的中間訊號 `${gateId}~${k}`
const IC_FOR: Record<UnitKind, string>;   // AND2→74LS08、AND3→74LS11、AND4→74LS21、OR2→74LS32、NOT→74LS04、NAND2→74LS00、NOR2→74LS02、XOR2→74LS86
function convertProblem(d: LogicDiagram): string | null;   // 規格第 6 節的訊息；可以轉時 null
function decompose(d: LogicDiagram): Unit[];
function evaluateUnits(units: Unit[], values: Record<string, 0 | 1>): Record<string, 0 | 1>;  // 測試用：依序算出每個訊號
interface IcPlan { id: string; defId: string; slots: Array<Unit | null> }
function assignIcs(units: Unit[]): IcPlan[];   // IC 依 IC_FOR 的順序、一片填滿再開下一片；id U1、U2…
function gateSlots(defId: string): Array<{ inputs: number[]; output: number }>;  // 從元件定義讀每一組的腳號
```

Tests（`tests/logic/synth.test.ts`）：
- 每種閘（AND/OR/NAND/NOR 的 2、3、4 輸入、NOT、XOR）各畫一張小圖，`decompose` 後的單元種類符合規格，`evaluateUnits` 對所有輸入組合的輸出 = `truthTable(d)`。
- 圖 2-5 → 3 個 AND2、2 個 OR2；`assignIcs` → U1 74LS08（3 組 + 1 空）、U2 74LS32（2 組 + 2 空）。
- 5 個 AND2 → 兩片 74LS08（4 + 1）。
- `gateSlots('74LS08')[0]` = `{ inputs: [1, 2], output: 3 }`；`gateSlots('74LS21')[1]` = `{ inputs: [9, 10, 12, 13], output: 8 }`；`gateSlots('74LS02')[0]` 的輸出是腳 1。
- `convertProblem`：迴圈、輸入沒接、沒有輸入端 / 輸出端、9 個輸入端的訊息；圖 2-5 → null。

### Task 2: 產生麵包板（`src/logic/toBreadboard.ts`）

**Produces:**
```ts
interface ConvertOptions { switchTo: 'vcc' | 'gnd'; board: 'auto' | 'MB102' | 'EIC1106' }
interface Bom { ics: Record<string, number>; switch: 'dipsw-4' | 'dipsw-8'; resistors: number; leds: number; layout: 'MB102' | 'EIC1106' }
type ConvertResult = { ok: true; circuit: Circuit; bom: Bom; switchId: 'SW1'; inputs: string[]; leds: Record<string, string> } | { ok: false; reason: string };
function toBreadboard(d: LogicDiagram, options: ConvertOptions): ConvertResult;   // inputs：依名稱排序的輸入端 id；leds：輸出端 id → LED 元件 id
```

做法：
- Netlist：每個訊號一個 Net（終端 = 元件腳），加上 `VCC`、`GND`。IC 的 power / ground 腳 → VCC / GND；沒用到的組的輸入 → GND。
  開關 `dipsw-4`（≤ 4 個輸入）或 `dipsw-8`：第 k 個開關的腳 k → 第 k 個輸入的訊號；腳 `pinCount + 1 − k` → VCC（`switchTo: 'vcc'`）或 GND。
  第 k 個輸入的電阻 R_k（330 Ω 下拉接 GND／1 kΩ 上拉接 VCC）：腳 1 → 輸入訊號、腳 2 → GND / VCC。
  每個輸出（依名稱）：電阻 220 Ω 腳 1 → 驅動這個輸出端的訊號、腳 2 → `led:${id}`；LED 腳 1（A）→ `led:${id}`、腳 2（K）→ GND。
  MB-102：V1（`vcc`）在 T+3、G1（`gnd`）在 B-3；EIC-1106：VCC / GND 的終端改成紅柱、黑柱的孔（沒有 V1 / G1）。
- 放置（MB-102，欄 1–63）：游標 x = 2；開關跨凹槽 anchor F{x}，x += 寬 + 2；每片 IC anchor F{x}，x += 9；
  兩腳元件（先輸入的電阻，再每個輸出的電阻、LED）兩個一組：第一個放 A 列、第二個放 J 列，從 x 起（腳在 x 與 x + span），x += 最大 span + 2。
  任何腳超過第 63 欄 → 放不下。
  EIC-1106：第 1 區放開關與輸入電阻、第 2 區放 IC、第 3 區放輸出的電阻與 LED，各區自己的游標，孔名加區號（`2-F10`）。
- 自動：MB-102 放得下就用，否則 EIC-1106，再放不下 → `零件太多，一塊 EIC-1106 放不下（需要 N 片 IC）`；指定 MB-102 放不下 → `MB-102 放不下，請改用 EIC-1106`。
- 連線導線：每個 Net 的終端依序兩兩相接（不同導通群組才接），每條從前一個終端那一排的空孔到下一個終端那一排的空孔（`straight: true`、`source: 'manual'`，每個孔只用一次）。
- 最後 `validateCircuit`：除了 `WIRE_` 開頭的以外有 error → `{ ok: false, reason: '轉換失敗：…（這是程式的錯，請回報）' }`。

Tests（`tests/logic/toBreadboard.test.ts`）：
- 圖 2-5（兩種接法）：元件 U1 74LS08、U2 74LS32、SW1 dipsw-4、R1–R3（330 Ω 或 1 kΩ）、R4 220 Ω、D1、V1、G1；`bom.layout = 'MB102'`；
  沒有非 WIRE 的錯誤；每個導通群組裡的元件腳都屬於同一個 Net（用 `analyzeCircuit` 的 Net 與腳位檢查）。
- 5 個輸入 → `dipsw-8`。
- 把 12 個 2 輸入 AND 串起來的圖（需要 3 片 74LS08 + 更多）在自動模式放不下 MB-102 時改用 EIC-1106，指定 MB-102 回報原因。
- 不能轉的圖回傳 `convertProblem` 的訊息。

### Task 3: 真值表比對（`src/logic/verifyBreadboard.ts`）

**Produces:**
```ts
interface VerifyResult { rows: number; mismatches: Array<{ inputs: string; expected: string; actual: string }> }
function verifyBreadboard(d: LogicDiagram, circuit: Circuit, switchTo: 'vcc' | 'gnd', map: { switchId: string; inputs: string[]; leds: Record<string, string> }): VerifyResult;
function verifyText(r: VerifyResult, outputs: string[]): string;   // 全部一致 / 有 N 列不一致：輸入 011 應該是 X = 1，麵包板是 0；…（最多 5 列）
```
每一列：依接法換算開關狀態（`vcc`：1 → ON；`gnd`：1 → OFF），改 `switchStates`，`compileSimulation` + `initialSimState` + `settle`，讀 `litLeds`。

Tests（`tests/logic/verifyBreadboard.test.ts`）：圖 2-5 兩種接法 8 列一致（產生後、以及 `autoPlaceAndRoute` 後）；把 D1 的腳對調（rotation 180）後有不一致；`verifyText` 文字。

### Task 4: store、對話框、按鈕、比對卡

- `store.ts`：`Dialog` 加 `'to-breadboard'`；`conversion: { switchTo; map } | null`（`loadCircuit` 清掉）；
  `convertLogic(options)`：`toBreadboard(useLogic.getState().diagram, options)`；失敗 → 錯誤提示；成功 → `commit('邏輯圖轉成麵包板', circuit, …)`、`workspace: 'breadboard'`、`conversion`、關對話框，接著 `runAutoRoute('apply', { moveIcs: true })`。
- `Dialogs.tsx`：`ToBreadboardDialog`（開關接法兩個選項、麵包板三個選項、用 `toBreadboard` 的 `bom` 預覽零件、麵包板上已經有東西時的提醒、「轉換」按鈕）。
- `LogicPanel.tsx` 沒選東西時、`Toolbar.tsx` 檔案選單（邏輯圖時）：「轉成麵包板…」→ `convertProblem` 有訊息就提示，否則開對話框。
- `PropertyPanel.tsx` 檢查分頁最上面：`conversion` 存在時顯示比對卡（`data-testid="conversion-check"`），用目前的電路即時計算（`verifyBreadboard`），綠色 / 紅色。
- 測試（`tests/web/convert.test.ts`）：`convertLogic` 後電路有 U1、U2、SW1；`workspace` 是 breadboard；Undo 回到原本的麵包板；`newCircuit` 後 `conversion` 是 null。

### Task 5: 端對端、文件

- `e2e/logic-to-breadboard.spec.ts`：載入範例圖 2-5 → 「轉成麵包板…」→ 對話框「轉換」→ 等佈線結束 → 麵包板有 `g[data-component-id="U1"]`、`U2`、`SW1`、`D1`；檢查分頁的比對卡「全部一致」。
- CHANGELOG、README、PROGRESS、規格狀態。
