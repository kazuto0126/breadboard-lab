# 專案進度

> 每個 Claude Code 對話開始時會自動顯示這份檔案（`.claude/hooks/session-start.sh`）。
> 每次推送前更新：做完的事寫進 `CHANGELOG.md`，這裡只留「現在」與「接下來」。最後更新：2026-10-11

## 目前狀態

- `main`：子專案 1–5 完成（核心引擎、Web App、多麵包板 Board Group、74LS 邏輯模擬、AI 解說：離線錯誤解說與「問 AI」Gemini 追問）；
  接線清單、單一 HTML 離線版、平板觸控也已合併（PR #3、#4 2026-10-09，PR #5 2026-10-10）。GitHub Actions CI 已設定。
- 測試：main 上 359 個單元測試、24 個端對端測試；`feat/routing-standard`（含子專案 6）上 379 個、26 個。
- 線上版：https://kazuto0126.github.io/breadboard-lab-site/ （公開 repo `kazuto0126/breadboard-lab-site` 只放建好的網頁檔；
  原始碼 repo 維持私人，因為 commit 紀錄裡有作者的 Email）。`main` 更新後執行 `npm run publish:site` 發布。

## 進行中

- `feat/straight-wires`（PR #7）：子專案 6「直線導線」**已完成**，等使用者審查。規格 `docs/superpowers/specs/2026-10-10-straight-wires-design.md`、計畫 `docs/superpowers/plans/2026-10-10-straight-wires.md`。
- `feat/routing-standard`（PR #8，從 `feat/straight-wires` 開出，要先合併 PR #7）：子專案 7「新的自動佈線標準」**已完成**，等使用者審查。規格 `docs/superpowers/specs/2026-10-10-routing-standard-design.md`、計畫 `docs/superpowers/plans/2026-10-10-routing-standard.md`。
- `feat/ic-placement`（PR #9，從 `feat/routing-standard` 開出，要先合併 PR #7、#8）：子專案 8「可以移動 IC 的佈線模式」實作中。規格 `docs/superpowers/specs/2026-10-10-ic-placement-design.md`、計畫 `docs/superpowers/plans/2026-10-11-ic-placement.md`。

## 接下來（依優先順序）

使用者 2026-10-10 提出 7 項新需求，拆成子專案 6–10（細節與查到的規格見子專案 6 規格第 7 節）：

1. 子專案 8：可以移動 IC 的佈線模式（輸入的指撥開關、輸出的 LED 與電阻不動）
2. 子專案 9：新元件與 IC 腳位圖（可以隨時插隊）
3. 子專案 10：EIC-1106 大型麵包板
4. 子專案 5 之後的 AI 方向（回答裡的孔位可以點、佈線解說等）：先和使用者討論

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
