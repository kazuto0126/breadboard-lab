# 變更紀錄

本檔記錄專案的每一次修改。格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，
每一筆都對應 GitHub 上的 commit，詳細設計見 `docs/superpowers/specs/`。

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
