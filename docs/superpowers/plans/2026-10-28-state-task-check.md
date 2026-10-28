# 自己畫的電路和狀態表比對（子專案 53）實作計畫

規格：`docs/superpowers/specs/2026-10-28-state-task-check-design.md`。

1. 測試先寫：產生的電路全部一致（D、JK）、接錯的計數器（下一個狀態錯、走不到的狀態）、輸出錯與不在乎、還不能比對的原因。
2. `src/logic/stateCheck.ts`：`compareDiagramToStateTask`（依名稱對應，從重設開始走到的狀態 × 輸入，先讀輸出再送脈衝）、`mismatchText`、`comparisonNotes`。
3. 畫面：狀態表題目下面的「和邏輯圖比對」。
4. MCP：`state_task_check`；`state_task_to_diagram` 的回覆加上比對結果；伺服器說明、工具數 24、設定說明頁。
5. 端對端：產生電路後全部一致，刪掉 Q0 的輸出端後說明要有 Q0。
6. 文件：CHANGELOG、README、PROGRESS、backlog。
