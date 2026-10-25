# 單顆正反器元件（子專案 51）實作計畫

規格：`docs/superpowers/specs/2026-10-25-single-flip-flops-design.md`。

1. 測試先寫：DFF 翻轉、/CLR 接 0、JKFF 翻轉；合併 3 顆 DFF；範例的時序表與材料表。
2. `blocks.ts`：`DFF`、`JKFF` 的腳、沒接時的值、時脈腳、名稱；`HALF_CHIP`。
3. `evaluate.ts`：單顆正反器用那顆 IC 的模型（第 1 組的腳，另一組用沒接時的值）。
4. `flipFlops.ts`：`packFlipFlops`（依位置兩顆一組合成一片，接線換成第 1 / 2 組的腳）；`toBreadboard` 轉換前先合併。
5. 範例「2 位元同步計數器（D 型正反器）」。
6. 原本列出每顆 IC 的測試加上新的兩個；MCP `logic_set` 與伺服器說明、`public/mcp/index.html`。
7. 端對端：打開範例、時序表、轉成麵包板、送脈衝比對。
8. 文件：CHANGELOG、README、PROGRESS、backlog。
