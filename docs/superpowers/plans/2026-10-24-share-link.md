# 用連結開啟電路 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 電路壓縮後放在網址 `#c=` 後面；網頁可以複製連結、點開連結開啟；MCP 有 `share_link`。

**Architecture:** `src/editor/shareLink.ts`（CompressionStream，網頁與 MCP 共用）；store 的 `openShared` / `confirmShared` 與 `confirm-link` 對話框；
`src/state/fileActions.ts` 的 `copyShareLink`、`openFromLocationHash`（App 開啟時與 hashchange）；`src/mcp/tools.ts` 的 `shareLink`。

**Tech Stack:** TypeScript、React、Zustand、CompressionStream、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-24-share-link-design.md`

## Global Constraints

- 打開連結不能默默蓋掉未儲存的修改（Undo 回不去）。
- 介面文字繁體中文；commit message 英文。

## Review Focus

- 重新整理後不能再開一次連結（蓋掉之後的修改）。
- 開發模式（StrictMode）同時叫兩次時只開一次。
- 連結被截斷（通訊軟體）時說明原因、不動目前的電路。
- 離線版（file://）複製的連結要能在線上版打開。

---

### Task 1: 連結的編碼與解碼

- [x] `tests/editor/shareLink.test.ts` → `src/editor/shareLink.ts`

### Task 2: 網頁

- [x] `tests/web/shareLink.test.ts`（store）→ store、對話框、選單、App；`e2e/share-link.spec.ts`

### Task 3: MCP 與文件

- [x] `share_link`（tools、server、說明、設定說明頁）；`tests/mcp/*`；CHANGELOG、README、PROGRESS、backlog
