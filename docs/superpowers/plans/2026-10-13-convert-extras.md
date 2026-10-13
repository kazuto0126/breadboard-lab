# 轉成麵包板的加強 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 轉換時可以選「只用 NAND（74LS00）」；指撥開關與 LED 可以有名稱（轉換自動填、屬性面板可改、板上與接線清單顯示）。

**Architecture:** `src/logic/nandOnly.ts` 把子專案 13 拆好的單元換成 2 輸入 NAND 並化簡；`toBreadboard` 依 `options.gates` 選用；
`ComponentProps.labels` 存名稱，畫面、清單、讀檔各自讀它。

**Spec:** `docs/superpowers/specs/2026-10-13-convert-extras-design.md`

## Global Constraints

- `src/logic/` 純函式。介面文字繁體中文；commit message 英文。
- 名稱最多 8 個字、前後空白去掉、空字串 = 沒有名稱。
- 每個 task 結束 `npm run typecheck && npm test`；畫面 task 加 e2e。

## Review Focus

1. 化簡把仍在使用的閘拿掉（輸出端接的訊號被當成沒用到）→ 測試：輸出端直接接一個 NOT 的情況、XOR。
2. `NOT(NOT x)` 抵消後，原本接 `NOT(NOT x)` 的地方要改接 x（含輸出端）→ 測試：AND 後面接 NOT（= NAND）。
3. 舊檔沒有 `labels`、`labels` 不是字串陣列 → 讀檔照常 / 拒絕。
4. 指撥開關改成更少的開關數時（不會發生：開關數固定）— 不需要處理。
5. 名稱改成空白 → 拿掉那一個名稱，板上不畫。

---

### Task 1: `toNandUnits`（`src/logic/nandOnly.ts`）

- Produces：`toNandUnits(units: Unit[], keep: string[]): Unit[]`（`keep`：一定要保留的訊號，也就是輸出端接的訊號）。
- 先把 AND3 / AND4 拆成 AND2 串，再照規格第 2 節換成 NAND2；化簡：`NOT(NOT x)` → x（把所有使用者改接 x）、相同輸入（不分順序）的 NAND 共用、拿掉沒用到且不在 `keep` 裡的 NAND，重複到不再改變。
- Tests（`tests/logic/nandOnly.test.ts`）：每種單元與 3、4 輸入的閘換完後 `evaluateUnits` 結果相同且全部是 NAND2；AND → NOT 的圖（等於 NAND）只剩 1 個 NAND；同一個訊號兩次反相只做一個；圖 2-5 的數量。

### Task 2: 轉換選項與名稱填入

- `ConvertOptions.gates?: 'direct' | 'nand'`（預設 `'direct'`）；`'nand'` 時單元用 `toNandUnits(decompose(d), 輸出端的來源訊號)`。
- 開關 `props.labels`：第 k 個是第 k 個輸入端名稱，其餘空字串；LED `props.labels = [輸出端名稱]`。
- Tests：圖 2-5 `gates: 'nand'` 只有 74LS00、兩種接法佈線前後比對一致；`labels` 值。

### Task 3: 名稱的資料、讀檔、編輯、清單、畫面、對話框

- `ComponentProps.labels?: string[]`；`fileFormat` 讀檔：字串陣列，每個截斷到 8 個字；不是字串陣列 → 錯誤「必須是文字陣列」。
- `commands.setLabel(circuit, id, index, text)` → 更新 `labels`（補空字串到 index；全部空白時拿掉 `labels`）；store `setLabel` 進 Undo（標籤「修改 SW1 的名稱」）。
- `checklist.ts`：開關腳的描述加「第 k 個開關（A）」、LED 加「（X）」——依現有文字格式加在元件名稱後面。
- `ComponentGraphic.tsx`：開關每個有名稱的開關在本體上方畫名稱（`data-label`）；LED 右上角畫名稱。
- `PropertyPanel.tsx`：開關：每個開關一個名稱輸入框（`aria-label="開關 k 名稱"`）；LED：「名稱」輸入框（`aria-label="LED 名稱"`）。Enter 或離開時存。
- `Dialogs.tsx`：「閘的種類」兩個選項。
- Tests：讀檔、`setLabel`、清單文字。

### Task 4: 端對端與文件

- `e2e/logic-to-breadboard.spec.ts` 加一個 test：「只用 NAND」→ 只有 74LS00、比對一致、板上 `[data-label]` 有 A、B、C、X；屬性面板把開關 1 名稱改成 IN1，板上跟著變。
- CHANGELOG、README、PROGRESS、規格狀態。
