# 從題目產生邏輯圖 Implementation Plan

> 執行方式：在這個對話內依序實作（executing-plans），每個任務先寫測試、看它失敗、再實作。

**Goal:** 題目分頁顯示每個輸出的化簡結果，並能產生對應的 AND–OR 邏輯圖。

**Spec:** `docs/superpowers/specs/2026-10-17-task-to-diagram-design.md`

## Global Constraints

- `src/logic/` 是純函式（不能用 DOM）；畫面在 `src/components/Logic/TaskTab.tsx`。
- 閘的輸入數只能是編輯器允許的（AND / OR / NAND / NOR 2–4，NOT 1）。
- 產生的圖必須通過 `parseLogicDiagram`，並和題目全部一致。

## Review Focus

1. 6 個輸入、很多項的題目（例如同位檢查）：串接的閘、版面不重疊、化簡不會卡住。
2. 輸出全是 0、全是 X、或化簡成 1：要接常數，不能產生沒有輸入的閘。
3. 題目沒用到的輸入：仍然要有輸入端。
4. 同一個積項在兩個輸出：共用一個 AND，不重複。
5. 已經有邏輯圖時取代：一個 Undo 步驟就能回去。

---

### Task 1：`src/logic/minimize.ts`（質項、最少覆蓋、文字）＋ 測試
### Task 2：`src/logic/design.ts`（結構、串接、常數、版面）＋ 測試
### Task 3：題目分頁的「化簡」一段與「產生邏輯圖」按鈕 ＋ 端對端測試
### Task 4：文件（README、CHANGELOG、PROGRESS、backlog）
