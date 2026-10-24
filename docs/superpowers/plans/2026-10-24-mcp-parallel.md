# MCP 轉換同時跑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MCP 的 `logic_to_breadboard` 用好幾個執行緒同時試擺法，結果不變、時間變短。

**Architecture:** `scripts/mcp-pool.ts`（worker_threads 池，執行緒載入同一個模組）；`scripts/mcp-server.ts` 用 `logicToBreadboardParallel`，只在主執行緒連上 AI 工具。

**Tech Stack:** Node worker_threads、Vitest。

**Spec:** `docs/superpowers/specs/2026-10-24-mcp-parallel-design.md`

## Global Constraints

- 打包版仍然只有一個檔案、只 import Node 內建模組。
- 伺服器的 stdout 只能有 MCP 的訊息。

## Review Focus

- 打包版的執行緒載入整個檔案：不能連上 stdio、不能印東西到 stdout、工作資料夾的檢查不能讓執行緒結束。
- 執行緒意外結束時不能讓之後的轉換卡住。
- 閒著的執行緒不能讓伺服器關不掉。

---

### Task 1: 佈線執行緒池

- [x] `scripts/mcp-pool.ts`；測試 `tests/mcp/pool.test.ts`（執行緒數、結果和主執行緒一樣、真的用到兩個執行緒、從之前的結果接著搬）

### Task 2: 伺服器

- [x] `logicToBreadboardParallel`、`withFileAsync`、只在主執行緒 `server.connect`；`tests/mcp/bundle.test.ts` 加上打包版的轉換

### Task 3: 量測與文件

- [x] 量測；CHANGELOG、README、PROGRESS、backlog
