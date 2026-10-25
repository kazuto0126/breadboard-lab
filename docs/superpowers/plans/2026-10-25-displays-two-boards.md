# 更多 7 段顯示器（子專案 49）實作計畫

規格：`docs/superpowers/specs/2026-10-25-displays-two-boards-design.md`。

1. 量測：暫時拿掉上限，用兩塊板轉每段一顆電阻 2 個、共用電阻 3 個、每段一顆 3 個（都差 1–3 條）。
2. `toBreadboard`：擺法 `displayBoards`、`Block.board`（至少放在第幾塊板）、解碼 IC 依板子排序；這種擺法開關一定拆成兩個。
3. 再量：每段一顆 2 個、共用 3 個排完；每段一顆 3 個仍差 2 條（不開放）。
4. `synth`：`MAX_DISPLAYS` 3、`MAX_DISPLAYS_EACH` 2、`displaysNeedTwoBoards`；`convertProblem` 指定板子時說明要選自動。
5. `toBreadboard` / `convertRoute`：要兩塊板時自動選板直接用兩塊（`needsTwoBoards`、`TWO_BOARD_DISPLAY_LAYOUT`）；兩塊板的擺法不受「要選自動」限制。
6. 測試：上限與訊息、兩塊板上顯示器的位置、只試兩塊板（假的佈線）、MCP 訊息、對話框（e2e）；量測加兩個顯示器電路。
7. 畫面與 MCP 說明；拆線重接的超時從兩成改一成（整套測試平行跑時 50 個元件的效能測試超過寬限）。
8. 文件：CHANGELOG、README、PROGRESS、backlog。
