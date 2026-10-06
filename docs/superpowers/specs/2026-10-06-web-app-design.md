# 子專案 2：Web App（畫面與互動）設計規格

- 日期：2026-10-06
- 狀態：已完成（2026-10-06）
- 來源需求：`digitaldesigned.md`（以下稱「需求文件」）
- 前置：子專案 1 核心引擎（`docs/superpowers/specs/2026-10-05-core-engine-design.md`，已完成）
- 所屬總計畫：麵包板標準佈線 AI 工具，共 5 個子專案，本文件只涵蓋子專案 2

---

## 0. 目的與成功標準

**本子專案要交付的東西**：一個可以實際操作的 Web App，把子專案 1 的核心引擎接上畫面。學生打開網頁就能在真實比例的 MB-102 麵包板上放元件、接線、檢查電路、執行「AI 標準佈線」並比較前後差異。

**成功標準（對應需求文件第三十四章）**：

1. `npm run dev` 開啟網站，看見 830 孔（800 孔級）MB-102 麵包板。
2. 從元件庫拖入 74LS00、LED、電阻、VCC、GND，放置時自動吸附到合法孔位。
3. 從孔拖曳到另一個孔手動接線，導線只有水平與垂直。
4. 按「Check Circuit」，錯誤直接標示在麵包板上，並列在右側面板。
5. 按「AI 標準佈線」，在 Web Worker 中執行 `autoRoute`，導線逐條以動畫出現，最後顯示 "Standard Routing Complete" 與統計（Wire Count、Total Length、Bends、Crossings、Overlaps、Routing Score）。
6. 顯示最佳化前後差異（Compare 模式）。
7. 所有操作都可以 Undo / Redo，包含 Auto Route。
8. 可以儲存、讀取、匯入匯出 JSON、自動儲存；可以匯出 PNG / SVG。

---

## 1. 範圍

**包含**：畫面、互動、Undo/Redo、存檔/讀檔、匯出、佈線動畫、Compare 畫面、Web Worker 包裝、範例電路。

**不包含**：

| 項目 | 子專案 |
|---|---|
| 多麵包板吸附、群組、群組座標系 | 3 |
| 74LS 邏輯模擬（指撥開關的 ON/OFF 只顯示、可切換，不影響任何計算） | 4 |
| 串接大型語言模型的 AI 解說 | 5 |

---

## 2. 已確認的決策

| 項目 | 決定 |
|---|---|
| 框架 | React 19 + TypeScript + Vite |
| 狀態 | Zustand（單一 store） |
| 樣式 | Tailwind CSS v4 |
| 繪圖 | **SVG**。孔位、元件、導線都是向量；SVG 匯出可以直接序列化畫面，PNG 由 SVG 轉成 Canvas。板子上的繪圖屬性一律寫成 SVG 屬性（不用 CSS class），確保匯出的檔案獨立可用 |
| 佈線計算 | `autoRoute` 一律在 Web Worker 執行；瀏覽器不支援 Worker 時退回主執行緒 |
| 歷史紀錄 | 以「整份 Circuit 快照」為單位（Circuit 是不可變純資料，快照成本低）；上限 200 步 |
| 存檔 | 「Save / Save As / Load」存在瀏覽器（localStorage 專案庫）；「Export / Import JSON」是檔案；自動儲存目前電路，重新整理後還原 |
| 介面語言 | 繁體中文為主，關鍵功能保留需求文件的英文名稱（Check Circuit、AI Standard Route、Standard Routing Complete…） |

---

## 3. 架構

### 3.1 分層

需求文件第三十一章要求 UI → Circuit State → Circuit Graph → Routing Engine → Routing Result → Renderer 分層。對應如下：

