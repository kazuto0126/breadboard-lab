# 專案進度

> 每個 Claude Code 對話開始時會自動顯示這份檔案（`.claude/hooks/session-start.sh`）。
> 每次推送前更新：做完的事寫進 `CHANGELOG.md`，這裡只留「現在」與「接下來」。最後更新：2026-10-10

## 目前狀態

- `main`：子專案 1–4 完成（核心引擎、Web App、多麵包板 Board Group、74LS 邏輯模擬）；子專案 5 第一部分（離線錯誤解說）完成；
  接線清單、單一 HTML 離線版、平板觸控也已合併（PR #3、#4，2026-10-09）。GitHub Actions CI 已設定。
- 測試：340 個單元測試、22 個 Playwright 端對端測試。

## 進行中

- `feat/ai-followup`（從 `docs/progress-after-pr4` 開出）：子專案 5 第二部分「問 AI」，接 Google Gemini `gemini-3.5-flash`。
  規格：`docs/superpowers/specs/2026-10-10-ai-followup-design.md`（已和使用者確認設計）。計畫：`docs/superpowers/plans/2026-10-10-ai-followup.md`（5 個任務）。目前：Task 1（電路摘要）、Task 2（Gemini 連線與錯誤分類）完成，進行 Task 3（金鑰與對話狀態）。

## 接下來（依優先順序）

1. GitHub Pages：部署設定已加入（`.github/workflows/pages.yml`），**需要使用者在 Settings → Pages 把 Source 設成 GitHub Actions**；設好後重新執行 Pages workflow（或下一次推到 main）就會上線
2. 子專案 5 第二部分「問 AI」：照規格與計畫實作（見上面「進行中」）。使用者已決定改用 Gemini 3.5 Flash，不用 Claude API。

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
