# 依名稱對照邏輯圖檢查麵包板 Implementation Plan

> 執行方式：在這個對話內依序實作（executing-plans），每個任務先寫測試、看它失敗、再實作。

**Goal:** 「檢查」分頁依名稱把開關、LED、7 段顯示器對應到邏輯圖，逐列模擬比對真值表；不一致的列點了會撥好開關並開始模擬。

**Spec:** `docs/superpowers/specs/2026-10-17-diagram-check-design.md`

## Global Constraints

- `src/logic/` 不能用 DOM（核心 tsconfig 涵蓋）。
- 介面文字、註解繁體中文；commit message 英文。

## Review Focus

1. 一個開關兩邊都沒接電源、或兩邊都接電源時，不能當成比對一致。
2. 幾個指撥開關一起用（SW1、SW2）時，對應與撥開關都要對。
3. 沒對應到的開關維持原狀，比對時不能被改動。
4. 轉換後的麵包板（開關接 GND、只用 NAND、7 段顯示器）依名稱比對結果和以前一樣。
5. 改名稱、改邏輯圖、改接線之後，卡片的結果立刻跟著變（即時計算，不靠存下來的狀態）。

---

### Task 1：`verifyRows` 與 `Bindings`

- `src/logic/verifyBreadboard.ts`：新增 `SwitchBinding`、`Bindings`、`verifyRows(d, circuit, bindings)`；
  `verifyBreadboard(d, circuit, switchTo, map)` 改成轉成 `Bindings` 後呼叫 `verifyRows`。
- 測試：現有的 `tests/logic/verifyBreadboard.test.ts`、`blocks.test.ts`、`toBreadboard*.test.ts` 照樣通過；
  新增一個測試：兩個開關元件各對應一個輸入、沒對應的開關維持原狀。

### Task 2：`bindByLabels` 與 `checkAgainstDiagram`

- 新檔 `src/logic/diagramCheck.ts`（規格第 2、3 節）。
- 測試 `tests/logic/diagramCheck.test.ts`：手接 XOR（全部一致、LED 接錯腳時列出不一致）、開關接 GND、缺名稱 / 名稱重複 / 開關沒接電源 /
  兩邊都接電源、`hint`、`none`、邏輯圖有沒接好的腳、轉換後（多數決 vcc / gnd / NAND、BCD 顯示）依名稱比對一致。

### Task 3：Store

- `applyDiagramRow(inputs, bits)`；移除 `conversion`。
- 測試 `tests/web/`：撥好開關、一個復原步驟、開始模擬；`convertLogic` 不再寫 `conversion`。

### Task 4：畫面

- `DiagramCheckCard`（取代 `ConversionCard`），`data-testid="diagram-check"`；e2e 改用新的 testid。
- e2e：改 LED 名稱 → 找不到；改回 → 一致；邏輯圖換閘 → 不一致的列，點一列 → 開始模擬、開關撥好。

### Task 5：文件

- CHANGELOG、README 路線圖第 22 列、PROGRESS、規格狀態、backlog（「對照題目檢查麵包板」標成部分完成：照邏輯圖已做，直接輸入真值表還沒）。
