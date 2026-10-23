# 在邏輯圖上顯示布林式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每個輸出端列出「照圖寫出來」與「化簡後」的布林式，顯示在真值表分頁、屬性分頁、邏輯圖上（可開關）與 MCP。

**Architecture:** 新檔 `src/logic/formula.ts`：從邏輯圖建出 `Expr`（沿用 `src/logic/expression.ts` 的型別）再轉成文字；化簡用 `minimize`。
畫面在 `LogicPanel.tsx`（真值表分頁、屬性分頁）與 `LogicCanvas.tsx`（輸出端下面的文字），開關放在 `useLogic` 的 `showFormulas`。

**Tech Stack:** TypeScript、React、Zustand、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-23-diagram-formulas-design.md`

## Global Constraints

- 文件、介面文字、註解用繁體中文；commit message 用英文。
- 式子的寫法要能貼回「輸入布林式」（`parseExpressions`）。

## Review Focus

- 輸入名稱不是「字母加數字」時 AND 用 `·`（這種名稱「輸入布林式」本來就讀不了，不能貼回去）；常數接在 AND 裡也要用 `·`（`A1` 會被讀成一個變數）。
- 反相的反相（`A''`）、XOR 裡面有 OR、AND 裡面有 XOR 的括號。
- 有迴圈時不能無限遞迴。
- 很大的圖（同一個閘接到很多地方）式子會變長，但不能卡住。

---

### Task 1: `formula.ts`

**Files:** Create `src/logic/formula.ts`、`tests/logic/formula.test.ts`；Modify `src/logic/expression.ts`（匯出 `evalExpr` 給測試用，若沒有）

**Interfaces — Produces:**
`exprText(e: Expr, dot: boolean): string`、
`diagramFormulas(d: LogicDiagram): { outputs: Array<{ id: string; name: string; read: string | null; simplified: string | null; readProblem?: string; simplifiedProblem?: string }>; displays: boolean }`

- [ ] 測試：AND / OR / NOT / NAND / NOR / XOR 的寫法與括號；`Cin` 這類名稱用 `·`；沒接寫 `?`；IC 方塊、迴圈、超過 8 個輸入；
  好幾種圖照圖寫出來貼回 `parseExpressions` 後真值表一樣；化簡後的式子與真值表一致。
- [ ] 失敗 → 實作 → 通過 → commit `feat(logic): Boolean formulas of a drawn diagram (sub-project 40)`

### Task 2: 畫面

**Files:** `src/state/logic.ts`、`src/components/Logic/LogicPanel.tsx`、`src/components/Logic/LogicCanvas.tsx`；Test `e2e/logic-diagram.spec.ts`（或新的 `e2e/diagram-formulas.spec.ts`）

- [ ] 真值表分頁的「布林式」區、「在圖上顯示」勾選框；屬性分頁選取輸出端時的式子；畫布輸出端下面的文字。
- [ ] e2e：畫 A、B 接 NAND 到 X，真值表分頁看到 `X = (AB)'` 與化簡 `A' + B'`；勾選後畫布出現式子，取消後消失；屬性分頁也有。
- [ ] commit `feat(logic): show Boolean formulas in the panel and on the diagram (sub-project 40)`

### Task 3: MCP 與文件

**Files:** `src/mcp/tools.ts`、`scripts/mcp-server.ts`；Test `tests/mcp/tools.test.ts`；文件 CHANGELOG、README、PROGRESS、backlog、規格狀態

- [ ] `logic_truth_table` 回覆加上布林式；工具說明提到布林式。
- [ ] commit `feat(mcp): truth table reply includes Boolean formulas (sub-project 40)`、`docs: sub-project 40 …`