```text
src/
  core/ types/ data/      子專案 1：核心引擎（不改動行為）
  editor/                 編輯邏輯：純函式、不依賴 DOM，可在 Node 測試
    builder.ts            用孔位名稱建構電路（範例與測試共用）
    examples.ts           範例電路
    geometry.ts           格點 ↔ 像素
    viewport.ts           縮放、平移、Fit to Screen
    history.ts            Undo / Redo
    ids.ts                元件與導線編號（U1、R1、w1…）
    placement.ts          放置合法性檢查、自動吸附
    manualWire.ts         手動接線的正交路徑規劃
    commands.ts           所有編輯動作（放置、移動、旋轉、刪除、接線…）
    fileFormat.ts         存檔格式與匯入驗證
    analysis.ts           Net、檢查結果、評分的快取
    library.ts            元件庫分類與預設值（例如 8 種電阻值）
  state/store.ts          Zustand store：串接 editor、歷史紀錄、Worker
  workers/
    routing.worker.ts     在 Worker 中執行 autoRoute
    routingClient.ts      啟動、取消、退回主執行緒
  components/             React 畫面
    App.tsx
    Toolbar/              頂部選單與模式切換
    ComponentLibrary/     左側元件庫
    Breadboard/           SVG 麵包板、元件、導線、互動
    PropertyPanel/        右側資訊面板（屬性、Nets、檢查結果）
    StatusBar/            底部狀態列
    Compare/              Compare 模式
    common/               對話框、提示、右鍵選單
  render/exportImage.ts   SVG / PNG 匯出（需要 DOM）
  main.tsx
```

### 3.2 依賴方向

`components` → `state` → `editor` → `core`。`editor` 不得使用 DOM API；這一點由 TypeScript 設定強制：

- `tsconfig.json`：核心、editor、測試、腳本，**不含 DOM 型別**。在 editor 裡寫 `document` 會無法通過型別檢查。
- `tsconfig.web.json`：整個 `src` 與 e2e 測試，含 DOM 與 JSX。

`npm run typecheck` 兩份都檢查。

### 3.3 資料流

```text
使用者操作 → store action → editor/commands（純函式，回傳新的 Circuit）
          → 歷史紀錄 push → circuit 更新
          → analysis（extractNets / validateCircuit / scoreRouting，依 circuit 參照快取）
          → React 重新繪製
AI 標準佈線 → routingClient → Worker: autoRoute → RoutingResult
          → 成功：applyRouting 成為一步可 Undo 的動作 → 動畫
          → 失敗：不改電路，顯示失敗的 Net 與原因
```

---

## 4. 畫面配置（需求文件第二十一章）

