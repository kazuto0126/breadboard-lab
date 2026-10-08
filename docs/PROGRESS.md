# 專案進度

> 每個 Claude Code 對話開始時會自動顯示這份檔案（`.claude/hooks/session-start.sh`）。
> 每次推送前更新：做完的事寫進 `CHANGELOG.md`，這裡只留「現在」與「接下來」。最後更新：2026-10-08

## 目前狀態

- `main`：子專案 1–4 完成（核心引擎、Web App、多麵包板 Board Group、74LS 邏輯模擬），GitHub Actions CI 已設定。
- 測試：339 個單元測試、22 個 Playwright 端對端測試（`feat/ai-explanation` 分支）。

## 進行中

| 分支 | 內容 | PR | 狀態 |
|---|---|---|---|
| `claude/affectionate-sagan-kmclr0` | 接線清單、單一 HTML 離線版、平板觸控（畫布手勢、窄螢幕抽屜、44 px 觸控目標）、重新整理後記得未儲存的修改、畫布大小改變時重新 Fit（皆移植自 `feat/core-engine`）、GitHub Pages 部署、進度同步流程（hooks、本檔） | [#3](https://github.com/kazuto0126/breadboard-lab/pull/3) | 每個推上去的 commit 都完整可合併；平板觸控審查確認的問題已修正（417151d）；CSS 角度審查找到的 2 個問題也已修正（077ebb3 與下一個 commit） |
| `feat/ai-explanation`（從 PR #3 的分支開出） | 子專案 5 第一部分：離線錯誤解說（點一個檢查錯誤，說明為什麼錯、具體到孔位的修改步驟、板上綠色標示）。規格 `docs/superpowers/specs/2026-10-08-ai-explanation-design.md` | 還沒開（[建立 PR](https://github.com/kazuto0126/breadboard-lab/pull/new/feat/ai-explanation)） | 已完成：規格、計畫、實作、測試全部推上去；等 PR #3 合併後再開 PR 合併到 main |

## 接下來（依優先順序）

1. 審查 `feat/ai-explanation`（子專案 5 第一部分）並開 PR；PR #3 先合併。
2. GitHub Pages：部署設定已加入（`.github/workflows/pages.yml`），**需要使用者在 Settings → Pages 把 Source 設成 GitHub Actions**，合併到 main 後就會上線
3. 子專案 5 第二部分：接 Claude API（使用者自己貼金鑰、只存在瀏覽器），第一部分完成後另寫規格。

## 注意事項

- `feat/core-engine` 是另一套子專案 2 實作（`src/app/`），只拿來參考，不要在上面開發。
- 同一時間只讓一個對話改同一塊程式；要平行開發就分不同分支與子專案，並登記在上面的「進行中」。

## 對話被用量上限中斷後怎麼接續

1. 額度恢復後，回到原本的 Claude Code 對話（Claude App 或 claude.ai/code 的對話清單），直接在同一個對話裡傳下面的提示詞。
2. 原本的對話打不開時，新開一個雲端對話、選 `kazuto0126/breadboard-lab`，傳同樣的提示詞。

```text
繼續。先同步進度：git fetch，讀 docs/PROGRESS.md 與 CHANGELOG.md 最上面的區段，看 PR 與 CI 的狀態；
如果 PR #3 還沒合併，就以 claude/affectionate-sagan-kmclr0 分支為基礎。然後從 PROGRESS.md「接下來」的第一項繼續做，
每完成一小步就推送並更新 PROGRESS.md。
```
