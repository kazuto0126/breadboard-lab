# 專案進度

> 每個 Claude Code 對話開始時會自動顯示這份檔案（`.claude/hooks/session-start.sh`）。
> 每次推送前更新：做完的事寫進 `CHANGELOG.md`，這裡只留「現在」與「接下來」。最後更新：2026-10-17

## 目前狀態

- `main`：子專案 1–26 完成（核心引擎、Web App、多麵包板 Board Group、74LS 邏輯模擬、AI 解說、直線導線、新的自動佈線標準、可以移動 IC 的佈線模式、新元件與 IC 腳位圖、EIC-1106 大型麵包板、AI 回答的孔位連結與導線解說、邏輯圖編輯器、邏輯圖轉成麵包板、只用 NAND 轉換與板上名稱、邏輯圖的小改善、輸出用 7 段顯示器、整次佈線的說明與問 AI、麵包板上的便條、轉換更簡潔與理想開關、便條拖曳、邏輯圖的常數與 IC 方塊、依名稱對照邏輯圖檢查麵包板、給 Claude Code 用的 MCP 伺服器、真值表題目、從題目產生邏輯圖、邏輯圖元件轉向）；
  接線清單、單一 HTML 離線版、平板觸控也已合併。PR #7–#44 已合併（最後一批 2026-10-17）；backlog 裡的三個小問題（佈線說明過期、邏輯圖的線重疊、7 段顯示 15 全暗）也已修正。GitHub Actions CI 已設定。
- 測試：main 上 728 個單元測試（含啟動 MCP 伺服器的整合測試）、50 個端對端測試。本機整套平行跑時 `gives up quickly on places that cannot be routed`（限時 15 秒）可能超時，單獨跑與 CI 會過。
- 線上版：https://kazuto0126.github.io/breadboard-lab-site/ （公開 repo `kazuto0126/breadboard-lab-site` 只放建好的網頁檔；
  原始碼 repo 維持私人，因為 commit 紀錄裡有作者的 Email）。`main` 更新後執行 `npm run publish:site` 發布；最近一次發布是 2026-10-17（PR #44 合併後，含子專案 6–26 的網頁部分與三個小問題修正）。

## 進行中

- 子專案 27–32：小功能（分支 `feat/small-features`，規格 `docs/superpowers/specs/2026-10-18-small-features-design.md`）：
  只用 NOR ✅、轉向加強 ✅、便條 ✅、輸入用按鈕 ✅、題目產生邏輯圖的其他形式 ✅、7 段顯示器加強（共陰極、小數點、每段直接控制、題目的輸出是顯示器 ✅；多位數測試中）。全部做完再開 PR。

## 接下來（依優先順序）

1. 使用者 2026-10-13 列的需求都做完了（「老師提供金鑰」決定不做）；下一步先和使用者討論。
2. MCP：給 Claude Code 用的版本是子專案 23；其他 AI 工具（Claude Desktop 等）與用連結開啟電路列在 `docs/ideas/backlog.md`。
3. 其他未開發項目與已知小問題：`docs/ideas/backlog.md`。

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
