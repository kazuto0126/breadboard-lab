# 專案進度

> 每個 Claude Code 對話開始時會自動顯示這份檔案（`.claude/hooks/session-start.sh`）。
> 每次推送前更新：做完的事寫進 `CHANGELOG.md`，這裡只留「現在」與「接下來」。最後更新：2026-10-13

## 目前狀態

- `main`：子專案 1–17 完成（核心引擎、Web App、多麵包板 Board Group、74LS 邏輯模擬、AI 解說、直線導線、新的自動佈線標準、可以移動 IC 的佈線模式、新元件與 IC 腳位圖、EIC-1106 大型麵包板、AI 回答的孔位連結與導線解說、邏輯圖編輯器、邏輯圖轉成麵包板、只用 NAND 轉換與板上名稱、邏輯圖的小改善、輸出用 7 段顯示器、整次佈線的說明與問 AI）；
  接線清單、單一 HTML 離線版、平板觸控也已合併。PR #7–#26 已合併（最後一批 2026-10-13）。GitHub Actions CI 已設定。
- 測試：main 上 604 個單元測試、39 個端對端測試。
- 線上版：https://kazuto0126.github.io/breadboard-lab-site/ （公開 repo `kazuto0126/breadboard-lab-site` 只放建好的網頁檔；
  原始碼 repo 維持私人，因為 commit 紀錄裡有作者的 Email）。`main` 更新後執行 `npm run publish:site` 發布；最近一次發布是 2026-10-13（PR #26 合併後，含子專案 6–17）。

## 進行中

- 子專案 18：麵包板上的便條（分支 `feat/notes`；規格待使用者確認）。

## 接下來（依優先順序）

1. 清單上的方向都做完了（「老師提供金鑰」使用者 2026-10-13 決定不做）；下一步先和使用者討論。

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
