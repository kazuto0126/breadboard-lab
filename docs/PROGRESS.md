# 專案進度

> 每個 Claude Code 對話開始時會自動顯示這份檔案（`.claude/hooks/session-start.sh`）。
> 每次推送前更新：做完的事寫進 `CHANGELOG.md`，這裡只留「現在」與「接下來」。最後更新：2026-10-06

## 目前狀態

- `main`：子專案 1–4 完成（核心引擎、Web App、多麵包板 Board Group、74LS 邏輯模擬），GitHub Actions CI 已設定。
- 測試：317 個單元測試、11 個 Playwright 端對端測試。

## 進行中

| 分支 | 內容 | PR | 狀態 |
|---|---|---|---|
| `claude/affectionate-sagan-kmclr0` | 接線清單、單一 HTML 離線版、平板觸控（畫布手勢、窄螢幕抽屜、44 px 觸控目標）（皆移植自 `feat/core-engine`）、進度同步流程（hooks、本檔） | [#3](https://github.com/kazuto0126/breadboard-lab/pull/3) | 每個推上去的 commit 都完整可合併；正在做平板觸控的多角度審查 |

## 接下來（依優先順序）

1. 修正平板觸控審查（workflow）確認的問題
2. 部署到 GitHub Pages（`base` 已經是相對路徑）
3. 子專案 5：AI 解說（Claude API；靜態網站不能放 API 金鑰，需要後端或讓使用者自己填金鑰）

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
