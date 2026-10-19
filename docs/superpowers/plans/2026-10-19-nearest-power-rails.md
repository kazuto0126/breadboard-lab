# 轉成麵包板時電源接最近的軌（子專案 34）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「轉成麵包板」的 5V / GND 腳接最近的同極性電源軌，用到的軌各插一個符號、軌和軌之間不拉線；可移動 IC 的佈線搬動 IC 後也一樣。

**Architecture:** 核心新增 `src/core/circuit/powerRails.ts`：找最近的軌、把電源 Net 重新接成「每個腳的群組 → 最近的軌」的星狀連線（並補上 / 拿掉符號）。
轉換在建好連線後呼叫它；`autoPlaceAndRoute` 在設定 `placement.nearestPowerRail` 打開時，每個候選位置佈線前呼叫它，結果帶回符號的變動，`applyRouting` 套用。

**Tech Stack:** TypeScript、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-19-nearest-power-rails-design.md`

## Global Constraints

- `src/core/` 不能用瀏覽器 API，也不能 import `src/editor/`、`src/logic/`（依賴方向由上往下）。
- 只有「轉成麵包板」（網頁 `convertLogic`、MCP `logic_to_breadboard`）打開新選項；預設關閉，其他佈線行為與現有測試完全不變。
- 「最近」：比上下距離（y），同樣近取上面的軌；只看同一塊板；極性看軌的群組 ID 最後一個字（`+` / `-`）。
- 新補的符號放在那條軌第 3 欄起第一個空孔；編號接著現有的 `V#` / `G#`。
- 回覆、註解繁體中文；commit message 英文。

## Review Focus

- IC 轉 180° 或換插孔區後，電源腳接到新的最近的軌，並補上那條軌的符號（Task 2 的測試釘住）。
- 一條軌上原本的符號沒有任何腳用到了 → 拿掉，不留沒用的符號（Task 1、Task 2）。
- 同一個群組有好幾隻要接電源的腳（例如兩顆 IC 的 VCC 不同群組、開關一側）→ 每個群組一條線，不重複（Task 1）。
- 佈線失敗（partial）時不套用，留下的手動接線版本身就已經接最近的軌（Task 3）。
- 一般 AI 佈線（選項關閉）保留使用者自己拉的軌對軌的線（Task 2）。

---

### Task 1: 核心：最近的軌與重新接電源

**Files:**
- Create: `src/core/circuit/powerRails.ts`
- Test: `tests/circuit/powerRails.test.ts`

**Interfaces:**
- Produces:
  - `type Polarity = '+' | '-'`
  - `nearestRailGroup(board: Breadboard, groupId: string, polarity: Polarity): string | null` — `groupId` 是同一塊板上的導通群組；回傳最近的該極性軌的群組 ID。
  - `interface PowerRebind { circuit: Circuit; added: ComponentInstance[]; removed: string[] }`
  - `connectPowerToNearestRails(circuit: Circuit): PowerRebind` — 對每個 kind 是 `power` / `ground` 的 Net（`extractNets`）：
    拿掉屬於這個 Net 的導線，對 Net 的每個非電源軌終端群組（`terminalGroupIds` 去掉 rail）接一條直線到最近的同極性軌
    （群組裡離軌最近的空孔 → 軌上 x 最接近的空孔；空孔要避開元件腳、本體與其他導線的端點）；
    用到的軌沒有同極性的 `vcc` / `gnd` 符號時補一個；沒有用到的軌上的 `vcc` / `gnd` 符號拿掉。訊號 Net 的導線與其他元件不動。
    導線顏色：5V `#d32f2f`、GND `#212121`；ID `pw1`、`pw2`…（避開現有 ID）。

- [ ] **Step 1: 寫失敗的測試**（用 `src/editor/builder.ts` 建電路）
  - `nearestRailGroup`：MB-102 上半部的群組（例如 `E10` 所在）`+` → `b1:rail-T+`、`-` → `b1:rail-T-`；下半部（`F10`）→ `B+` / `B-`；
    EIC-1106 第 2 區上半部 → `P3`，下半部 → `P4`；第 1 區上半部 `-` → `P2-`（不是 P1）。
  - 74LS00 在 F10（VCC 第 14 腳在 E10、GND 第 7 腳在 F16），`vcc` 符號在 `B+3`、`gnd` 在 `T-3`，連線 `E10 → B+5`、`F16 → T-5`（都接到遠的軌）：
    結果 VCC 接到 `T+`、GND 接到 `B-`；`added` 是 T+ 與 B- 的符號，`removed` 是原本 B+、T- 的符號；沒有一條線兩端都在電源軌。
  - 兩顆 IC 的 VCC 腳串在一起再接到軌（`E10 → E20 → T+`）→ 各自一條線到 `T+`，`T+` 只有一個符號。
  - 有一條訊號線（`A12 → A30`）→ 原樣保留（同一個物件參照）。
  - 已經都接最近的軌時，回傳的導線集合連接關係不變、`added`、`removed` 都是空的。
- [ ] **Step 2: 跑測試確認失敗** — `npx vitest run tests/circuit/powerRails.test.ts` → FAIL（模組不存在）。
- [ ] **Step 3: 實作**。
- [ ] **Step 4: 跑測試** → PASS；`npm run typecheck`。
- [ ] **Step 5: Commit** — `feat(core): connect power pins to the nearest rails (sub-project 34)`

### Task 2: 可移動 IC 的佈線與套用結果

