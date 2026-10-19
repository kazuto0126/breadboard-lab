# 輸入布林式產生題目與麵包板（子專案 35）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在題目分頁與 MCP 用布林式建立題目，一鍵產生邏輯圖並打開「轉成麵包板」。

**Architecture:** 新的純函式模組 `src/logic/expression.ts`（遞迴下降語法分析 → 語法樹 → 逐列求值 → `createTask`）；畫面與 MCP 只呼叫它。

**Tech Stack:** TypeScript、React、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-19-boolean-expressions-design.md`

## Global Constraints

- 名稱規則、輸入 / 輸出上限、錯誤訊息沿用 `src/logic/task.ts`（`createTask`）。
- 變數 = 一個英文字母 + 可有可無的數字；輸入依自然排序（`A2` 在 `A10` 前面），第一個是最高位元。
- 優先順序：反相 > AND > XOR > OR。
- 介面文字、錯誤訊息繁體中文；commit message 英文。

## Review Focus

- 從文件複製來的式子（彎引號 `’`、全形空白、`·`）→ 照樣讀得懂（Task 1）。
- `X = X + A` 這種輸出同時當輸入 → 說明「名稱 X 同時是輸入和輸出」（Task 1）。
- 用布林式改寫已經有的題目後按 Undo → 回到原本的題目（Task 2）。
- 有括號沒關、運算子後面沒東西、怪字元 → 指出第幾行第幾個字（Task 1）。

---

### Task 1: 讀布林式、建立題目

**Files:** Create `src/logic/expression.ts`; Test `tests/logic/expression.test.ts`

**Interfaces — Produces:**
- `type Expr = { kind: 'var'; name: string } | { kind: 'const'; value: 0 | 1 } | { kind: 'not'; arg: Expr } | { kind: 'and' | 'or' | 'xor'; args: Expr[] }`
- `parseExpressions(text: string): { ok: true; outputs: Array<{ name: string; expr: Expr }>; inputs: string[] } | { ok: false; reason: string }`
- `taskFromExpressions(text: string): TaskResult`（`src/logic/task.ts` 的型別）

- [ ] 測試：`X = AB + A'C`（inputs `['A','B','C']`，ones `[1,3,6,7]`）；`*`、`·`、`&`、`∧` 與連寫一樣；`!A`、`~A`、`¬A`、`A'`、`A’` 一樣；`(A+B)'`；`A ⊕ B`、`A ^ B`；
  優先順序 `A + BC` ≠ `(A + B)C`、`A ⊕ BC`；`0`、`1`；`A B` = `AB`；`A1B` 的輸入是 `A1`、`B`；兩行各一個輸出；沒寫名稱一行 → `F`、兩行 → `F1`、`F2`；
  輸入排序 `B A10 A2` → `A2 A10 B`；錯誤：`X = (A + B` →「第 1 行第 5 個字：括號沒有關起來」（位置指到開括號）、`X = A +` →「第 1 行：+ 後面少了東西」、
  `X = A $ B` →「第 1 行第 7 個字：看不懂「$」」、`= A` →「第 1 行：要寫成「輸出名稱 = 式子」」、空白 →「先輸入布林式，例如 X = AB + A'C」、
  `X = X + A` →「名稱 X 同時是輸入和輸出」、7 個輸入 →「輸入最多 6 個（64 列）」。
- [ ] 跑測試確認失敗 → 實作 → 跑測試通過 → typecheck → commit `feat(logic): read boolean expressions into a task (sub-project 35)`

### Task 2: 題目分頁

**Files:** Modify `src/components/Logic/TaskTab.tsx`; Test `e2e/truth-table-task.spec.ts`

- [ ] 測試（e2e）：沒有題目時，在「布林式」輸入 `X = AB + A'C`、按「用布林式建立題目」→ 8 列、`[data-sop="X"]` 是 `AB + A'C`；
  有題目時按「布林式…」輸入 `Y = A + B`、按「用布林式改寫題目」→ 4 列；Ctrl+Z 回到 8 列；錯誤時顯示訊息、題目不變；
  「產生並轉成麵包板…」→ 出現「轉成麵包板」視窗 → 轉換 → 檢查分頁「和題目比對」全部一致。
- [ ] 跑測試確認失敗 → 實作（共用一個 `ExpressionForm` 元件）→ 跑測試通過 → typecheck → commit `feat: boolean expressions in the task tab (sub-project 35)`

### Task 3: MCP

**Files:** Modify `src/mcp/taskTools.ts`、`scripts/mcp-server.ts`、`public/mcp/index.html`; Test `tests/mcp/taskTools.test.ts`、`tests/mcp/guide.test.ts`

- [ ] 測試：`taskSet(f, { expressions: "X = AB + A'C" })` → ones `[1,3,6,7]`；和其他用法混用 → 「inputs / outputs、expressions、from_diagram、clear 只能選一種」；
  式子錯 → 錯誤訊息；說明頁有一個布林式的例子。
- [ ] 跑測試確認失敗 → 實作（schema：`expressions: z.string().optional()`）→ 跑測試通過 → commit `feat(mcp): task_set accepts boolean expressions (sub-project 35)`

### Task 4: 文件與全部檢查

- [ ] CHANGELOG、README（功能表「真值表題目」、路線圖 35）、PROGRESS、backlog（拿掉「布林式」的前半）、規格狀態。
- [ ] typecheck、`npm test`、build、build:single、完整 e2e；瀏覽器實際操作一次。commit、push、開 PR。
