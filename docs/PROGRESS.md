# 專案進度

> 每個 Claude Code 對話開始時會自動顯示這份檔案（`.claude/hooks/session-start.sh`）。
> 每次推送前更新：做完的事寫進 `CHANGELOG.md`，這裡只留「現在」與「接下來」。最後更新：2026-10-08

## 目前狀態

- `main`：子專案 1–4 完成（核心引擎、Web App、多麵包板 Board Group、74LS 邏輯模擬），GitHub Actions CI 已設定。
- 測試：323 個單元測試、20 個 Playwright 端對端測試（含 PR #3 的分支）。

## 進行中

| 分支 | 內容 | PR | 狀態 |
|---|---|---|---|
| `claude/affectionate-sagan-kmclr0` | 接線清單、單一 HTML 離線版、平板觸控（畫布手勢、窄螢幕抽屜、44 px 觸控目標）、重新整理後記得未儲存的修改、畫布大小改變時重新 Fit（皆移植自 `feat/core-engine`）、GitHub Pages 部署、進度同步流程（hooks、本檔） | [#3](https://github.com/kazuto0126/breadboard-lab/pull/3) | 每個推上去的 commit 都完整可合併；平板觸控審查確認的問題已修正（417151d，CI 綠燈）；CSS 角度的審查待補跑 |

## 接下來（依優先順序）

1. 審查（2026-10-06 在本機 Windows 對話進行到一半，使用者要求先停）：
   - 已看完、沒有找到問題：3e94964（重新整理後記得未儲存）、9df4d0d（畫布大小改變時重新 Fit）、417151d 的指標事件邏輯。
   - CSS 角度，待確認與修正：
     a. ✅ 右鍵 / 長按選單在靠右或靠下的地方會被畫布邊緣切掉：已修正（放不下時翻到指標左邊 / 上面），
        e2e 先失敗再通過。
     b. 工具列下拉選單與對話框（`Modal`）沒有最大高度、不能捲動。1133 × 744（iPad mini 橫放、觸控）量到
        「檔案」選單底部在 678 px、說明對話框 22–722 px，剛好放得下；實機 Safari 扣掉網址列後可能超出畫面。
        修法：加 `max-h` 與 `overflow-y-auto`。
   - 確認後各自先寫會失敗的 e2e 再修。
2. GitHub Pages：部署設定已加入（`.github/workflows/pages.yml`），**需要使用者在 Settings → Pages 把 Source 設成 GitHub Actions**，合併到 main 後就會上線
3. 子專案 5：AI 解說。先寫設計規格 `docs/superpowers/specs/2026-10-06-ai-explanation-design.md`（設計 workflow 同樣中止，要重新跑）。
   預定方向：靜態網站不能放 API 金鑰，所以由使用者自己貼 Claude API 金鑰（只存在自己的瀏覽器）；
   第一步做不需要網路的確定性解說（錯誤、Net、佈線的說明），之後才接 Claude API。使用者若想用別的方式要先講。

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
