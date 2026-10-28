# 從狀態表題目產生電路（子專案 52）實作計畫

規格：`docs/superpowers/specs/2026-10-25-state-table-task-design.md`。

1. `src/logic/stateTask.ts`：題目的資料、建立與讀檔檢查（保留名稱）、`excitationTask`（D 與 JK 激勵表，沒用到的編碼不在乎）、
   `stateTaskColumns`、`designFromStateTask`（用子專案 25 畫組合邏輯，再換上正反器、/Q、時脈與狀態位元的輸出端）。
   測試先寫：計數器（D、JK）、3 個狀態、Mealy 偵測器照輸入序列送脈衝、讀檔。
2. `LogicDiagram.stateTask`、`file.ts` 讀檔；真值表題目產生邏輯圖時保留狀態表題目（網頁與 MCP）。
3. 畫面：「題目」分頁上方切換真值表 / 狀態表題目；`StateTaskTab`（建立、表格、式子、產生電路、換正反器、刪除）。
4. MCP：`state_task_set`、`state_task_to_diagram`（`src/mcp/stateTaskTools.ts`）；伺服器說明、工具數 23、設定說明頁。
5. 端對端：建立計數器題目、看 D 與 JK 的式子、產生電路、時序表數 0–3。
6. 文件：CHANGELOG、README、PROGRESS、backlog。
