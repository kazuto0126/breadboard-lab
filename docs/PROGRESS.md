# 專案進度

> 每個 Claude Code 對話開始時會自動顯示這份檔案（`.claude/hooks/session-start.sh`）。
> 每次推送前更新：做完的事寫進 `CHANGELOG.md`，這裡只留「現在」與「接下來」。最後更新：2026-10-06

## 目前狀態

- `main`：子專案 1–4 完成（核心引擎、Web App、多麵包板 Board Group、74LS 邏輯模擬），GitHub Actions CI 已設定。
- 測試：315 個單元測試、7 個 Playwright 端對端測試。

## 進行中

| 分支 | 內容 | PR | 狀態 |
|---|---|---|---|
| `claude/affectionate-sagan-kmclr0` | 接線清單、單一 HTML 離線版（皆移植自 `feat/core-engine`）、進度同步流程（hooks、本檔） | [#3](https://github.com/kazuto0126/breadboard-lab/pull/3) | 完成，等 CI 與合併 |

## 接下來（依優先順序）

1. 從 `feat/core-engine` 移植：平板觸控（44 px 觸控目標、觸控拖曳）
2. 部署到 GitHub Pages（`base` 已經是相對路徑）
3. 子專案 5：AI 解說（Claude API；靜態網站不能放 API 金鑰，需要後端或讓使用者自己填金鑰）

## 注意事項

- `feat/core-engine` 是另一套子專案 2 實作（`src/app/`），只拿來參考，不要在上面開發。
- 同一時間只讓一個對話改同一塊程式；要平行開發就分不同分支與子專案，並登記在上面的「進行中」。
