# 轉換與佈線的改善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 下拉電阻預設加上且插在開關那一排、IC 之間至少空 2 欄、拆成 4 位元開關、空的電源軌當訊號通道、電路名稱可以改；MCP 一樣。

**Architecture:** 佈線：`straightSearch.groupUse` / `viaCost`（`weights.rail`）、`legality`；轉換：`toBreadboard`（`splitSwitches`、`Block.ic`、`IC_GAP`）；
網頁：對話框預設、`renameProject`、Toolbar 的 `ProjectName`；MCP：`pulls` 預設、`rename_circuit`。

**Tech Stack:** TypeScript、React、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-25-convert-improvements-design.md`

## Global Constraints

- 量測不能明顯變差（記錄在 CHANGELOG）。

## Review Focus

- 有電源的軌不能被別的 Net 當轉接排。
- IC 之間空出來的欄不能把零件推出板子（放之前檢查）。
- 改名時 Esc 不能把名稱改掉。

---

### Task 1: 空的電源軌
- [x] legality / straightSearch 測試 → `groupUse`、`viaCost`、`weights.rail`；量測選 200

### Task 2: 轉換
- [x] 4 位元開關、IC 間距測試 → `toBreadboard`；預設加上電阻（對話框、MCP）、e2e

### Task 3: 改名
- [x] store 測試、MCP 測試、e2e → `renameProject`、`ProjectName`、`rename_circuit`

### Task 4: 文件
- [x] CHANGELOG、README、PROGRESS
