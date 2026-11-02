# 兩塊板的大電路多給時間（子專案 54）實作計畫

規格：`docs/superpowers/specs/2026-11-02-two-board-time-design.md`。

1. 量測：圖 8-8 的邏輯圖用 40、90 秒轉換（40 秒差 1 條、90 秒排完）。
2. 測試先寫：兩塊板時排線時間超過 40 秒、指定總時間時照指定的；範例 `bcdAdderDiagram` 的 100 組 BCD 加法。
3. `convertSteps`：走到兩塊板那一步、沒有指定總時間時加 `TWO_BOARD_EXTRA_MS`（50 秒）。
4. 範例「十進制加法器顯示（圖 8-8）」；量測加上它，兩塊板的時間上限 100 秒。
5. 對話框與 MCP 的說明寫上兩塊板最多一分半鐘。
6. 用新的 MCP 伺服器實際轉換圖 8-8；文件：CHANGELOG、README、PROGRESS、backlog。
