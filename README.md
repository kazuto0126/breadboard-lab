# Breadboard Lab — 麵包板標準佈線 AI 工具

在虛擬的 MB-102（830 孔）麵包板上放置 74LS 系列 IC、電阻、LED、電源，自己接線；
按一下「**AI 標準佈線**」，系統會分析你的電路拓撲，重新算出最標準、最整齊、實際插得出來的麵包板配線：
每條跳線都是一段水平或垂直的直線、只有兩個端點；要轉彎就停在一排相通的孔（轉接排），下一條線從同一排的另一個孔出發；
一個孔只插一條線、不重疊、不經過元件，並盡量避免交叉、少用線、縮短總長。

接好之後按「**▶ 模擬**」，可以直接在板上撥指撥開關、按按鈕、讓時脈跑起來，看 LED 亮不亮、每隻腳是 HIGH 還是 LOW。

電路太大時可以**新增麵包板**（最多 8 塊）：把板子拖到另一塊旁邊，靠近時會自動吸附並對齊，成為同一個 Board Group，
同一組的板子之間可以拉跨板導線，AI 標準佈線也會把整組當成一張連續的格子。

給數位邏輯實驗課的學生使用：上課前先在網頁上規劃接線、確認邏輯正確，再照著插實體麵包板。

完整需求見 [`digitaldesigned.md`](digitaldesigned.md)；每一次修改都記錄在 [`CHANGELOG.md`](CHANGELOG.md)。

## 快速開始

需要 Node.js 22 以上。

```bash
npm install
npm run dev        # 開啟 http://localhost:5173
```

**線上版**：https://kazuto0126.github.io/breadboard-lab-site/ ，離線版也放在同一個網站（`breadboard-lab-offline.html`）。
原始碼 repo 是私人的，網站放在另一個公開 repo `kazuto0126/breadboard-lab-site`，裡面只有建好的網頁檔；
`main` 更新後執行 `npm run publish:site` 發布（commit 用 GitHub 的匿名信箱，不會公開作者的 Email）。

**離線版**：`npm run build:single` 會產生 `dist-single/breadboard-lab.html` 一個檔案，複製到任何電腦雙擊就能用，
不需要伺服器或網路。每次 CI 也會建置一份，可以在 GitHub 的 Actions 頁面下載（Artifacts → `breadboard-lab-offline`）。

第一次打開時，畫面上方有操作說明，也可以直接載入範例電路（檔案 → 範例電路）：
74LS00 + LED 驗收電路、74LS93 按鈕計數器、74LS161 + 時脈（模擬示範）、兩塊麵包板（Board Group 示範）、74LS283 4 位元加法器（兩塊板：上板開關、下板 IC 與 LED）、74LS47 + 7 段顯示器、NE555 時脈 + 74LS93 計數器（後兩個都是兩塊板）、EIC-1106 大型麵包板。

## 功能

