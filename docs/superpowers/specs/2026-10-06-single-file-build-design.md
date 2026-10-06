# 單一 HTML 離線版 設計規格

- 日期：2026-10-06
- 狀態：已完成（2026-10-06）
- 來源：`feat/core-engine` 分支的編輯器設計第 3 節（另一套子專案 2 實作），移植到主線

---

## 0. 目的

電腦教室常常不能安裝軟體、網路也不穩。離線版把整個工具包成**一個 HTML 檔**：複製到隨身碟或寄給學生，
雙擊就能用（`file://`），不需要伺服器、不需要網路。

## 1. 決定

| 項目 | 決定 |
|---|---|
| 指令 | `npm run build:single` → `dist-single/breadboard-lab.html`；網站版 `npm run build` 不變（`dist/`） |
| 打包 | `vite-plugin-singlefile`（只在 `--mode single` 啟用），JS、CSS、圖片全部內嵌 |
| 佈線 Worker | 改用 Vite 的 `?worker&inline`：Worker 程式碼包在主程式裡、用 blob URL 啟動（classic worker），`file://` 也能在背景執行緒佈線；網站版同一種寫法 |
| 網頁圖示 | `index.html` 的 `%FAVICON%` 由 Vite plugin 換成 data URI；工具列的 logo 用 import，打包時內嵌 |
| 路徑 | `base: './'`：放在子目錄（例如之後的 GitHub Pages）或 `file://` 都能運作 |
| 外部資源 | 不載入任何 CDN、網路字型或遠端資料（字型用系統字型）；自動儲存用瀏覽器的 localStorage，`file://` 也可以用 |
| 取得方式 | CI 每次都建置離線版，上傳成 Actions 的 Artifact（`breadboard-lab-offline`，保留 30 天） |

## 2. 測試

- 端對端（`e2e/single-file.spec.ts`）：先建置離線版 → 檢查 HTML 沒有外部 `<script src>` / `<link href>` →
  用 `file://` 開啟 → 載入驗收範例 → AI 標準佈線成功 → 整個過程沒有任何 `file:`、`blob:`、`data:` 以外的請求，也沒有頁面錯誤。
