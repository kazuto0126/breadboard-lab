# 子專案 3：多麵包板長邊吸附與 Board Group 設計規格

- 日期：2026-10-06
- 狀態：已完成（2026-10-06）
- 來源需求：`digitaldesigned.md` 第三十八章
- 前置：子專案 1（核心引擎）、2（Web App）、4（邏輯模擬），皆已完成

---

## 0. 目的與成功標準

學生的電路大到一塊 MB-102 放不下時，可以再拿一塊麵包板貼在旁邊。工具要讓多塊板：

1. 可以自由拖曳；靠近另一塊板的邊（螢幕上 24 px 內）時自動吸附並**完全對齊**。
2. 貼合後自動成為同一個 **Board Group**；拖曳群組中任一塊板，整組一起移動；把板子拉開，群組自動解除；
   兩個群組貼在一起就合併。
3. **物理上貼在一起 ≠ 電氣上導通**：不同板子的孔永遠是不同的導通群組，只有真的拉了導線才會連通。
4. 同一個群組內可以拉跨板導線；自動佈線把整個群組當成一張連續的格子，所有導線仍然只走水平 / 垂直、
   不重疊、不穿過元件。

需求文件 38.19 的 10 項驗收測試都要有自動測試。

---

## 1. 已確認的決策

| 項目 | 決定 |
|---|---|
| 排列方式 | 只有上下（長邊對長邊）與左右兩種貼合，板子方向固定（不旋轉），不允許重疊、斜放、疊放 |
| 座標 | 板子位置仍以 mm 記錄，但一律對齊 0.1 吋格點；所有板子的格點落在同一張**全域格子**上 |
| 板面 | 每塊 MB-102 的板面 = 格點範圍外加一圈留白：x ∈ [0, 64]、y ∈ [0, 19]（65 × 20 格 = 165.1 × 50.8 mm） |
| 群組 | 由幾何推導，不另外儲存規則：兩塊板邊對邊相接且完全對齊（上下排 x 相同、左右排 y 相同）就相鄰；相鄰關係的連通分量（≥ 2 塊）就是一個 Board Group。`BreadboardInstance.groupId` 由此正規化後寫入存檔 |
| 跨板導線 | 只能在同一個群組內。導線經過兩板之間的「接縫」：接縫兩側各一格留白可以走線（其他留白仍然不能走，單板的佈線結果與之前完全相同） |
| 拆開群組 | 拖曳板子 = 整組移動；按住 **Alt** 拖曳 = 只移動這一塊。有跨板導線連到群組其他板時不能拆開（先刪除那些導線） |
| 自動佈線 | 每個群組各自建一張格子、各自協商佈線；一個 Net 若連到不同群組的板子，回報失敗（UNROUTABLE） |
| 刪除麵包板 | 連同板上的元件與碰到這塊板的導線一起刪除（可 Undo）；最後一塊板不能刪 |

---

## 2. 核心引擎（`src/core/breadboard/lattice.ts`）

```ts
buildLattice(boards): Lattice         // 依 boards 陣列參照快取
latticeOf(lattice, p): { x, y }       // 全域格子座標 = 板子原點（round(x_mm / 2.54)）+ 板內座標
pointAt(lattice, x, y): GridPoint     // 全域座標 → 唯一的「正規」格點（板子互不重疊，所以唯一）
isRoutablePoint(lattice, p)           // 板上的格點，或同群組兩板之間的接縫留白
latticeStep(lattice, a, b)            // 兩點相鄰時的方向（可跨板）
buildCanvas(lattice, groupId)         // 一個群組的佈線格子：外框只包住可走的格子
```

- `stepDirection`、`pathIssues`、`segments`、`countBends`、`wireNodeUsages`、`analyzeWireInteractions`、
  `computeMetrics` 多了可選的 `lattice` 參數；檢查器（`validateCircuit`、`checkRoutingLegality`、`scoreRouting`）
  一律傳入，所以跨板導線也能正確判斷方向、轉彎、重疊與交叉。
- `buildRoutingProblems(circuit)`：每個群組一個佈線問題（單板的格子索引與之前相同）；
  `buildRoutingProblem` 保留給只有一個群組的電路。
- 訊息中的孔位在多板電路裡加上板子 ID（例如 `b2:A12`）。

---

