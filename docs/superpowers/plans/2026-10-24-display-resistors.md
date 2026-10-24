# 7 段顯示器的電阻接法 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 轉換時可以選每段一顆電阻或共同腳共用一顆，共用時兩個顯示器排得完；MCP 一樣。

**Architecture:** `ConvertOptions.displayResistors`；`displayResistorsOf`、`convertProblem(d, options)`（`src/logic/synth.ts`）；
`toBreadboard` 的顯示器區塊；對話框的選項；MCP `display_resistors`。

**Tech Stack:** TypeScript、React、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-24-display-resistors-design.md`

## Global Constraints

- 每段一顆電阻仍然是 1 個顯示器時的預設（亮度一致）。
- MCP 與網頁的預設一樣。

## Review Focus

- 共陰極時電阻在共同腳和 GND 之間（方向不能反）。
- 小數點、每段直接控制的顯示器在共用時也直接接。
- Check Circuit 不能把共用電阻的顯示器報成「沒有限流電阻」。
- 沒選的時候（MCP 沒給、舊的呼叫）兩個顯示器也能轉。

---

### Task 1: 轉換

- [x] `tests/logic/displayResistors.test.ts` → `synth.ts`、`toBreadboard.ts`、`convertRoute.ts`、store

### Task 2: 網頁與 MCP

- [x] 對話框選項；`e2e/display-resistors.spec.ts`；MCP 參數與 `tests/mcp/tools.test.ts`；量測加上兩個顯示器

### Task 3: 文件

- [x] CHANGELOG、README、PROGRESS、backlog、規格