| 功能 | 說明 |
|---|---|
| 麵包板 | MB-102：63 欄 × A–J、上下各兩條電源軌；滑鼠停在孔上會高亮整個導通群組 |
| 麵包板型號 | MB-102（830 孔）與 EIC-1106 大型麵包板（2390 孔：3 個插孔區 1-A15…3-J63、5 條電源軌 P1–P5、4 支接線柱，紅柱 = +5 V、黑柱 = GND，接線後就是電源）；元件庫的「＋ MB-102」「＋ EIC-1106」新增 |
| 多麵包板 | 最多 8 塊；拖曳板子沒有孔的地方移動，靠近另一塊板的邊（24 px 內）自動吸附並完全對齊（上下或左右），自動組成 Board Group；拖曳群組中任一塊整組一起移動，Alt / Shift + 拖曳或「移出群組」拆開；**貼在一起不代表導通**，要用導線連接；同一組可以跨板接線、AI 標準佈線把整組當成一張格子 |
| 元件庫 | 29 顆 74LS IC（含 74LS11、21、47、73、76、83、85、151、153）、NE555、8 種阻值電阻、4 色 LED、共陽極 7 段顯示器、陶瓷 / 電解電容、VCC、GND、DC Power、4 / 8 位元指撥開關、Push Button、Clock 時脈；元件定義（含邏輯行為）全部是 JSON |
| 腳位圖 | 點 IC、NE555 或 7 段顯示器，屬性面板最上面顯示腳位圖：方向和板上相同、VCC / GND 上色、低電位有效的腳名稱畫橫線、點一隻腳就能在板上找到它，模擬時顯示每隻腳的電位 |
| 放置 | 從左側拖曳（或點一下再點板子）；預覽會自動吸附到合法孔位，DIP IC 自動跨在中央凹槽上 |
| 編輯 | 拖曳移動（可以拖到另一塊板）、`R` 旋轉、`Delete` 刪除、右鍵選單、修改阻值 / LED 顏色 / 兩腳間距 / 指撥開關 |
| 接線 | 從孔拖曳到另一個孔：兩孔之間的一條直線（可以斜），不能經過元件或和別條線重疊；選取導線後拖曳兩端改接；接 + 軌自動用紅色、− 軌用黑色 |
| 選取 | 點孔、元件、腳位、導線或 Net；腳位與導線會高亮整個 Net，右側面板顯示詳細資訊 |
| 接線清單 | 照著插實體麵包板：依電源 → 接地 → 訊號列出每條導線的顏色、起點 → 終點、長度；插好一條勾一條，點一列就在板上找到那條線，進度會自動儲存 |
| Check Circuit | 17 種檢查（短路、IC 電源未接、輸出衝突、LED 反接、輸入懸空…），錯誤直接標在板上 |
| 錯誤解說 | 點一個檢查錯誤：說明為什麼錯、具體到孔位的修改步驟，麵包板上用綠色標出建議的孔與導線（不用網路） |
| 問 AI | 在錯誤解說卡或導線說明下面用白話追問 Google Gemini（gemini-3.5-flash），回答串流顯示、可以接著追問；回答裡的孔位與腳位點了會在板上閃一下；需要網路與自己的 Gemini API 金鑰（Google AI Studio 免費申請），金鑰只存在瀏覽器 |
| 邏輯圖 | 同一頁切換「邏輯圖｜麵包板」：拖拉 AND、OR、NOT、NAND、NOR、XOR（2–4 輸入）、輸入端、輸出端並連線；即時模擬、自動真值表（最多 8 個輸入）、檢查迴圈與沒接好的腳；和麵包板存在同一個檔案 |
| 轉成麵包板 | 邏輯圖一鍵轉成 74LS IC、指撥開關、電阻、LED 的麵包板（開關接 +5 V 或 GND 可選、自動選 MB-102 / EIC-1106），接著 AI 佈線（可移動 IC），並逐列模擬比對真值表 |
| 導線說明 | 點一條線就看到它屬於哪個 Net、接了哪些腳；經過轉接排時列出整段連線，AI 標準佈線的線另外說明為什麼不一條線直接接（不用網路） |
| AI 標準佈線 | 在 Web Worker 執行的確定性佈線引擎（孔與排之間的最短路 + 協商式拆線重排）；每條線都是直線跳線、轉彎靠轉接排、一孔一線；電源與地線每一排直接拉到電源軌；導線逐條以動畫出現，顯示前後統計與 Routing Score |
| AI 佈線（可移動 IC） | 先幫每顆 IC 找線比較少、比較短的位置（同組的任何一塊板、可以轉 180 度），再用 AI 標準佈線的規則佈線；開關、電阻、LED、電源不動，每支腳接到的腳不變；一定不比不移動差 |
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
| `npm run build:single` | 建置單一 HTML 離線版 `dist-single/breadboard-lab.html`（用 `file://` 直接開啟） |
| `npm test` | 單元測試（Vitest） |
| `npm run typecheck` | TypeScript 型別檢查（核心、畫面、測試四份設定） |
| `npm run e2e` | 端對端測試（Playwright），用真實滑鼠操作走完需求文件第三十四章的驗收流程，以及第三十八章的多麵包板吸附與跨板接線 |
| `npm run demo` | 在終端機用 ASCII 印出範例電路的佈線前後對照 |

第一次執行 e2e 前需要安裝瀏覽器：`npx playwright install chromium`。
已經有 Chromium 的環境可以改設 `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome`。

