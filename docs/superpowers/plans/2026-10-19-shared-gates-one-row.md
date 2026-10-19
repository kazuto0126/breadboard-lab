# 共用 2 輸入閘與 EIC-1106 一排擺法 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 8 對 3 編碼器這類電路轉成麵包板時少一片 IC、少十幾條線。

**Architecture:** `decompose`（`src/logic/synth.ts`）拆 OR / NOR 時共用同一對訊號；`toBreadboard` 多一個擺法選項 `oneRow`（EIC-1106 全部排在第 2 區）；
`LAYOUT_VARIANTS.EIC1106` 加上一排的擺法。

**Tech Stack:** TypeScript、Vitest。

**Spec:** `docs/superpowers/specs/2026-10-19-shared-gates-one-row-design.md`

## Global Constraints

- 文件、介面文字、註解用繁體中文；commit message 用英文。
- 沒有可以共用的時候，`decompose` 的結果和現在完全一樣（現有測試不改）。
- `DEFAULT_LAYOUT` 不變（`{ gap: 6, leds: 'pair', split: false }`）。

## Review Focus

- 共用後不能產生迴圈、不能把一個閘的輸出接回自己（共用的那一對一定是那個閘自己的輸入）。
- 兩個一模一樣的 2 輸入 OR：各自保留，不互相取代。
- 只用 NAND / NOR 轉換時，共用的中間訊號一樣能換成 NAND / NOR。
- 一排擺法放不下時（零件太多）跳過那一種，不讓轉換失敗。
- 一排擺法的上 / 下拉電阻插在第 2 區旁邊的軌（P3+、P4−），電源軌沒有孔的欄照舊挪開關。

---

### Task 1: 共用 2 輸入閘

**Files:** Modify `src/logic/synth.ts`；Test `tests/logic/synth.test.ts`

- [ ] 測試：編碼器拆成 8 個 OR2（2 片 74LS32），每一列和真值表一樣；OR2(A,B) 與 OR3(A,B,C) 共用成 2 個單元；NOR3 與 OR3 共用一對；
  兩個一模一樣的 OR2 各自保留；只用 NAND 時共用的結果真值表一樣。
- [ ] 失敗 → 實作 → 通過 → commit `feat(logic): share 2-input ORs when splitting gates (sub-project 38)`

### Task 2: EIC-1106 一排擺法

**Files:** Modify `src/logic/toBreadboard.ts`、`src/logic/convertRoute.ts`；Test `tests/logic/toBreadboardLayout.test.ts`、`tests/logic/convertRoute.test.ts`

- [ ] 測試：`oneRow` 時開關、IC、LED 都在第 2 區（y 26–37），下拉電阻插進 P4−、上拉電阻插進 P3+，照計畫接線、比對一致、電源接法沒問題；
  MB-102 時 `oneRow` 沒有作用；`LAYOUT_VARIANTS.EIC1106` 有一排的擺法。
- [ ] 失敗 → 實作 → 通過 → commit `feat(logic): one-row layout on the EIC-1106 (sub-project 38)`

### Task 3: 量測、文件、檢查、PR

- [ ] 量測測試加上 C 的目標（≤ 62 條、2 片 IC）；跑 `npm run bench:convert`。
- [ ] CHANGELOG、README、PROGRESS、backlog（開關拆成兩個 4 位元）、規格狀態。
- [ ] typecheck、`npm test`、build、build:single、build:mcp、e2e；瀏覽器轉換實習七 C。commit、push、開 PR。
