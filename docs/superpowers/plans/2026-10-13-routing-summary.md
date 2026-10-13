# 整次佈線的說明與問 AI Implementation Plan

> 執行方式：在這個對話內依序實作（executing-plans），每個任務先寫測試、看它失敗、再實作。

**Goal:** 佈線完成後在屬性分頁顯示「這次佈線」說明，並能用新的 AI 主題 `routing` 追問。

**Spec:** `docs/superpowers/specs/2026-10-13-routing-summary-design.md`

## Global Constraints

- editor 層不能 import components；`FAILURE_NAMES` 搬到 `src/editor/explain/routing.ts`。
- 介面文字、註解繁體中文；commit message 英文。

## Review Focus

1. 結果過期（改了電路）後說明消失、AI 對話不再顯示。
2. 比較畫面（尚未套用）時用 `comparisonSides(c).after` 算說明。
3. 失敗（status = failed，沒有導線）時說明不出錯。
4. 搬移 IC 的位置寫成孔位名稱，不是座標。
5. 沒有多出來轉接的訊號不列在「最繞」。

---

### Task 1：`summarizeRouting` / `routingSummaryText`（`src/editor/explain/routing.ts`）

- 測試 `tests/editor/routingSummary.test.ts`：小電路 autoRoute 後的前後指標、nets（wires、minimum、排序、points）、文字；
  手造 partial 結果的 failed hint；moves 的孔位名稱；`FAILURE_NAMES` 仍可從 describe.ts 匯入。
- Net 分組用佈線後電路的 `analyzeCircuit(after).netByWire`；`minimum` = 這個 Net 的元件腳所在的不同導通群組數 − 1。

### Task 2：AI 主題 `routing`

- 測試 `tests/editor/aiBrief.test.ts`（或加在既有測試）：`sameTopic`、`firstMessage` 含「【這次 AI 標準佈線】」與佈線規則、系統指示新句子。
- 實作 `brief.ts`（`routingBrief`、`firstMessage` 第 4 個參數）、`state/ai.ts` 從 store 取 comparison。

### Task 3：畫面

- store 動作 `showRoutingSummary()`：取消選取、右側切到屬性分頁、窄螢幕打開資訊抽屜（測試在 `tests/web/`）。
- `RoutingSummaryCard`、ResultCard 的「看說明」按鈕、AskAi 的建議問題。
- e2e `e2e/routing-summary.spec.ts`。

### Task 4：文件

- CHANGELOG、README 第 17 列、PROGRESS、規格狀態。
