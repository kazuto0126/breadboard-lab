# 變更紀錄

本檔記錄專案的每一次修改。格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，
每一筆都對應 GitHub 上的 commit，詳細設計見 `docs/superpowers/specs/`。

## [未發布] — 子專案 4：74LS 數位邏輯模擬

### 新增

- 子專案 4 設計規格：`docs/superpowers/specs/2026-10-06-logic-simulation-design.md`
  （邏輯模型 JSON 格式、模擬引擎演算法、時脈元件、模擬模式的畫面）。

## [未發布] — 子專案 2：Web App

### 新增

- 子專案 2（Web App）設計規格：`docs/superpowers/specs/2026-10-06-web-app-design.md`。
- 本變更紀錄檔。
- 前端工具鏈：Vite 8、React 19、Zustand 5、Tailwind CSS 4、Playwright（e2e）。
  新增 `npm run dev`、`npm run build`、`npm run preview`、`npm run e2e`。
- TypeScript 設定拆成兩份：`tsconfig.json`（核心引擎、editor、測試，**不含 DOM 型別**，
  強制核心與編輯邏輯不依賴瀏覽器）與 `tsconfig.web.json`（畫面，含 DOM 與 JSX）；
  `npm run typecheck` 會檢查兩者與 e2e 測試。
- `vitest.config.ts`：單元測試只收 `tests/**/*.test.ts`，與 Playwright 的 e2e 測試分開。
- `src/editor/`：不依賴 DOM 的編輯邏輯（全部有單元測試，`tests/editor/`，53 個測試）。
  - `geometry.ts`、`viewport.ts`：格點 ↔ 像素換算、以游標為中心縮放、Fit to Screen。
  - `history.ts`：Undo / Redo 堆疊（附動作名稱，上限 200 步）。
  - `ids.ts`：元件編號（U1、R1、D1…）與導線編號（w1…）。
  - `placement.ts`：放置合法性檢查（硬性 / 軟性問題）、半徑 2 格內自動吸附、以中心為軸旋轉
    （DIP IC 轉 90° 插不進去時自動翻轉 180°）。
  - `manualWire.ts`：手動接線的正交路徑規劃（Dijkstra，避開元件與其他導線端點、轉彎加成本），
    空孔判斷、依電源軌決定預設導線顏色。
  - `commands.ts`：放置、移動、旋轉、刪除、修改屬性 / 跨距、切換指撥開關、接線、改色等純函式動作。
  - `fileFormat.ts`：存檔格式 `breadboard-lab/circuit` v1 與完整的匯入驗證（中文錯誤訊息指出哪一筆資料錯）。
  - `analysis.ts`：Net、檢查結果、Routing Score 依電路參照快取。
  - `library.ts`：元件庫分類（74LS / 電阻 8 種阻值 / LED 4 色 / 電源 / 輸入）與搜尋。
  - `builder.ts`、`examples.ts`：電路建構工具與 3 個範例電路（原本在 `tests/fixtures/`，
    改由 `src/editor` 提供，測試沿用同一份，保證範例一定佈得出來）。

- `src/workers/`：佈線 Web Worker（`routing.worker.ts`）與用戶端（`routingClient.ts`）：
  每次佈線一個 module Worker、可取消（terminate）、沒有 Worker 時退回主執行緒。
- `src/state/store.ts`：Zustand store——可 Undo 的編輯動作、選取、元件放置工具、
  AI 標準佈線生命週期（計算 → 套用 → 描線動畫 → 結果）、MANUAL / AUTO ROUTE / COMPARE 模式
  （由資料推導，與 Undo 一致）、提示訊息；`persistence.ts`：自動儲存與瀏覽器專案庫（localStorage）。
- `src/render/theme.ts`：麵包板與元件配色、電阻色環計算。
- SVG 繪圖元件：麵包板底圖（830 孔、電源軌色線、凹槽、排標籤與欄號）、
  74LS IC / 指撥開關 / 電阻（依阻值畫色環）/ LED（陰極切平、標 + −）/ VCC / GND / DC Power / 按鈕、
  跳線（外框、端點插針、描線動畫）。