## 3. 編輯邏輯（`src/editor/boards.ts`）

| 函式 | 說明 |
|---|---|
| `boardGroups(circuit)` | 推導出的 `BoardGroup { id, boardIds, x, y, width, height, rotation }`（需求文件 38.8） |
| `normalizeBoardGroups(circuit)` | 依幾何重新寫入每塊板的 `groupId` |
| `snapBoardMove(circuit, ids, dx, dy, snapUnits)` | 移動中的板子與其他板的邊距離 ≤ snapUnits、另一軸也在範圍內時，調整位移讓兩板完全貼齊；同時檢查不重疊 |
| `moveBoards(circuit, ids, dx, dy)` | 以格為單位移動（元件與導線用板內座標，自然跟著移動） |
| `addBoard(circuit)` | 新板放在所有板子下方、留 4 格間隔（不會自動吸附） |
| `removeBoard(circuit, id)` | 刪除板子與其上的元件、導線 |
| `detachBoard(circuit, id)` | 「移出群組」：往旁邊找一個離所有板子至少 1 格的位置 |
| `crossBoardWires(circuit, ids)` | 連接 ids 與其他板子的導線（拆開前檢查） |

`fileFormat` 允許最多 8 塊板，檢查 ID 不重複、不重疊，匯入後正規化群組。

---

## 4. 畫面

- 左側元件庫最上方「麵包板」：＋ 新增麵包板。「電路」選單、畫布右鍵選單與右側面板也可以新增。
- 有兩塊以上的板子時，拖曳板子沒有孔的地方（凹槽、邊框、空隙）= 移動板子 / 群組；Alt 或 Shift + 拖曳 = 只移動這一塊
  （Linux 桌面常把 Alt + 拖曳拿去移動視窗，所以 Shift 也可以）。只有一塊板時，拖曳空白處仍然是平移畫面。
  拖曳中板子（連同元件、導線）跟著吸附後的位置移動；靠近其他板時顯示淡藍色預覽線與「↕ SNAP」（左右貼合為「↔ SNAP」）；
  重疊或會拉斷跨板導線時板子變紅，放開會回到原位並提示原因。
- 每個群組畫一個共同的群組外框與「Board Group N · M Boards」標籤；選取組內的板子時外框加粗（38.10）。
  有多塊板時，每塊板左上角印出板子 ID，孔位名稱也加上板子 ID（例如 `b2:A12`）。
- 點一下板子沒有孔的地方 = 選取板子：右側面板顯示板子資訊、所屬群組、元件 / 導線 / 跨板導線，
  「移出群組」與「刪除麵包板」按鈕；`Delete` 也能刪除；右鍵選單有相同的動作。
- 接線可以從一塊板拉到同群組的另一塊板；元件也可以拖到另一塊板上。
- 範例電路「兩塊麵包板（Board Group 示範）」：74LS00 在上板、電阻與 LED 在下板，載入時套用 AI 標準佈線。

---

## 5. 測試（對應 38.19）

| # | 驗收項目 | 測試 |
|---|---|---|
| 1 | 新增兩塊板、可以自由拖曳 | `addBoard`、`moveBoards`（editor） |
| 2 | 靠近到 Snap Distance 自動吸附 | `snapBoardMove` 上下 / 左右、距離外不吸附、對齊 |
| 3 | 吸附後成為同一群組 | `boardGroups` / `normalizeBoardGroups` |
| 4 | 拖曳 A，A + B 一起移動 | store 的群組移動 |
| 5 | 拉開 B，群組解除 | `moveBoards` 後群組消失 |
| 6 | C 靠近 B，A + B + C 合併 | 三塊板合併、兩個群組合併 |
| 7 | 貼合不代表導通 | `extractNets`：接縫兩側的孔是不同 Net |
| 8 | 用導線連接兩塊板才成為同一個 Net | 跨板導線的 Net 與 `validateCircuit` |
| 9 | Auto Route 使用群組座標系 | 兩板群組的 `autoRoute` 成功、導線跨過接縫 |
| 10 | 所有導線仍遵守佈線規則 | `checkRoutingLegality` 通過、只走水平垂直、0 重疊 |

另有端對端測試：新增第二塊板、拖到第一塊旁邊吸附成群組、拖曳群組一起移動、拉一條跨板導線。