```text
┌──────────────────────────────────────────────────────────────────┐
│ Logo │ 檔案 │ 編輯 │ 電路 │ 自動佈線 │ 檢視   [MANUAL|AUTO|COMPARE] [Check] [AI 標準佈線] │
├──────────┬───────────────────────────────────────┬───────────────┤
│ 元件庫   │                                       │ 屬性 │Nets│檢查│
│ 搜尋     │          SVG 麵包板                    │               │
│ 74LS     │      （縮放、平移、選取、拖曳）          │  選取項目資訊  │
│ 電阻     │                                       │  腳位 / Net    │
│ LED      │                                       │  錯誤清單      │
│ 電源     │                                       │               │
│ 輸入     │                                       │               │
├──────────┴───────────────────────────────────────┴───────────────┤
│ 狀態 │ 元件 │ 導線 │ Nets │ 錯誤/警告 │ Routing Score │ 模式 │ 縮放 │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. 麵包板繪製

### 5.1 座標

- 1 格（0.1 吋）= `PITCH` = 20 px（世界座標）。
- 板內格點 `(x, y)` 的像素位置：`((x − 1 + 1.5) × PITCH, (y − 1 + 1.0) × PITCH)`；板子外框 65 × 19 格 = 1300 × 380 px，接近實體 MB-102 的 165 × 55 mm 比例。
- 板子在世界座標的位置取自 `BreadboardInstance.x / y`（mm），換算為 `mm ÷ 2.54 × PITCH`。子專案 3 的多板會沿用這個換算。
- 螢幕座標 = 世界座標 × `scale` + `(x, y)`（`Viewport`）。

### 5.2 外觀

- 米白色板身、圓角、陰影；中央凹槽（y = 9–10）畫成較深的溝槽。
- 上下電源軌各有紅（+）、藍（−）兩條色線與 +/− 標記；孔以 5 個一組排列。
- 排標籤 A–J 在左右兩側；欄號（1、5、10…60）印在 y = 3 與 y = 16 的空隙列，與實體板一致。
- 每個孔帶 `data-hole="A12"` 屬性，供 e2e 測試定位。

### 5.3 元件

| 種類 | 畫法 |
|---|---|
| DIP IC / 指撥開關 | 本體橫跨兩排腳之間，左側半圓缺口與第 1 腳圓點標示方向；腳以銀色腳片插入孔；本體印型號與編號；指撥開關畫出每個開關的位置（點擊屬性面板可切換） |
| 電阻 | 米色本體 + 依阻值計算的 4 色環，兩端引腳 |
| LED | 依顏色著色的圓頂，平邊在陰極側，圓頂上標 `+`（陽極）與 `−`（陰極） |
| VCC / GND / DC Power | 紅色 `+` / 黑色 `−` 端子，旁邊標 `VCC +5V`、`GND` |
| Push Button | 方形本體、中央圓形按鈕、四角腳 |

所有文字都反向旋轉，元件旋轉後文字仍保持正向。

### 5.4 導線

- 依 `path` 畫成折線：圓角轉折、深色外框（白色導線在米白板上也看得見）、端點畫金屬插針。
- 選取時外圍加藍色光暈；同一個 Net 的導線、腳位、導通群組一起高亮。

---

## 6. 互動

### 6.1 指標操作（Tinkercad 式，沒有明確的工具模式）

| 操作 | 結果 |
|---|---|
| 在元件庫按住拖曳到板上 | 放置元件；預覽（ghost）跟著游標並吸附，綠色 = 可放、紅色 = 不可放 |
| 在元件庫點一下 | 進入「放置中」，ghost 跟著游標，點擊板子放置；`Esc` 取消；`R` 旋轉 |
| 在空孔按住拖曳到另一個空孔 | 建立手動導線（預覽路徑只有水平/垂直） |
| 拖曳元件 | 移動（吸附格點，放開時不合法就回到原位） |
| 點擊元件 / 腳位 / 導線 / 孔 | 選取並在右側面板顯示資訊；腳位、導線會高亮整個 Net |
| 右鍵元件 / 導線 | 右鍵選單：Rotate 90°、Delete |
| 滑鼠滾輪 | 以游標為中心縮放 |
| 中鍵拖曳、Space + 拖曳、在板外空白處拖曳 | 平移 |
| 滑鼠停在孔上 | 高亮整個導通群組，提示孔位名稱、群組、所屬 Net 與佔用狀態 |

### 6.2 鍵盤

| 鍵 | 動作 |
|---|---|
| `R` | 旋轉選取的元件（放置中則旋轉 ghost） |
| `Delete` / `Backspace` | 刪除選取的元件或導線 |
| `Esc` | 取消放置 / 接線 / 移動，或取消選取 |
| `Ctrl+Z` / `Ctrl+Shift+Z`（`Ctrl+Y`） | Undo / Redo |
| `Ctrl+S` / `Ctrl+Shift+S` / `Ctrl+O` | Save / Save As / Load |
| `F` / `0` / `+` / `-` | Fit to Screen / Reset View / 放大 / 縮小 |

焦點在輸入框時不處理快捷鍵。

### 6.3 放置規則（`editor/placement.ts`）

**硬性問題**（不允許放置）：

- `OFF_HOLE`：有腳不在孔上（落在 surface 或板外）。
- `OUT_OF_BOARD`：本體超出板面。
- `PIN_OCCUPIED`：腳的孔已經有別的元件腳、導線端點，或被別的元件本體蓋住。
- `BODY_OVERLAP`：本體蓋到別的元件腳或本體。

**軟性問題**（允許，但吸附時盡量避開）：IC 兩隻腳在同一導通群組、兩腳元件兩腳在同一導通群組。導線從本體下方經過也屬於軟性問題，由 Check Circuit 回報。

**自動吸附**（`findPlacement`）：以游標換算出的 anchor 為中心，在半徑 2 格內依距離（同距離依 y、x）搜尋：先找沒有任何問題的位置，再找只有軟性問題的位置；都沒有就回傳 `null`（ghost 變紅、不允許放下）。

**旋轉**：以腳位外框的中心為軸旋轉，依序嘗試 +90°、+180°、+270°，取第一個可以吸附到合法位置的角度。例如 DIP IC 轉 90° 一定放不下，按 `R` 會直接翻轉 180°。

### 6.4 手動接線（`editor/manualWire.ts`）

- 起點、終點必須是「空孔」：孔上沒有元件腳、沒有被本體蓋住、不是別條線的端點，也沒有別條線經過。
- 路徑用 Dijkstra（狀態含方向）在板上找：每格成本 1、每次轉彎 5；不能經過元件本體、元件腳、別條線的端點；經過別條線的路徑每格加 200（盡量避免但不會找不到）。同成本時依拖曳的起始方向決定先走水平或垂直。
- 找不到路徑時退回「先水平再垂直」的 L 形，交給 Check Circuit 回報。
- 預設顏色：一端在 + 軌為紅色、在 − 軌為黑色，否則用工具列選定的導線顏色。

### 6.5 編號

元件編號依種類加前綴，取「目前最大號 + 1」：IC `U`、電阻 `R`、LED `D`、VCC `V`、GND `G`、DC Power `P`、指撥開關 `SW`、按鈕 `BTN`。手動導線為 `w1`、`w2`…；自動佈線的導線沿用引擎的 `w_NET_1_1` 格式。

---

## 7. 模式（需求文件第二十章）

模式由資料推導，不另外存狀態，因此一定和 Undo/Redo 一致：

| 模式 | 條件 | 按下該模式按鈕時 |
|---|---|---|
| MANUAL | 電路中有任何手動導線，或沒有導線 | 若目前是自動佈線結果且保留了佈線前的手動導線，換回手動導線（一步可 Undo 的動作） |
| AUTO ROUTE | 電路中所有導線都是 `source: "auto"` | 執行 AI 標準佈線 |
| COMPARE | 使用者切換到比較畫面 | 顯示最近一次佈線的前後對照 |

**Compare 畫面**：左「User Routing」、右「AI Standard Routing」（版面太窄時改為上下），兩邊各自顯示 Wire Count、Total Length、Bends、Crossings、Overlaps、Routing Score；兩邊都用 `scoreRouting` 計算，標準一致。只要元件有變動，舊的對照就標為過期。

---

## 8. AI 標準佈線流程（需求文件第十八章）

1. 原始導線淡化（暫時隱藏），顯示「Routing…」與取消按鈕。
2. Worker 執行 `autoRoute(circuit)`。
3. **成功**：`applyRouting` 成為一步 Undo 動作「AI 標準佈線」，新導線依 Net 優先序逐條以描線動畫出現（每條最多 160 ms，總長約 2.5 秒，可點擊跳過），結束後顯示「Standard Routing Complete」與統計、前後分數對照。
4. **部分成功 / 失敗**：電路不變，顯示 "No valid routing solution."、每個失敗 Net 的原因（中文說明）與細節；Compare 畫面可以預覽成功的部分。
5. 沒有任何需要接的 Net（例如還沒接線）：照樣成功，並提示「AI 標準佈線會保留你接線所定義的電氣連接，請先手動接線」。

---

## 9. Check Circuit（需求文件第十七章）

- `validateCircuit` 結果依 circuit 快取，狀態列即時顯示錯誤 / 警告數量。
- 按「Check Circuit」後，板上顯示標記：error 紅色、warning 黃色、通過時顯示綠色「✓ Circuit Valid」；相關元件加外框、相關導線加光暈。標記會隨電路修改即時更新，直到關閉。
- 右側「檢查」分頁列出所有結果；點一項會選取相關元件 / 導線並把畫面移過去。

---

## 10. 存檔格式（`editor/fileFormat.ts`）

```ts
interface CircuitFile {
  format: 'breadboard-lab/circuit';
  version: 1;
  name: string;
  savedAt: string;      // ISO 時間
  circuit: Circuit;
}
```

- 匯入時完整驗證結構：版本、板子（目前只接受 1 塊 MB102）、元件（ID 不重複、`defId` 存在、整數座標、合法旋轉角、`span`、`props` 型別）、導線（ID 不重複、`source`、點座標為整數且 `boardId` 存在）。也接受直接貼上的 `Circuit` 物件。錯誤訊息用中文指出哪一筆資料錯在哪裡。
- 路徑本身是否合法（斜線、穿過元件…）不在匯入時擋，交給 Check Circuit 回報。
- localStorage 鍵：`breadboard-lab:autosave`（目前電路）、`breadboard-lab:projects`（專案庫，名稱 → CircuitFile）。localStorage 不能用時（例如隱私模式）顯示一次提示，其他功能照常。

---

## 11. 匯出

- **SVG**：複製畫面上的板子 SVG，移除互動用的圖層（hover、選取、ghost），設定剛好包住板子的 `viewBox`。
- **PNG**：把上面的 SVG 畫到 2 倍解析度的 Canvas 再存檔。
- **JSON**：`CircuitFile`。

---

## 12. Web Worker

```ts
// 主執行緒
startRouting(circuit, config?): { promise: Promise<RoutingResult>; cancel(): void }
```

- 每次佈線建立一個新的 module Worker，取消時直接 `terminate()`，不需要在引擎內部設中斷點。
- 引擎本身已有 `timeBudgetMs`（預設 5 秒）。
- 沒有 Worker（例如測試環境）時，退回在主執行緒用 `setTimeout` 執行。

---

## 13. 效能（需求文件第二十九章）

- 板子底圖（830 個孔）是靜態圖層，用 `React.memo`，不隨 hover 重繪。
- 元件圖層、導線圖層各自依 `circuit.components`、`circuit.wires` 參照 memo。
- hover 狀態只存在畫布元件內部，只重繪最上層的提示圖層；滑鼠移動只有在格點改變時才更新。
- 指標事件委派到 SVG 根節點，以座標換算格點，不在 830 個孔上各掛事件。
- Net / 檢查 / 評分依 circuit 參照快取，多個面板共用同一份結果。

---

## 14. 測試

| 範圍 | 方式 |
|---|---|
| `editor/*` | Vitest（Node），每個模組都有單元測試：歷史紀錄、編號、放置與吸附、旋轉、手動接線路徑、所有編輯動作、存檔格式與匯入錯誤、座標與縮放 |
| `state/store` | Vitest（Node，`tests/web/`，用 DOM 型別另外檢查）：編輯與 Undo、AI 標準佈線的套用 / 失敗 / 取消、模式切換、匯入 |
| 範例電路 | 沿用子專案 1 的固定測試電路（改由 `editor/examples.ts` 提供），保證範例一定佈得出來 |
| 端對端 | Playwright（`npm run e2e`）：照需求文件第三十四章走一遍——開網頁、拖入 74LS00 / LED / 電阻 / VCC / GND、手動接線、Check Circuit、AI 標準佈線（0 交叉、0 重疊、分數 ≥ 90）、Undo 回到手動接線 |

`npm test`、`npm run typecheck`、`npm run build` 必須全部通過。

---

## 15. 已知限制與後續

- 只有一塊麵包板；多板吸附與群組在子專案 3。
- 導線建立後不能拖曳端點修改，只能刪除重拉。
- 指撥開關、按鈕的狀態不參與任何計算（子專案 4）。
- Compare 畫面不能縮放，固定為「剛好放得下整塊板」。