- **可操作的 Web App**（`npm run dev`），版面依需求文件第二十一章：
  - 頂部選單（檔案 / 編輯 / 電路 / 自動佈線 / 檢視 / 說明）、MANUAL / AUTO ROUTE / COMPARE 模式切換、
    「Check Circuit」與「AI 標準佈線」按鈕。
  - 左側元件庫：74LS / 電阻 / LED 以兩欄小格子顯示、分類快速跳轉、搜尋；拖曳或點一下放置；
    Jumper Wire 預設顏色選擇。
  - 中央互動式麵包板：放置時 ghost 預覽（綠 = 可放、紅 = 不可放）並自動吸附；拖曳移動（拖曳中可按 R 旋轉）；
    從空孔拖曳到空孔接線（預覽正交路徑）；滑鼠停在孔上高亮整個導通群組並顯示孔位、群組、Net 與佔用狀態；
    點腳位 / 導線 / Net 高亮整個 Net；右鍵選單（Rotate 90°、刪除、導線改色、Fit）；
    滾輪以游標為中心縮放、中鍵 / Space + 拖曳 / 拖曳空白處平移、Fit to Screen、Reset View。
  - Check Circuit：錯誤（紅）/ 警告（黃）直接標在板上，通過時顯示綠色「✓ Circuit Valid」，右側列出所有結果，
    點一項會把畫面移過去。
  - AI 標準佈線：在 Web Worker 計算（可取消）、原始導線淡化、新導線依 Net 優先序逐條描線出現，
    完成後顯示 Standard Routing Complete 與前後統計（Wire Count、Total Length、Bends、Crossings、Overlaps、
    Routing Score）；失敗時列出每個失敗 Net 的原因，電路不變。
  - COMPARE：User Routing 與 AI Standard Routing 並排（可切換上下 / 左右），可套用 AI 佈線或切回手動接線。
  - 右側資訊面板：選取項目的屬性（阻值、LED 顏色、兩腳間距、指撥開關狀態、腳位表）、Nets 清單、檢查結果。
  - 底部狀態列：狀態、元件 / 導線 / Net 數、錯誤與警告、Routing Score、模式、縮放。
  - Undo / Redo（所有編輯與 Auto Route）、儲存 / 另存新檔 / 開啟（瀏覽器專案庫）、匯入 / 匯出 JSON、
    匯出 PNG / SVG、自動儲存、3 個範例電路、快捷鍵說明。

- 測試：
  - `tests/web/store.test.ts`（14 個）：store 的編輯 / Undo、AI 標準佈線生命週期（套用、失敗、取消、
    沒有東西可佈線）、MANUAL / AUTO ROUTE / COMPARE 切換、匯入檔案。
  - `e2e/acceptance.spec.ts`（Playwright，3 個）：用真實滑鼠拖曳走完需求文件第三十四章驗收流程
    （分數 ≥ 90、0 交叉、0 重疊、Undo / Redo）、第三十三章 Test 6 的「No valid routing solution.」、
    旋轉 / 刪除 / Undo 與自動儲存還原。
  - 新增 `tests/web/tsconfig.json`：需要 DOM 型別的測試與核心測試分開檢查。

- `README.md`：功能總覽、快速開始、指令、架構與路線圖。

### 修正

- 範例電路的說明會在載入時顯示；加法器與驗收電路的手動接線故意很亂（用來展示 AI 標準佈線），
  說明中會提醒，避免學生以為工具壞了。提示訊息越長，顯示時間越久。

- 從 COMPARE 按「返回編輯」會把比較畫面誤判成「不是自動佈線」而重新佈線一次（多出一步 Undo）。
  新增 `closeCompare()`，模式切換只依導線本身判斷；Esc 離開比較畫面也改用它。
- 拖曳元件或導線時會選到頁面文字：整個介面停用文字選取（輸入框除外）。
- 開啟右鍵選單時，滑鼠提示會疊在選單後面；拖曳元件時，原位置的選取框會留在原地。
- IC 旋轉 180° 後型號與編號的上下順序顛倒。
- 屬性面板的 Net 數（含單腳 Net）與狀態列不一致，統一只計算兩隻腳以上的 Net。
- 提示訊息依種類調整顯示時間（一般 2.5 秒、錯誤 7 秒）。
- 元件庫太長（20 顆 IC 把其他分類擠到畫面外）：改成兩欄小格子並加上分類快速跳轉。

### 變更

- 元件定義 JSON 新增 `description` 欄位（28 個元件都有中文說明），`parseDefinition` 會驗證其型別。

## [0.1.0] — 2026-10-05 — 子專案 1：核心引擎

已合併至 `main`（PR #1）。

### 新增

- MB-102 麵包板模型：830 孔、130 個導通群組、孔位命名與解析。
- 元件庫：20 顆 74LS IC 腳位資料與 8 種通用元件（電阻、LED、VCC、GND、DC Power、4/8 位元指撥開關、Push Button），以 JSON 定義。
- Footprint 計算（4 種封裝 × 4 種旋轉角）、節點狀態、以 union-find 分析電氣 Net。
- Check Circuit：17 種錯誤 / 警告檢查。
- 自動佈線：多起點多終點 A*、Net 生成樹、PathFinder 式協商拆線重排、改善階段、獨立合法性檢查。
- Routing Score（0–100）與佈線統計。
- ASCII 預覽（`npm run demo`）與 146 個自動測試（含需求文件 Test 1–6）。
