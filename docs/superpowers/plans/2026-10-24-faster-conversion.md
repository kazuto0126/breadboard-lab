# 轉成麵包板變快 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 轉成麵包板的結果不變，時間變短（網頁同時用好幾個 Worker）。

**Architecture:** `autoPlaceAndRoute`（`src/core/icPlacement/autoPlace.ts`）的協商上限跟著最好的結果、可以從之前的結果接著搬；
`convertSteps`（`src/logic/convertRoute.ts`）是產生器，一批一批交出佈線工作；`convertAndRoute` 一次跑一件，`convertAndRouteParallel` 交給 `routeMany`；
網頁的 `startConversion`（`src/workers/routingClient.ts`）用 Worker 池跑每一批。

**Tech Stack:** TypeScript、Vitest、Playwright、Web Worker。

**Spec:** `docs/superpowers/specs/2026-10-24-faster-conversion-design.md`

## Global Constraints

- 結果不能變差：`npm run bench:convert` 的線數、總長和改之前一樣。
- 文件、註解用繁體中文；commit message 用英文。

## Review Focus

- 取消轉換時所有 Worker 都要停，不能留著在背景跑。
- 一次一件時「排到最好」的兩種依序分時間（前一種提早排完，多的時間給下一種），和以前一樣。
- 從之前的結果接著搬時，結果的 moves 與電源符號要和之前的結果一致（之前的結果就是同一個電路算的）。
- 沒有 Worker 的環境（測試、舊瀏覽器）照舊在主執行緒跑。

---

### Task 1: 可移動 IC 的佈線

**Files:** `src/core/icPlacement/autoPlace.ts`；Test `tests/icPlacement/candidateRounds.test.ts`

- [x] 測試（假的 autoRoute）：上限先照「IC 都不動」的輪數，找到 3 輪排完的位置後變成 30；傳入之前的結果時不重排第一次。
- [x] 失敗 → 實作 → 通過

### Task 2: 轉換分批、同時跑

**Files:** `src/logic/convertRoute.ts`、`src/workers/*.ts`；Test `tests/logic/convertRoute.test.ts`、`tests/web/convert.test.ts`

- [x] 測試：排到最好時傳入快速試的結果；同時跑與一次一件挑到同一種、每一批的件數（全部快速試、最好兩種）；Worker 數。
- [x] 失敗 → 實作 → 通過 → commit `perf(convert): …`

### Task 3: 量測與文件

- [x] `npm run bench:convert` 前後比較；網頁端對端在同一台電腦和 main 比較
- [ ] CHANGELOG、PROGRESS、backlog、README
