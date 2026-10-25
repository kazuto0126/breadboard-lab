# 大電路轉成麵包板（子專案 48）實作計畫

規格：`docs/superpowers/specs/2026-10-25-big-convert-design.md`。先量測找原因（暫時的量測檔不提交），再照下面的順序做，每一步跑測試。

1. 找原因：從布林式產生 6 顆 IC 的電路，量每一種擺法、時間拉長、電源軌成本、IC 分散到三區（沒有幫助，拿掉）。
2. `toBreadboard`：擺法 `boards: 2`（兩塊 EIC-1106，每一區排滿第 1 塊再排第 2 塊）、`bom.boards`、`boardText`；自動選板放不下時改用兩塊。
3. `convertRoute`：自動選板最後試 `TWO_BOARD_VARIANTS`；排列去重時加上板子。
4. `orderIcs`：IC 照接線排（8 顆以下全試、更多時一步一步改），擺法 `orderIcs`；MB-102、EIC-1106、兩塊板都加上有排序的擺法。
5. 佈線器：`autoRoute` 拆線重接；`autoPlaceAndRoute` 接著之前的結果排時，之前時間不夠先重排一次（從頭開始時不重排：整套測試平行跑時 BCD 會排不完）。
6. 測試：`orderIcs`、兩塊板的擺法與 IC 間距、轉換改用兩塊板（假的佈線）、拆線重接（BCD 協商 1 輪）、接著排時先重排；量測加上三個大電路。
7. 畫面與 MCP：轉換對話框的預覽、MCP 回覆與 `logic_to_breadboard` 的 board 說明、設定說明頁。
8. 文件：CHANGELOG、README、PROGRESS、backlog。