**Files:**
- Modify: `src/types/routing.ts`（`RoutingConfig.placement.nearestPowerRail: boolean`；`RoutingResult.powerSymbols?: { added: ComponentInstance[]; removed: string[] }`）
- Modify: `src/core/routing/config.ts`（預設 `nearestPowerRail: false`）
- Modify: `src/core/icPlacement/autoPlace.ts`（`route()`：檢查 `samePinPartition` 之後，選項打開時先 `connectPowerToNearestRails`；最好的結果帶 `powerSymbols`）
- Modify: `src/core/routing/apply.ts`（先套用 moves，再拿掉 `removed`、加上 `added`）
- Test: `tests/icPlacement/autoPlace.test.ts`、`tests/routing/apply.test.ts`（新，或放進現有的佈線測試檔）

**Interfaces:**
- Consumes: Task 1 的 `connectPowerToNearestRails`。
- Produces: `autoPlaceAndRoute(circuit, { placement: { nearestPowerRail: true } })` 的結果，套用後所有電源腳接最近的軌。

- [ ] **Step 1: 寫失敗的測試**
  - `applyRouting`：結果有 `powerSymbols` 時，電路拿掉 `removed`、多了 `added`，moves 照樣套用。
  - BCD 範例轉成 EIC-1106（`toBreadboard(bcdDiagram(), { board: 'EIC1106', switchTo: 'vcc' })`，這時轉換還沒改，電源是串在一起的）
    用選項打開的 `autoPlaceAndRoute` → `success`；套用後：沒有兩端都在電源軌的線；每條一端在電源軌的線，另一端的群組的最近同極性軌就是那條軌；
    每條用到的軌都有同極性符號、沒有符號閒置；`checkAgainstDiagram(bcdDiagram(), 套用後)` 全部一致。
  - 選項關閉時，同一個電路的結果和現在一樣（有軌對軌的線，沒有 `powerSymbols`）。
- [ ] **Step 2: 跑測試確認失敗**。
- [ ] **Step 3: 實作**。
- [ ] **Step 4: 跑測試** — `npx vitest run tests/icPlacement tests/routing` → PASS。
- [ ] **Step 5: Commit** — `feat(core): optional nearest-rail power when moving ICs (sub-project 34)`

### Task 3: 轉換改用最近的軌

**Files:**
- Modify: `src/logic/toBreadboard.ts`（電源符號先各放一個：MB-102 `V1` 在 `T+3`、`G1` 在 `B-3`；EIC-1106 `V1` 在 `P2+3`、`G1` 在 `P3-3`；
  連線照舊建好後呼叫 `connectPowerToNearestRails`，依 `added` / `removed` 更新元件與 `netOf`）
- Modify: `tests/logic/toBreadboard.test.ts`、`tests/logic/toBreadboardDisplay.test.ts`（`wiredAsPlanned` 不把 `VCC` / `GND` 分成好幾塊算成錯，
  另外檢查每一塊都有同極性符號）
- Test: `tests/logic/toBreadboardPower.test.ts`（新）

- [ ] **Step 1: 寫失敗的測試** — 多數決（MB-102、EIC-1106）、BCD（共陽極、共陰極）、只用 NAND、按鈕輸入、`pulls: true`：
  轉換後沒有兩端都在電源軌的線；每條一端在電源軌的線接的是最近的同極性軌；用到的軌都有符號、沒有閒置的符號；
  再用打開選項的 `autoPlaceAndRoute` 佈線並套用後同樣成立，且 `checkAgainstDiagram` 全部一致。
- [ ] **Step 2: 跑測試確認失敗**。
- [ ] **Step 3: 實作**；更新兩個測試檔的 `wiredAsPlanned`。
- [ ] **Step 4: 跑測試** — `npx vitest run tests/logic` → PASS。
- [ ] **Step 5: Commit** — `feat(logic): logic-to-breadboard powers each pin from the nearest rail (sub-project 34)`

### Task 4: 網頁與 MCP 打開選項

**Files:**
- Modify: `src/state/store.ts`（`runAutoRoute` 的 options 多 `nearestPower?: boolean`，傳 `{ placement: { nearestPowerRail: true } }` 給 `startRouting`；`convertLogic` 打開）
- Modify: `src/mcp/tools.ts`（`logicToBreadboard` 兩次 `autoPlaceAndRoute` 都打開）
- Test: `tests/mcp/tools.test.ts`、`e2e/logic-to-breadboard.spec.ts`

- [ ] **Step 1: 寫失敗的測試** — MCP：`logic_to_breadboard` 之後的電路沒有兩端都在電源軌的線；
  e2e：多數決範例轉成麵包板、佈線完成後，讀 store 的電路（`window.__store` 或現有的測試方法）確認沒有兩端都在電源軌的線。
- [ ] **Step 2: 跑測試確認失敗**。
- [ ] **Step 3: 實作**。
- [ ] **Step 4: 跑測試** → PASS。
- [ ] **Step 5: Commit** — `feat: use nearest-rail power when converting (sub-project 34)`

### Task 5: 文件與全部檢查

- [ ] `CHANGELOG.md` 新區段；`README.md` 路線圖第 34 列與「轉成麵包板」功能說明；`docs/PROGRESS.md`；規格狀態「已完成」。
- [ ] `npm run typecheck`、`npm test`、`npm run build`、`npm run build:single`、完整 e2e；在瀏覽器看一次轉換結果。
- [ ] Commit、推送、開 PR（沒有 attribution），用 ccd_pr 綁定。
