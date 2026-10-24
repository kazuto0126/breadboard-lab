# 邏輯圖的時序元件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 邏輯圖可以畫時脈、正反器、計數器，看時序表，轉成麵包板後送脈衝比對；MCP 一樣。

**Architecture:** `src/logic/blocks.ts`（新方塊、沒接時的值）；`src/logic/evaluate.ts`（`topoOrder` 不算接到時序方塊的線、`evaluate(d, values, state)` 算到穩定、`sequenceTable`）；
`src/state/logic.ts`（`seq`、`pulse`、`resetSeq`）；畫面（時脈、時序表分頁）；`toBreadboard`（時脈元件、沒接的腳）；`verifyBreadboard.verifySequence`、`diagramCheck.checkSequence`；MCP。

**Tech Stack:** TypeScript、React、Zustand、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-24-sequential-logic-design.md`

## Global Constraints

- 時序方塊的行為用元件定義的 74LS 模型（和麵包板的模擬一樣）。
- 組合邏輯的迴圈仍然是錯誤。

## Review Focus

- 模型要先看過一次時脈的值才認得邊緣（上電後先用目前的輸入求一次值）。
- 同一個時脈的兩個正反器要用邊緣之前的值（同一輪先算完組合邏輯再一起更新）。
- 漣波計數器要一級一級傳下去（輸出有變就再算一次）。
- 沒接的時序 IC 輸入在轉換時一定要接到 +5 V / GND（例如 /CLR）。

---

### Task 1: 方塊與模擬

- [x] `tests/logic/sequential.test.ts`、`tests/logic/blocks.test.ts` → `blocks.ts`、`types.ts`、`evaluate.ts`、`check.ts`、`edit.ts`

### Task 2: 畫面

- [x] 時脈元件、元件庫的兩區、`seq` 狀態、時序表分頁、屬性面板；檔案、題目、布林式

### Task 3: 轉換與比對

- [x] `tests/logic/sequentialConvert.test.ts` → `toBreadboard.ts`、`verifyBreadboard.ts`、`diagramCheck.ts`、`synth.ts`

### Task 4: MCP、範例、文件

- [x] MCP（`logic_set` 排版、`logic_truth_table` 時序表、說明）；範例；`e2e/sequential-logic.spec.ts`；CHANGELOG、README、PROGRESS、backlog
