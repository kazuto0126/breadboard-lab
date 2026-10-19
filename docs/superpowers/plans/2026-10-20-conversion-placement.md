# 轉成麵包板的擺放改善與低態致動 LED（子專案 36、37）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 轉換時試好幾種擺法挑最好的（含直立的上 / 下拉電阻、跨凹槽的 LED、LED 分兩邊），並支援低態致動的 LED。

**Architecture:** `toBreadboard` 多一個內部的擺法參數；新的 `src/logic/convertRoute.ts` 產生候選、用可移動 IC 的佈線快速試、挑最好的再排到最好；
網頁在佈線 Worker 裡跑它，MCP 直接呼叫。低態致動是輸出端節點的屬性，比對時依 LED 的接法讀 0 / 1。

**Tech Stack:** TypeScript、React、Zustand、Web Worker、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-20-conversion-placement-design.md`

## Global Constraints

- 預設擺法（間隔 6、上下兩組、不分兩邊）＋直立電阻＝沒有試擺法時的結果；所有現有的轉換測試照樣要過。
- 電源照子專案 34：接最近的軌、軌和軌之間不拉線。
- `src/logic`、`src/core` 不能用瀏覽器 API；Worker 只呼叫純函式。
- 介面文字繁體中文；commit message 英文。

## Review Focus

- 開關的輸入欄剛好是電源軌沒有孔的欄 → 挪開關或退回平放電阻，不能插到沒有孔的地方（Task 1）。
- 試擺法時某一種放不下（NoRoom）→ 跳過，不讓整個轉換失敗（Task 3）。
- 網頁轉換到一半按「取消」或改了邏輯圖 → 不套用過期的結果（Task 4）。
- 低態致動的輸出接到 7 段顯示器以外的東西、或沒有接 → 和現在一樣的檢查訊息（Task 5）。

---

### Task 1: 直立的上 / 下拉電阻、5V / GND 符號插在空孔

**Files:** Modify `src/logic/toBreadboard.ts`; Test `tests/logic/toBreadboardPulls.test.ts`（新）

- [ ] 測試：多數決 `pulls: true`、`switchTo: 'vcc'`（MB-102）→ 每顆下拉電阻的第 1 腳在開關那一排的 J 列、第 2 腳在 − 軌；`switchTo: 'gnd'` → 第 1 腳在 A 列、第 2 腳在 + 軌；
  EIC-1106 同樣；8 個輸入（dipsw-8，一定會碰到沒有孔的欄）→ 碰到的那個輸入用平放的電阻、其他直立，電阻腳都在孔上；
  和邏輯圖比對全部一致、`powerProblems` 沒有問題；初始符號不會和電阻搶孔（開關在第 3 欄時也行）。
- [ ] 失敗 → 實作 → 通過 → `npx vitest run tests/logic` → commit `feat(logic): upright pull resistors into the rail (sub-project 36)`

### Task 2: 擺法參數

**Files:** Modify `src/logic/toBreadboard.ts`; Test `tests/logic/toBreadboardLayout.test.ts`（新）

**Interfaces — Produces:** `export interface LayoutVariant { gap: number; leds: 'pair' | 'straddle'; split: boolean }`；
`export const DEFAULT_LAYOUT: LayoutVariant = { gap: 6, leds: 'pair', split: false }`；`toBreadboard(d, options, layout = DEFAULT_LAYOUT)`。

- [ ] 測試：`gap: 2` 時相鄰區塊之間空 2 欄；`leds: 'straddle'` → 電阻第 1 腳在 E 列、第 2 腳在 F 列同一欄，LED 陽極在 I 列同一欄、陰極在右邊一欄，LED 一顆接一顆；
  `split: true`（MB-102、4 顆以上）→ 前一半 LED 在開關左邊；各種組合都照計畫接線、比對全部一致。
- [ ] 失敗 → 實作 → 通過 → commit `feat(logic): layout variants for logic-to-breadboard (sub-project 36)`

### Task 3: 試擺法挑最好的

**Files:** Create `src/logic/convertRoute.ts`; Test `tests/logic/convertRoute.test.ts`；`tests/bench/conversion.bench.test.ts`（新，不在一般測試裡）；`package.json`（`bench:convert`）、`vitest.config`（排除 bench）

**Interfaces — Produces:** `convertAndRoute(d: LogicDiagram, options: ConvertOptions, budget?: { totalMs?: number }): { ok: true; result: ConvertSuccess; routed: RoutingResult; tried: number } | { ok: false; reason: string }`
（`ConvertSuccess` = `Extract<ConvertResult, { ok: true }>`）

- [ ] 測試：A 比較器（只用 NOR、下拉電阻）→ MB-102、`success`、≤ 27 條線、比對全部一致；多數決（下拉電阻）→ ≤ 28 條；放不下的擺法被跳過；
  `board: 'MB102'` 只試 MB-102；量測測試：B（不加電阻）在 MB-102 排得完、C ≤ 70 條、BCD ≤ 60 條、每個 40 秒內。
- [ ] 失敗 → 實作 → 通過 → commit `feat(logic): try several layouts and keep the best routing (sub-project 36)`

### Task 4: 網頁與 MCP 用新的轉換

**Files:** Modify `src/workers/protocol.ts`、`routing.worker.ts`、`routingClient.ts`、`src/state/store.ts`（`convertLogic`）、`src/mcp/tools.ts`（`logicToBreadboard`）；Test e2e 與 `tests/mcp/tools.test.ts`

- [ ] 測試：MCP 的 A 比較器 → MB-102、≤ 27 條；e2e：多數決轉換後狀態列顯示轉換中、完成後兩步 Undo（先回到沒佈線、再回到轉換前）、和邏輯圖比對全部一致；現有轉換的 e2e 照樣過。
- [ ] 失敗 → 實作（Worker 新的工作種類 `convert`；store 轉換時不再先放沒佈線的板子，算完一次放上去再套用佈線；拿掉 MB-102 → EIC-1106 的重試）→ 通過 → commit `feat: convert with layout search in the worker and MCP (sub-project 36)`

### Task 5: 低態致動 LED（子專案 37）

**Files:** Modify `src/logic/types.ts`、`file.ts`、`edit.ts`、`evaluate.ts`（燈號）、畫面（輸出端的燈與屬性面板）、`toBreadboard.ts`、`verifyBreadboard.ts`、`diagramCheck.ts`、`scripts/mcp-server.ts`；Test `tests/logic/activeLow.test.ts`、e2e

- [ ] 測試：輸出端 `activeLow` 讀檔 / 存檔、切換（Undo）；燈號 0 時亮；轉換：LED 陽極接 VCC、陰極經過電阻接到輸出（兩種擺法）；
  B 解碼器（`/Y0`… 接到低態致動的輸出端）轉換後比對全部一致；手接的低態致動 LED（圖 B）依名稱比對全部一致；e2e：屬性面板切換後燈號 0 時亮、轉換後比對全部一致。
- [ ] 失敗 → 實作 → 通過 → commit `feat: active-low LED outputs (sub-project 37)`

### Task 6: 文件、量測、全部檢查、PR

- [ ] CHANGELOG、README、PROGRESS、backlog（兩個顯示器、大電路接不完）、規格狀態；跑 `npm run bench:convert` 把結果寫進 CHANGELOG。
- [ ] typecheck、`npm test`、build、build:single、build:mcp、完整 e2e；瀏覽器實際轉換 A、B。commit、push、開 PR。