GitHub Actions（`.github/workflows/ci.yml`）在每個 Pull Request 與 push 到 `main` 時自動執行型別檢查、單元測試、建置與 e2e，
並上傳離線版 HTML。
給 Claude Code 的專案說明（架構、指令、慣例、工作流程）在 [`CLAUDE.md`](CLAUDE.md)，目前進度與下一步在
[`docs/PROGRESS.md`](docs/PROGRESS.md)。`.claude/settings.json` 設定了兩個 hook：對話開始時自動安裝相依套件、
從 GitHub 同步並顯示進度；每次回覆結束或中斷時，把工作分支上還沒推送的修改存成 WIP commit 推上 GitHub。

## 架構

依需求文件第三十一章分層：畫面只負責顯示與操作，佈線完全由確定性的引擎計算。

```text
UI（React 元件） → 狀態（Zustand store） → 編輯邏輯（純函式） → 核心引擎 → 佈線結果 → SVG 繪圖
```

```text
src/
  core/          核心引擎（不依賴 DOM，可在 Node / Web Worker 執行）
    breadboard/  麵包板版型、孔位命名、導通群組、多塊板共用的全域格子（lattice）
    circuit/     元件 footprint、Net 分析、Check Circuit
    routing/     A*、Net 生成樹、協商式拆線重排、合法性檢查、Routing Score
    simulation/  74LS 邏輯模型與模擬引擎（開關、上拉 / 下拉、浮接、供電、震盪偵測）
  data/          元件定義 JSON（74ls/、generic/），IC 的邏輯行為寫在 `logic` 欄位
  editor/        編輯邏輯（不依賴 DOM）：放置與吸附、手動接線路徑、多麵包板吸附與群組、Undo、存檔格式、縮放平移
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
- [子專案 3：多麵包板長邊吸附與 Board Group](docs/superpowers/specs/2026-10-06-multi-board-design.md)
- [子專案 4：74LS 數位邏輯模擬](docs/superpowers/specs/2026-10-06-logic-simulation-design.md)

## 路線圖

| 子專案 | 內容 | 狀態 |
|---|---|---|
| 1 | 核心引擎：麵包板模型、Net 分析、Check Circuit、自動佈線、Routing Score | ✅ 完成 |
| 2 | Web App：畫面、互動、Undo / Redo、存檔、匯出、動畫、Compare、Web Worker | ✅ 完成 |
| 3 | 多麵包板：長邊吸附、Board Group、群組座標系、跨板接線與佈線 | ✅ 完成 |
| 4 | 74LS 數位邏輯模擬：邏輯模型、模擬引擎、Clock、模擬模式 | ✅ 完成 |
| 5 | AI 解說：離線錯誤解說、問 AI（Gemini 追問） | ✅ 完成 |
| 6 | 直線導線：手動接線是兩孔之間的直線（可以斜）、拖曳端點改接 | ✅ 完成 |
| 7 | 新的自動佈線標準：每條線都是直線，轉彎靠一排相通的孔，一孔一線 | ✅ 完成 |
| 8 | 可以移動 IC 的佈線模式（輸入、輸出元件不動） | ✅ 完成 |
| 9 | 新元件（74LS83、11、21、47、73、76、85、151、153、NE555、7 段顯示器）與 IC 腳位圖 | ✅ 完成 |
| 10 | EIC-1106 大型麵包板（2390 孔） | ✅ 完成 |
| 11 | AI 回答裡的孔位可以點、導線解說 | ✅ 完成 |
| 12 | 邏輯圖編輯器：拖拉邏輯閘、模擬、真值表 | ✅ 完成 |
| 13 | 邏輯圖轉成麵包板（74LS IC、指撥開關、LED，交給 AI 佈線） | ✅ 完成 |
| 14 | 轉成麵包板的加強：只用 NAND（74LS00）、開關與 LED 標出名稱 | ✅ 完成 |
| 15 | 邏輯圖的小改善：記住畫面、兩指縮放、框選、複製貼上 | ✅ 完成 |
| 16 | 輸出用 7 段顯示器（74LS47 + 共陽極顯示器） | ✅ 完成 |
