# 變更紀錄

本檔記錄專案的每一次修改。格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，
每一筆都對應 GitHub 上的 commit，詳細設計見 `docs/superpowers/specs/`。

## [未發布] — 子專案 2：Web App

### 新增

- 子專案 2（Web App）設計規格：`docs/superpowers/specs/2026-10-06-web-app-design.md`。
- 本變更紀錄檔。

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
