# 接線規則 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 所有導線只能水平或垂直、轉彎分兩條、不重疊不交叉、不跨過 IC；手動接線、MCP、AI 佈線、檢查都照這個規則。

**Architecture:** 手動接線與 MCP 共用 `straightWireProblem`（`src/editor/manualWire.ts`）；Check Circuit 在 `src/core/circuit/validate.ts`；
AI 佈線的交叉在 `straightSearch.ts`（成本）、`straightState.ts`（衝突）、`legality.ts`（最後把關）。

**Tech Stack:** TypeScript、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-20-wiring-rules-design.md`

## Global Constraints

- 文件、介面文字、註解用繁體中文；commit message 用英文。
- 新規則和舊規則衝突時以新規則為準。

## Review Focus

- 跨板（同一個 Board Group）的線：水平 / 垂直用全域格子判斷。
- 一條線的端點接在另一條線的中段（T 字）本來就不行（covered / 經過端點），不能因為改交叉的判斷而放行。
- 協商時把交叉當衝突後不能無限重排（有輪數上限，最後用嚴格模式放回去，放不回去就算排不完）。
- 轉換、量測的結果不能有交叉。

---

### Task 1: 手動接線與 MCP `add_wire`

**Files:** `src/editor/manualWire.ts`、`src/mcp/tools.ts`；Test `tests/editor/manualWire.test.ts`、`tests/mcp/tools.test.ts`

- [ ] 測試：斜線被拒絕（diagonal）；和別的線交叉被拒絕（crossing，指出哪條線、在哪）；橫的、直的經過 IC 都被拒絕；
  水平、垂直、端點接在別條線端點同一孔照舊可以；MCP `add_wire` 回覆說明原因。
- [ ] 失敗 → 實作 → 通過 → commit `feat(editor): wires must be horizontal or vertical and must not cross (sub-project 39)`

### Task 2: Check Circuit

**Files:** `src/core/circuit/validate.ts`；Test `tests/circuit/validate*.test.ts`

- [ ] 測試：斜線 → WIRE_DIAGONAL；會轉彎的路徑導線 → WIRE_BENT；交叉 → WIRE_CROSSING（兩條線都標出）；水平垂直、不交叉的不報。
- [ ] 失敗 → 實作 → 通過；範例電路修成合規 → commit `feat(circuit): check flags diagonal, bent and crossing wires (sub-project 39)`

### Task 3: AI 佈線不准交叉

**Files:** `src/core/routing/straightSearch.ts`、`straightState.ts`、`legality.ts`、`autoRoute.ts`；Test `tests/routing/*`

- [ ] 測試：合法性檢查對交叉的線回報 CROSSING；嚴格模式的成本不准交叉；協商的衝突包含交叉；範例與驗收電路的佈線交叉 0 處且通過合法性檢查。
- [ ] 失敗 → 實作 → 通過 → commit `feat(routing): crossings are not allowed (sub-project 39)`

### Task 4: MCP 與說明

**Files:** `scripts/mcp-server.ts`、`src/mcp/tools.ts`、`public/mcp/index.html`、畫面說明文字、README

- [ ] 測試：`logic_to_breadboard` 佈線沒完成時不寫入檔案；MCP 說明寫上規則（伺服器整合測試讀得到）。
- [ ] 失敗 → 實作 → 通過 → commit `feat(mcp): wiring rules in the MCP tools (sub-project 39)`

### Task 5: 量測、文件、檢查、PR

- [ ] `npm run bench:convert`（加上交叉數）；CHANGELOG、README、PROGRESS、規格狀態；typecheck、`npm test`、build、build:single、build:mcp、e2e（手動拉斜線的舊測試改成被拒絕）。
- [ ] commit、push、開 PR（基於 #56）。
