# Breadboard Lab — 麵包板標準佈線 AI 工具

在虛擬的 MB-102（830 孔）麵包板上放置 74LS 系列 IC、電阻、LED、電源，自己接線；
按一下「**AI 標準佈線**」，系統會分析你的電路拓撲，重新算出最標準、最整齊、實際插得出來的麵包板配線：
只走水平 / 垂直、不重疊、不穿過元件，並盡量避免交叉、縮短總長、減少轉彎。

接好之後按「**▶ 模擬**」，可以直接在板上撥指撥開關、按按鈕、讓時脈跑起來，看 LED 亮不亮、每隻腳是 HIGH 還是 LOW。

給數位邏輯實驗課的學生使用：上課前先在網頁上規劃接線、確認邏輯正確，再照著插實體麵包板。

完整需求見 [`digitaldesigned.md`](digitaldesigned.md)；每一次修改都記錄在 [`CHANGELOG.md`](CHANGELOG.md)。

## 快速開始

需要 Node.js 22 以上。

```bash
npm install
npm run dev        # 開啟 http://localhost:5173
```

第一次打開時，畫面上方有操作說明，也可以直接載入範例電路（檔案 → 範例電路）：
74LS00 + LED 驗收電路、74LS93 按鈕計數器、74LS161 + 時脈（模擬示範）、74LS283 4 位元加法器。

## 功能

| 功能 | 說明 |
|---|---|
| 麵包板 | MB-102：63 欄 × A–J、上下各兩條電源軌；滑鼠停在孔上會高亮整個導通群組 |
| 元件庫 | 20 顆 74LS IC、8 種阻值電阻、4 色 LED、VCC、GND、DC Power、4 / 8 位元指撥開關、Push Button、Clock 時脈；元件定義（含邏輯行為）全部是 JSON |
| 放置 | 從左側拖曳（或點一下再點板子）；預覽會自動吸附到合法孔位，DIP IC 自動跨在中央凹槽上 |
| 編輯 | 拖曳移動、`R` 旋轉、`Delete` 刪除、右鍵選單、修改阻值 / LED 顏色 / 兩腳間距 / 指撥開關 |
| 接線 | 從空孔拖曳到另一個空孔；路徑只有水平 / 垂直，會自動繞過元件；接 + 軌自動用紅色、− 軌用黑色 |
| 選取 | 點孔、元件、腳位、導線或 Net；腳位與導線會高亮整個 Net，右側面板顯示詳細資訊 |
| Check Circuit | 17 種檢查（短路、IC 電源未接、輸出衝突、LED 反接、輸入懸空…），錯誤直接標在板上 |
| AI 標準佈線 | 在 Web Worker 執行的確定性佈線引擎（A* + 協商式拆線重排）；導線逐條以動畫出現，顯示前後統計與 Routing Score |
| 模式 | MANUAL（手動接線）/ AUTO ROUTE（AI 標準佈線）/ COMPARE（左右或上下對照） |
| 邏輯模擬 | 20 顆 74LS IC 依 datasheet 模擬；LED 發光、腳位與導線依電位上色（1 / 0 / 浮接 / 衝突）；在板上撥開關、按按鈕；時脈可暫停、單步、重置；偵測未供電、震盪、輸出衝突 |
| 檢視 | 滾輪縮放、中鍵 / Space + 拖曳 / 拖曳空白處平移、Fit to Screen、Reset View |
| Undo / Redo | 所有編輯動作與 Auto Route 都可以 `Ctrl+Z` / `Ctrl+Shift+Z` |
| 檔案 | 儲存 / 另存新檔 / 開啟（存在瀏覽器）、匯入 / 匯出 JSON、匯出 PNG / SVG、自動儲存 |

AI 標準佈線**不會移動元件**，只保留你的接線所定義的電氣連接（哪些導通群組要連在一起），重新決定每一條導線。
排不出來時會回報 "No valid routing solution." 與每個失敗 Net 的原因，電路不會被修改。

## 指令

| 指令 | 用途 |
|---|---|
| `npm run dev` | 開發伺服器 |
| `npm run build` / `npm run preview` | 建置靜態網站到 `dist/` / 預覽建置結果 |
| `npm test` | 單元測試（Vitest） |
| `npm run typecheck` | TypeScript 型別檢查（核心、畫面、測試四份設定） |
| `npm run e2e` | 端對端測試（Playwright），用真實滑鼠操作走完需求文件第三十四章的驗收流程 |
| `npm run demo` | 在終端機用 ASCII 印出範例電路的佈線前後對照 |

第一次執行 e2e 前需要安裝瀏覽器：`npx playwright install chromium`。
已經有 Chromium 的環境可以改設 `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome`。

## 架構

依需求文件第三十一章分層：畫面只負責顯示與操作，佈線完全由確定性的引擎計算。

```text
UI（React 元件） → 狀態（Zustand store） → 編輯邏輯（純函式） → 核心引擎 → 佈線結果 → SVG 繪圖
```

```text
src/
  core/          核心引擎（不依賴 DOM，可在 Node / Web Worker 執行）
    breadboard/  麵包板版型、孔位命名、導通群組
    circuit/     元件 footprint、Net 分析、Check Circuit
    routing/     A*、Net 生成樹、協商式拆線重排、合法性檢查、Routing Score
    simulation/  74LS 邏輯模型與模擬引擎（開關、上拉 / 下拉、浮接、供電、震盪偵測）
  data/          元件定義 JSON（74ls/、generic/），IC 的邏輯行為寫在 `logic` 欄位
  editor/        編輯邏輯（不依賴 DOM）：放置與吸附、手動接線路徑、Undo、存檔格式、縮放平移
  state/         Zustand store、自動儲存、檔案動作
  workers/       佈線 Web Worker
  components/    React 畫面（Toolbar、ComponentLibrary、Breadboard、PropertyPanel、StatusBar、Compare）
  render/        配色、SVG / PNG 匯出
tests/           單元測試（tests/web/ 為需要 DOM 型別的 store 測試）
e2e/             Playwright 端對端測試
docs/            設計規格與實作計畫
```

`tsconfig.json` 不含 DOM 型別，涵蓋核心引擎與 `src/editor/`；只要在這些地方用到瀏覽器 API，型別檢查就會失敗，
確保引擎與編輯邏輯能在 Web Worker 與 Node 中執行。

設計文件：

- [子專案 1：核心引擎](docs/superpowers/specs/2026-10-05-core-engine-design.md)
- [子專案 2：Web App](docs/superpowers/specs/2026-10-06-web-app-design.md)
- [子專案 4：74LS 數位邏輯模擬](docs/superpowers/specs/2026-10-06-logic-simulation-design.md)

## 路線圖

| 子專案 | 內容 | 狀態 |
|---|---|---|
| 1 | 核心引擎：麵包板模型、Net 分析、Check Circuit、自動佈線、Routing Score | ✅ 完成 |
| 2 | Web App：畫面、互動、Undo / Redo、存檔、匯出、動畫、Compare、Web Worker | ✅ 完成 |
| 3 | 多麵包板：長邊吸附、Board Group、群組座標系 | 規劃中 |
| 4 | 74LS 數位邏輯模擬：邏輯模型、模擬引擎、Clock、模擬模式 | ✅ 完成 |
| 5 | 串接大型語言模型的 AI 解說 | 規劃中 |
