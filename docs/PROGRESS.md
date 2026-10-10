# 專案進度

> 每個 Claude Code 對話開始時會自動顯示這份檔案（`.claude/hooks/session-start.sh`）。
> 每次推送前更新：做完的事寫進 `CHANGELOG.md`，這裡只留「現在」與「接下來」。最後更新：2026-10-10

## 目前狀態

- `main`：子專案 1–5 完成（核心引擎、Web App、多麵包板 Board Group、74LS 邏輯模擬、AI 解說：離線錯誤解說與「問 AI」Gemini 追問）；
  接線清單、單一 HTML 離線版、平板觸控也已合併（PR #3、#4 2026-10-09，PR #5 2026-10-10）。GitHub Actions CI 已設定。
- 測試：359 個單元測試、24 個 Playwright 端對端測試。
- 線上版：https://kazuto0126.github.io/breadboard-lab-site/ （公開 repo `kazuto0126/breadboard-lab-site` 只放建好的網頁檔；
  原始碼 repo 維持私人，因為 commit 紀錄裡有作者的 Email）。`main` 更新後執行 `npm run publish:site` 發布。

## 進行中

- `docs/progress-after-pr5`（PR #6）：進度紀錄與網站發布方式（`scripts/publish-site.ts`，移除私人 repo 裡跑不起來的 `pages.yml`）。

## 接下來（依優先順序）

1. 子專案 5 之後的方向（回答裡的孔位可以點、佈線解說等，見 `docs/superpowers/specs/2026-10-10-ai-followup-design.md` 第 7 節）：先和使用者討論。

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
