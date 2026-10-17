# 真值表題目 Implementation Plan

> 執行方式：在這個對話內依序實作（executing-plans），每個任務先寫測試、看它失敗、再實作。

**Goal:** 邏輯圖畫面的「題目」分頁可以輸入真值表；邏輯圖與麵包板都能依名稱和題目比對。

**Spec:** `docs/superpowers/specs/2026-10-17-truth-table-task-design.md`

## Global Constraints

- `src/logic/` 是純函式（`tsconfig.json` 不含 DOM），畫面放 `src/components/`。
- 介面文字、註解用繁體中文；名稱規則沿用 `src/logic/file.ts` 的 `NAME_RULE`。
- 邏輯圖既有的比對（子專案 22、轉換後的比對）行為不變。

## Review Focus

1. 只有題目、沒有元件的邏輯圖：存檔、自動保存、「未儲存」提示都要算到題目。
2. 讀到格式不對的 `task`：整個邏輯圖拒絕並說明原因，不能讓壞資料進來。
3. 改名稱時輸入個數改變：每列重新開始，不能留下長度不對的列。
4. 不在乎（X）的格子：邏輯圖與麵包板的比對都跳過，但顯示時仍看得到。
5. 題目的名稱和邏輯圖的節點 id 撞名（例如輸入叫 `i1`）：麵包板比對與復原步驟名稱不能混淆。

---

### Task 1：`src/logic/task.ts` 純函式 + `LogicDiagram.task` + 讀檔 / 存檔 / `logicDirty`
### Task 2：和邏輯圖比對（`compareDiagramToTask`）、從邏輯圖建立（`taskFromDiagram`）
### Task 3：麵包板比對（`bindByNames`、`checkAgainstTask`、`verifyRows` 支援不在乎）
### Task 4：畫面（`TaskTab`、`TaskCheckCard`、`applyDiagramRow` 的名稱參數）＋ 端對端測試
### Task 5：文件（README、CHANGELOG、PROGRESS、backlog）

測試寫在 `tests/logic/task.test.ts`、`tests/logic/diagramCheck.test.ts`、`tests/web/logic.test.ts`、`e2e/truth-table-task.spec.ts`。
