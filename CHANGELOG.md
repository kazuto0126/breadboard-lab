# 變更紀錄

本檔記錄專案的每一次修改。格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，
每一筆都對應 GitHub 上的 commit，詳細設計見 `docs/superpowers/specs/`。

## [未發布] — 進度紀錄：PR #5 已合併；網站改從公開的 breadboard-lab-site 發布

### 變更

- 網站版改放在另一個公開 repo `kazuto0126/breadboard-lab-site`（https://kazuto0126.github.io/breadboard-lab-site/ ，離線版是
  `breadboard-lab-offline.html`）：原始碼 repo 維持私人（commit 紀錄裡有作者的 Email），公開的只有建好的網頁檔。
- 新增 `npm run publish:site`（`scripts/publish-site.ts`）：建置網站版與離線版、推到公開 repo，commit 用 GitHub 的匿名信箱。
- 移除 `.github/workflows/pages.yml`：私人 repo 在免費方案不能用 Pages，每次推到 main 都會失敗。

### 文件

- `docs/PROGRESS.md`：PR #5（子專案 5 第二部分「問 AI」）已合併到 main，沒有進行中的分支；GitHub Pages 部署因為 repo 還沒啟用 Pages 而失敗，
  私人 repo 在免費方案不能用 Pages，記為需要使用者決定的事項。

## [未發布] — 子專案 5 第二部分：問 AI（Gemini）

### 新增

- 錯誤解說卡下面多一塊「問 AI（Gemini）」：三個建議問題（為什麼會這樣？有沒有別的改法？實體麵包板上要注意什麼？）或自己打字，
  回答一段一段出現，可以接著追問；回答中可以按「停止」。換了錯誤或改了電路，對話重新開始。
- 第一則問題會連同「電路摘要」一起送出：每個元件每一隻腳插在哪個孔、每條導線、每個 Net、沒有相連的腳，以及這個錯誤的離線解說步驟；
  系統指示要求用繁體中文、孔位沿用網站寫法、不編造摘要裡沒有的孔、不用 Markdown。
- 模型 `gemini-3.5-flash`（思考程度 medium），官方套件 `@google/genai` 在第一次發問時才載入（約 65 KB gzip），網站開啟速度不受影響。
- 「說明 → Gemini API 金鑰設定…」：貼上自己的金鑰（Google AI Studio 免費申請）；預設只保留到關掉分頁，可勾選「在這台電腦記住」，可以清除。
  對話框寫清楚會送出哪些內容、免費額度的內容可能被 Google 用來改進產品、付費金鑰一次追問通常不到新台幣 1 元。
- 出錯時顯示原因：金鑰不正確（附「重新設定金鑰」）、已達使用上限、Gemini 忙碌、連不上網路、沒有回答；已經收到的部分會留著。
- 測試：單元測試 19 個（電路摘要；用假的 fetch 檢查實際送出的模型、金鑰、系統指示、思考程度、多輪紀錄與錯誤分類；金鑰保存；
  對話狀態的停止、出錯、換電路、換錯誤、換金鑰）；Playwright `e2e/ask-ai.spec.ts` 2 個（攔截 Gemini 請求、回傳假的串流回答，不花錢）。

### 文件

- `docs/PROGRESS.md`：PR #5 已開，等使用者審查與實際用金鑰試問。

- 新增 `docs/superpowers/specs/2026-10-10-ai-followup-design.md`：錯誤解說卡下面加「問 AI」，把電路摘要、錯誤與離線解說連同學生的問題送給
  Google Gemini（`gemini-3.5-flash`），用繁體中文串流回答、可以接著追問；金鑰由學生自己到 Google AI Studio 申請、只存在瀏覽器
  （預設關掉分頁就忘記，可勾選記住）；寫清楚免費額度的內容可能被 Google 用來改進產品，以及付費金鑰的大約費用。

## [未發布] — 進度紀錄：PR #3、#4 已合併

### 文件

- `docs/PROGRESS.md`：PR #3（平板觸控等）與 #4（子專案 5 第一部分）已合併到 main，沒有進行中的分支；下一步是 GitHub Pages 設定與子專案 5 第二部分。

## [未發布] — 子專案 5 第一部分：離線錯誤解說

### 新增

- 在「檢查」分頁點一個錯誤，下面展開解說卡：**為什麼錯**（白話一到三句）與**怎麼改**（有編號的步驟，寫到孔位；
  孔位可以點，畫面會移過去）。麵包板上同時用綠色虛線圈與編號標出建議的孔、綠色虛線畫出建議的導線、紅色光暈標出建議拔掉的導線。
- 7 種錯誤有具體孔位建議：IC 沒接 VCC / GND（從腳那一排拉線到同側有電的電源軌；沒有電源時先放一個）、電路沒有電源、
  IC 輸入懸空（要用就接開關或輸出，用不到就接 + 軌）、腳沒有連接、LED 沒有限流電阻（電阻串在陰極那一側，原本的線改接）、
  LED 接反、短路（逐一假設拔掉每條線，找出拔掉就不短路的那條）。其他 10 種有「為什麼 / 怎麼改」的說明。
- 建議導線用和手動接線同一個路徑規劃，學生從 1 號孔拉到 2 號孔就會得到同一條線；只給建議，不自動修改電路。
- 程式在 `src/editor/explain/`（不依賴 DOM），畫面是 `ExplanationCard` 與 `SuggestionMarks`。
- 測試：單元測試 17 個（每種有孔位建議的錯誤都檢查「照著做之後錯誤會消失」；插在電源軌上的腳建議旁邊的空孔）；Playwright `e2e/explain.spec.ts`
  （匯入沒接 VCC 的 74LS00 → 點錯誤看到 A10、T+10 → 照著拉線 → 錯誤消失）。

### 文件

- 新增 `docs/superpowers/specs/2026-10-08-ai-explanation-design.md`：點一個檢查錯誤時說明為什麼錯，並給出具體到孔位的修改步驟、
  在麵包板上用綠色標出建議的孔與導線；不用網路、不自動修正。接 Claude API 之後另寫規格。

## [未發布] — 矮螢幕上選單與對話框不會超出畫面

### 修正

- 平板橫放、扣掉瀏覽器網址列後畫面只剩約 660 px 高時，「檔案」選單（每項 44 px、含 6 個範例電路）的最後幾項
  與說明對話框的下半部會超出畫面，按不到也捲不到。現在工具列的下拉選單最多到畫面底部、可以捲動；
  對話框最多和畫面一樣高，標題與 ✕ 留在上面，內容可以捲動。
- 測試：Playwright `e2e/tablet.spec.ts` 新增 1133 × 660 的測試（修正前「檔案」選單底部在 678 px）。

## [未發布] — 右鍵選單不會被畫布邊緣切掉

### 修正

- 在畫布靠右或靠下的地方按右鍵（平板是長按）時，選單會超出畫布、被裁掉一部分，下面的項目按不到；
  平板上每項 44 px 高，更容易發生。現在放不下時翻到指標的左邊 / 上面，選單一定留在畫布裡；畫布太矮時選單可以捲動。
- 測試：Playwright `e2e/tablet.spec.ts` 新增「在畫布右下角打開右鍵選單」（修正前選單右緣在 990 px，超出 820 px 的畫面）。

## [未發布] — 修正平板觸控審查找到的問題

多角度審查（指標事件、版面、狀態三個角度，各自有反駁驗證）確認 9 項、去重後 5 個問題，另外處理 3 個次要問題。

### 修正

- 兩指縮放後，若另一指在畫布外（例如右下角的縮放數字、側邊面板）放開，之後所有單指操作（接線、點選放置、移動）
  都會被當成兩指縮放，要重新整理才恢復。現在兩指手勢結束時只放開抬起的那一指，另一指仍由畫布接收；
  另外在 window 上補記放開事件、第一根手指按下時清掉舊紀錄。
- 窄螢幕的元件庫抽屜裡，手指一碰到元件就收起抽屜，清單滑不動；寬螢幕上滑動清單也會取消選取、離開比較畫面。
  現在觸控 / 觸控筆按下元件時先不拿起來：往旁邊拖才開始拖放，放開時沒移動才是「點選放置」，上下滑就是捲動清單。
- Android 長按麵包板（還沒放開、等放開才放置時）會送 contextmenu，把放置取消。現在手指還按著時不取消，只有滑鼠右鍵取消。
- 窄螢幕的比較畫面蓋住元件庫 / 資訊抽屜（按了按鈕卻看不到）；右鍵選單與佈線中的遮罩也會蓋過抽屜。
  畫布區域（`main`）改成獨立的堆疊層（`isolate`），畫布上的浮層不會再蓋過抽屜。
- 窄螢幕上狀態列的 Nets、選單「顯示所有 Nets」、檢查徽章、右鍵選單「顯示屬性」只切換了分頁，抽屜沒打開，畫面沒反應。
  新增 `showRightTab`：窄螢幕時順便打開資訊抽屜（寬螢幕不動抽屜狀態）。
- 次要：觸控筆（沒有懸停的 Apple Pencil）點選放置時用到舊的預覽位置，現在和手指一樣放開時才放在點的位置；
  iPad mini 直放（744 px）時右邊的「檢視」「說明」選單超出畫面，現在會往左移到畫面裡。
- 測試：store 2 個；Playwright 觸控 4 個（兩指結束時另一指在畫布外放開、第二指取消正在拉的導線、長按不取消放置、觸控筆點選放置），
  平板 3 個（滑動捲動元件庫且保留選取、從抽屜拖到麵包板、比較畫面上的抽屜與 Nets 打開抽屜、744 px 選單都在畫面裡）；
  「拿著元件平移」改成從點一下就能放置的位置開始滑並加上對照。新測試都先確認在修正前會失敗（強化的兩個除外）。

## [未發布] — 畫布大小改變時重新符合畫面（移植自 feat/core-engine）

### 修正

- 只有第一次量到畫布大小時會 Fit to Screen：平板轉向、調整視窗大小後，麵包板可能有一半在畫面外。
  現在使用者還沒自己縮放或平移（滾輪、兩指、拖曳、＋ / − 按鈕）時，畫布大小改變就自動重新 Fit；
  縮放或平移過就保留使用者的畫面，按 Fit to Screen（F）後又恢復自動。
- 測試：store 測試 1 個；Playwright `e2e/tablet.spec.ts` 新增轉向測試（直放 → 橫放整塊板子仍在畫面裡、放大後轉回仍保留縮放）。

## [未發布] — 重新整理後仍記得有未儲存的修改（移植自 feat/core-engine）

### 修正

- 重新整理頁面後，電路雖然會從自動儲存還原，但「尚未儲存」的狀態不見了：按「新電路」不再先確認，工具列的 • 也消失，
  沒存過的電路可能一鍵就被清掉。自動儲存現在會記錄上次「儲存」之後有沒有修改（`unsaved`，舊的自動儲存照樣能讀），
  重新整理後仍算未儲存；儲存專案後自動儲存跟著更新。
- 測試：`tests/web/persistence.test.ts` 3 個（旗標往返、重新整理後仍未儲存、修改後寫入 / 儲存後清除）；
  Playwright 的自動儲存測試在重新整理後按「新電路」會出現確認對話框。

## [未發布] — 部署到 GitHub Pages

### 新增

- `.github/workflows/pages.yml`：`main` 每次更新（或手動執行）就建置網站版與離線版，部署到 GitHub Pages
  （https://kazuto0126.github.io/breadboard-lab/，離線版在 `breadboard-lab-offline.html`）。
  第一次使用前要在 GitHub 的 Settings → Pages 把 Source 設成「GitHub Actions」。

## [未發布] — 平板觸控第 2、3 步：窄螢幕抽屜與 44 px 觸控目標

### 新增

- 寬度 < 1024 px（例如直放的平板）時，左側元件庫與右側資訊面板改成抽屜：工具列新增「元件庫」「資訊」按鈕開關，
  點旁邊的暗色區域關閉；從元件庫拿起元件時抽屜自動收起，才點得到麵包板。寬螢幕的版面不變。
- 工具列在窄螢幕時換行（不會被裁掉或出現水平捲軸），專案名稱在很窄時只顯示圖示。
- 觸控裝置（`pointer: coarse`）上，按鈕、分頁、選單項目、下拉選單、輸入框至少 44 × 44 px，
  勾選框放大並以包住它的 label 為點擊範圍；用滑鼠的電腦版面不受影響。
- 測試：Playwright `e2e/tablet.spec.ts`（820 × 1180、觸控）2 個：抽屜開關、點選放置、資訊面板修改元件、
  工具列 / 元件庫 / 資訊面板 / 選單 / 接線清單 / 狀態列沒有小於 44 × 44 px 的點擊目標。

### 修正

- 狀態列的欄位在窄螢幕時被壓縮、文字重疊：欄位不再縮小，必要時整列可以左右捲動。

## [未發布] — 平板觸控（移植自 feat/core-engine，第 1 步：畫布手勢）

### 新增

- 兩指縮放與平移（`pinchViewport`）：第二指按下時放棄第一指還沒完成的接線 / 移動 / 平移，兩指中點底下的位置跟著手指移動。
- 觸控放置：點一下元件庫、再點麵包板，放開手指時才放置；拿著元件時一指滑動是平移畫面、兩指是縮放，不會誤放。
- 元件庫在觸控時可以上下滑動捲動清單（`touch-action: pan-y`），往畫布方向拖曳仍然是拖放；捲動時自動放下拿起的元件。
- 測試：`pinchViewport` 2 個單元測試；Playwright `e2e/touch.spec.ts`（觸控事件）2 個：點選放置 + 手指接線 + 兩指縮放約兩倍、拿著元件時平移不誤放。

## [未發布] — 單一 HTML 離線版（移植自 feat/core-engine）

### 新增

- 設計規格：`docs/superpowers/specs/2026-10-06-single-file-build-design.md`。
- `npm run build:single`：用 `vite-plugin-singlefile` 把整個工具包成一個 HTML 檔（`dist-single/breadboard-lab.html`，約 540 KB），
  複製到任何電腦雙擊就能用，不需要伺服器或網路；自動儲存、匯入匯出、AI 標準佈線、模擬都能用。
- CI 每次建置離線版並上傳成 Artifact（`breadboard-lab-offline`，保留 30 天）。
- 端對端測試 `e2e/single-file.spec.ts`：用 `file://` 開啟離線版、載入範例並完成 AI 標準佈線，
  檢查沒有外部 `<script>` / `<link>`、沒有任何對外請求、沒有頁面錯誤。

### 變更

- 佈線 Worker 改用 Vite 的 `?worker&inline`（Worker 程式碼內嵌、用 blob URL 啟動的 classic worker），網站版與離線版共用。
- `base` 改成相對路徑 `./`；網頁圖示改由 `vite.config.ts` 的小 plugin 內嵌成 data URI，
  工具列 logo 改成 import（`public/favicon.svg` 移到 `src/assets/logo.svg`）。

## [未發布] — 進度同步流程（避免用量上限中斷時遺失進度）

### 新增

- `docs/PROGRESS.md`：目前狀態、進行中的分支與 PR、接下來的工作、注意事項；每次推送前更新。
- Claude Code hooks（`.claude/settings.json`，雲端對話也會讀取）：
  - `SessionStart` → `.claude/hooks/session-start.sh`：雲端容器裡先 `npm install` 並設定 e2e 使用預裝的 Chromium，
    再 `git fetch` GitHub，把目前分支與 origin 的差距、最近更新的分支、`docs/PROGRESS.md` 加進 Claude 的上下文。
  - `Stop`、`StopFailure` → `.claude/hooks/checkpoint.sh`：每次回覆結束或因 API 錯誤 / 用量上限中斷時，
    把工作分支上還沒提交的修改存成 `wip: checkpoint` commit，並推送還沒推的 commit（失敗時重試 3 次）；
    不動 main / master、detached HEAD，合併或 rebase 進行中也不動，永遠不阻擋 Claude。

### 變更

- `CLAUDE.md` 新增「工作流程」：開工前看進度摘要、一個任務一個分支並早開 draft PR、小步提交推送、推送前更新進度檔；
  「目前狀態」改為指向 `docs/PROGRESS.md`。

## [未發布] — 接線清單（移植自 feat/core-engine）

### 新增

- 設計規格：`docs/superpowers/specs/2026-10-06-wiring-checklist-design.md`（移植 `feat/core-engine` 編輯器設計第 9 節，改成主線的架構）。
- **接線清單**（右側面板「接線清單」分頁）：照著畫面插實體麵包板時，一條一條打勾。
  - 列出目前電路的所有導線（AI 標準佈線或手動接線都可以），依「① 電源 → ② 接地 → ③ 訊號 → 其他」分段，
    同類依 Net 名稱與導線 ID 的自然順序（`NET_2` 在 `NET_10` 前面）。
  - 每一列：勾選框、色塊與中文色名、`起點 → 終點`（多塊板時含板子 ID）、長度；上方有「已完成 / 總數」、進度條與「全部清除」，分頁標籤也顯示進度。
  - 點一列：選取那條導線並把畫面移過去，其他導線變淡，只標出這一條；已打勾的導線在板上畫成半透明。
  - 勾選記錄「勾選當時這條線的樣子」（兩端孔位、長度、顏色）：重新佈線或改色後自動變回未完成；Undo 回到同一條線時勾選又出現。
  - 打勾不進 Undo、不算未儲存的修改；勾選進度跟著自動儲存與「儲存」的專案保存（`CircuitFile.checklist` 選填欄位，舊檔照樣能開），匯出 JSON 不含。
- `src/editor/checklist.ts`（不依賴 DOM）：`checklistRows`、`wireKey`、`isChecked`、`setChecked`、`pruneChecklist`、`checklistProgress`、`colorName`、`naturalCompare`。
- store：`checklist` 狀態、`setWireChecked`、`clearChecklist`；`select(selection, { keepTab })` 讓清單點選時停留在同一個分頁。
- 測試：接線清單 7 個、存檔格式 1 個、store 3 個單元測試；Playwright「接線清單」：AI 標準佈線 → 打勾 → 點選定位 → 重新整理後進度仍在 → 全部清除。

### 變更

- `holeLabel`（孔位名稱，多板時含板子 ID）移到 `src/editor/analysis.ts`，畫面與接線清單共用。

## [未發布] — 開發流程

### 新增

- `CLAUDE.md`：給 Claude Code 新對話的專案說明（指令、架構與依賴方向、格點 / 多板 / 導通的重要概念、
  繁中文件與 CHANGELOG 等慣例、目前狀態），新的對話不必重讀整個專案就能接手。
- GitHub Actions CI（`.github/workflows/ci.yml`）：每個 Pull Request 與 push 到 `main` 時執行
  `npm ci` → 型別檢查 → 單元測試 → 建置，另一個工作安裝 Chromium 跑 Playwright 端對端測試，失敗時保留 trace。
  同一分支有新的 push 時取消舊的檢查。

## [未發布] — 子專案 3：多麵包板長邊吸附與 Board Group（已完成）

### 新增

- 子專案 3 設計規格：`docs/superpowers/specs/2026-10-06-multi-board-design.md`
  （全域格子、群組由幾何推導、跨板接縫、依群組分區佈線、吸附 / 拆開 / 合併、對應 38.19 的測試）。
- 核心引擎支援多塊麵包板（`src/core/breadboard/lattice.ts`）：
  - 所有板子共用一張 0.1 吋**全域格子**；每塊板的板面 = 格點範圍外加一圈留白（65 × 20 格）。
  - **Board Group 由幾何推導**：邊對邊貼合且完全對齊（上下排 x 相同、左右排 y 相同）的板子連成一組。
  - 同一組兩塊板之間的**接縫**（兩側各一格留白）可以走線，所以導線能跨板；其他留白仍然不能走，
    單板的佈線格子與結果和以前完全相同。
  - `stepDirection`、`pathIssues`、轉彎 / 小折角計算、重疊 / 交叉分析、`computeMetrics` 加上可選的 `lattice`；
    `validateCircuit`、`checkRoutingLegality`、`scoreRouting` 一律使用，跨板導線也能正確檢查。
  - 自動佈線改成**每個 Board Group 一張格子**（`buildRoutingProblems`），各自協商；
    連到不同群組的 Net 回報 UNROUTABLE（「連到沒有貼在一起的麵包板」）。
  - 多塊板時，檢查訊息與失敗說明中的孔位 / 群組加上板子 ID（例如 `b1:H12`、`b2 第 7 欄下半`）。
  - 測試建構工具新增 `board()`、`holeOn()`、`comp(..., { board })`、`latticeWire()`（可跨接縫的導線）。
  - 11 個新測試（`tests/routing/multiBoard.test.ts`）：全域格子、群組判定、接縫、單板格子不變，
    以及 38.19 #7（貼合不導通）、#8（跨板導線形成 Net）、#9 #10（群組自動佈線、跨板導線合法、0 重疊 0 交叉）、
    未貼合板子的 Net 回報失敗、跨板模擬。
- 多塊麵包板的編輯邏輯（`src/editor/boards.ts`，不依賴 DOM）：
  - `boardGroups` 推導需求文件 38.8 的 `BoardGroup`；`normalizeBoardGroups` 讓位置對齊格點並寫回每塊板的 `groupId`。
  - `snapBoardMove`：拖曳中的板子（或整個群組）的邊與其他板子相距 ≤ 吸附距離（24 px，依縮放換算成格數）、
    而且長邊重疊至少一半時，自動貼齊並**完全對齊**；有多個選擇時取最近、不會重疊的位置。
    回報 `blocked`：和其他板子重疊，或會拉斷連到群組其他板子的導線。
  - `moveBoards`（元件與導線用板內座標，跟著板子移動）、`addBoard`（放在所有板子下方、間隔 4 格，最多 8 塊）、
    `removeBoard`（連同板上元件與碰到的導線；最後一塊不能刪）、`detachBoard`（「移出群組」：往最近的方向移到與所有板子相隔 2 格）、
    `crossBoardWires`、`groupMembers`。
- 手動接線可以跨板：`planWirePath` 把同一個 Board Group 當成一張格子規劃路徑，經過板子之間的接縫；
  兩端在沒有貼在一起的板子上時只回傳兩端（Check Circuit 判定不合法）。
- `moveComponent` 可以把元件移到另一塊板（`boardId` 參數）。
- 存檔格式支援多塊板：1–8 塊、ID 不可重複、板子不可重疊；匯入時位置對齊格點並重新推導群組
  （檔案裡的 `groupId` 不採信）。
- 13 個新測試（`tests/editor/boards.test.ts`）對應 38.19 #1–#6：新增兩塊板並自由拖曳、
  靠近吸附並對齊（上下 / 左右、距離外不吸附、縮放換算、重疊不能放）、吸附後成為群組、整組一起移動、
  拉開後群組解除、C 貼到 B 時 A + B + C 合併、兩個群組合併；以及刪除 / 移出群組 / 跨板導線阻擋拆開、
  跨板手動接線。存檔格式多板測試 2 個。

- **多麵包板的畫面操作**：
  - 新增麵包板：左側元件庫最上方的「麵包板」卡片、「電路」選單、畫布右鍵選單、右側面板的電路資訊（最多 8 塊）。
  - 有兩塊以上的板子時，拖曳板子沒有孔的地方移動**整個群組**；Alt / Shift + 拖曳只移動這一塊。
    拖曳中板子連同元件、導線跟著移動，靠近另一塊板的邊時自動吸附並顯示淡藍色預覽線與「↕ SNAP / ↔ SNAP」；
    重疊或會拉斷跨板導線時整塊變紅，放開後回到原位並說明原因。吸附距離依縮放換算（38.3）。
  - 每個 Board Group 畫共同的藍色外框與「Board Group N · M Boards」標籤，選取組內的板子時外框加粗（38.10）；
    每塊板左上角印出板子 ID，孔位名稱加上板子 ID（例如 `b2:A12`），導線資訊顯示「跨 b1、b2」。
  - 點一下板子空白處選取板子：右側面板顯示位置、大小、所屬群組、元件 / 導線 / 跨板導線，
    以及「移出群組」「刪除麵包板」；`Delete` 與右鍵選單也可以。滑鼠停在板子上會說明怎麼拖曳。
  - 接線可以從一塊板拉到同一群組的另一塊板（路徑經過接縫）；元件可以直接拖到另一塊板。
  - store 新增 `addBoard`、`moveBoards`（再次檢查重疊與跨板導線）、`removeBoard`（Undo 可復原，提示一併刪除的元件與導線數）、
    `detachBoard`；選取種類新增 `board`；比較結果在麵包板移動後也會過期。
- 第 5 個範例「兩塊麵包板（Board Group 示範）」：74LS00 在上板、電阻與 LED 在下板，
  載入時套用 AI 標準佈線（Routing Score 100、兩條跨板導線），按「▶ 模擬」LED 會亮。
- 測試：store 多板測試 6 個（新增 / 吸附 / 整組移動 / 重疊與跨板導線阻擋 / 刪除與 Undo / 元件換板 / 比較過期 / 數量上限）、
  範例電路的佈線與模擬測試、Playwright 端對端測試「第三十八章」：新增麵包板 → 拖曳出現 SNAP 預覽 → 放開成為 Board Group →
  拖曳整組 → 跨板接線 → Check Circuit 通過 → Shift + 拖曳被跨板導線擋下。

### 變更

- 板子上下的留白從 1 格改為 1.5 格（與左右相同），板子大小剛好是 65 × 20 格，所有格點落在全域格子上；
  板子在畫面上的位置一律對齊格點。`fromWorld` 也會回報板邊留白上的格點（x 為 0 或 64、y 為 0 或 19）。

## [未發布] — 子專案 4：74LS 數位邏輯模擬

### 新增

- 子專案 4 設計規格：`docs/superpowers/specs/2026-10-06-logic-simulation-design.md`
  （邏輯模型 JSON 格式、模擬引擎演算法、時脈元件、模擬模式的畫面）。
- 元件 JSON 的 `logic` 欄位正式啟用（`src/types/logic.ts`）：以「模型 + 腳位名稱」描述 IC 行為，
  共 8 種模型——`gates`、`decoder`、`dff`、`ripple-counter`、`sync-counter`、`updown-counter`、`adder`、`transceiver`。
  20 顆 74LS IC 依 datasheet 的功能表填好 `logic`；之後新增同類 IC 只需要寫 JSON。
- `parseLogic`（`src/core/circuit/logicSpec.ts`）：驗證模型名稱、參數、腳位名稱（不能引用重複的名稱，例如 NC），
  只保留已知欄位。7 個新測試。
- 邏輯模型實作（`src/core/simulation/models.ts`）：三值邏輯（0 / 1 / X，AND 類遇 0、OR 類遇 1 就確定），
  8 種模型的行為依 datasheet：閘、解碼器致能、正反器上升緣 / 非同步 preset / clear（74LS74 兩者同時有效時 Q 與 /Q 皆為 HIGH）、
  74LS173 載入致能與三態輸出、漣波計數器下降緣與重置 / 設 9（R9 優先）、同步計數器非同步 / 同步清除與 RCO、
  上 / 下數計數器的 /CO、/BO、加法器、收發器方向與致能。
  `tests/simulation/models.test.ts` 28 個測試逐顆對照功能表（含 74LS283 全部 512 種輸入、74LS90 BCD、74LS93 0–15 計數）。
- **模擬引擎**（`src/core/simulation/simulate.ts`，不依賴 DOM）：
  - `compileSimulation`：依實際插法建立節點（導線只有端點導電、導通群組、元件內部導通），
    找出電源、時脈、指撥開關、按鈕、電阻、LED 與 IC；依電路參照快取。
  - `settle`：依開關與按鈕狀態合併節點 → 強驅動合併（不一致為 X）→ 沿電阻一層層傳弱驅動（上拉 / 下拉 / 限流）→
    所有 IC 讀同一份電位求值（結果與順序無關），直到輸出不變；超過 100 輪判定震盪。
    TTL 輸入浮接讀成 1、VCC / GND 沒接好的 IC 不運作、IC 輸出上電時為 X（SR 閂鎖在第一次設定前為未知）。
  - `adoptSimState`：電路被編輯（例如切換開關）後沿用同一顆 IC 的內部狀態；`clockLevel` / `nextClockEdge`：時脈時序。
  - 15 個測試：上拉 / 下拉、浮接、未供電、輸出互接、指撥開關、NAND SR 閂鎖、環形振盪判定、時脈，
    以及 3 個範例電路（驗收電路 LED 亮、74LS93 每按一次加 1、74LS283 算出 3 + 5 = 8）。
  - 對外 API 新增模擬相關函式與型別（`src/index.ts`）。
- **模擬模式**（工具列「▶ 模擬」）：
  - LED 依模擬結果發光（亮色圓頂 + 光暈），沒亮的畫暗；IC 腳片、電阻 / LED / 按鈕腳、導線端點依電位上色
    （1 亮綠、0 灰、Z 藍、X 紅），HIGH 的導線中央加一條亮綠線；未供電的 IC 標示「未供電」。
  - 直接在板上點指撥開關的小開關切換 ON / OFF（可 Undo、會存檔）、按住按鈕 = 按下。
  - 時脈每 25 ms 推進一次模擬時間（結果可重現）；可暫停 / 繼續、單步到下一個時脈邊緣、重置回上電狀態。
  - 模擬列顯示時間、時脈、電位圖例，以及未供電、震盪、電位衝突的警告；滑鼠提示與右側面板（腳位表、Net、孔、導線）顯示電位。
  - 模擬中鎖定結構編輯（放置、移動、旋轉、刪除、接線、自動佈線、模式切換），屬性修改與 Undo / Redo 仍可用並即時重算。
- 第 4 個範例「74LS161 + 時脈（模擬示範）」：1 Hz 時脈驅動 74LS161，4 顆 LED 自動數 0–15；
  控制腳與資料腳都接好，Check Circuit 完全通過，載入時已套用 AI 標準佈線。
- 測試：store 模擬測試 5 個（開始 / 停止、模擬中鎖定編輯、撥開關與 Undo、按鈕計數與重置、時脈計時器 / 暫停 / 單步），
  範例計數測試 1 個，Playwright 端對端測試 1 個（在板上撥指撥開關算出 3 + 5、模擬中不能拖曳元件、按按鈕計數）。
- 新元件 **Clock 時脈產生器**（類別 `clock`、編號前綴 `CLK`、屬性 `frequency` 0.5–10 Hz）：
  板上圖示、元件庫圖示（放在「輸入」分類）、屬性面板頻率選擇、存檔格式支援。

### 修正

- 按鈕上的編號文字蓋住按鈕帽，點按鈕中央會點到文字而按不下去：編號移進可按的區域。
- 模擬中滑鼠提示仍寫「拖曳移動 · R 旋轉」，改成依元件提示撥開關 / 按按鈕；開始模擬的說明只顯示一次；
  沒有時脈時不顯示模擬時間；電位圖例移到畫布左下角，模擬列不再折成兩行。

## [未發布] — 子專案 2：Web App

### 新增

- 子專案 2（Web App）設計規格：`docs/superpowers/specs/2026-10-06-web-app-design.md`。
- 本變更紀錄檔。
- 前端工具鏈：Vite 8、React 19、Zustand 5、Tailwind CSS 4、Playwright（e2e）。
  新增 `npm run dev`、`npm run build`、`npm run preview`、`npm run e2e`。
- TypeScript 設定拆成兩份：`tsconfig.json`（核心引擎、editor、測試，**不含 DOM 型別**，
  強制核心與編輯邏輯不依賴瀏覽器）與 `tsconfig.web.json`（畫面，含 DOM 與 JSX）；
  `npm run typecheck` 會檢查兩者與 e2e 測試。
- `vitest.config.ts`：單元測試只收 `tests/**/*.test.ts`，與 Playwright 的 e2e 測試分開。
- `src/editor/`：不依賴 DOM 的編輯邏輯（全部有單元測試，`tests/editor/`，53 個測試）。
  - `geometry.ts`、`viewport.ts`：格點 ↔ 像素換算、以游標為中心縮放、Fit to Screen。
  - `history.ts`：Undo / Redo 堆疊（附動作名稱，上限 200 步）。
  - `ids.ts`：元件編號（U1、R1、D1…）與導線編號（w1…）。
  - `placement.ts`：放置合法性檢查（硬性 / 軟性問題）、半徑 2 格內自動吸附、以中心為軸旋轉
    （DIP IC 轉 90° 插不進去時自動翻轉 180°）。
  - `manualWire.ts`：手動接線的正交路徑規劃（Dijkstra，避開元件與其他導線端點、轉彎加成本），
    空孔判斷、依電源軌決定預設導線顏色。
  - `commands.ts`：放置、移動、旋轉、刪除、修改屬性 / 跨距、切換指撥開關、接線、改色等純函式動作。
  - `fileFormat.ts`：存檔格式 `breadboard-lab/circuit` v1 與完整的匯入驗證（中文錯誤訊息指出哪一筆資料錯）。
  - `analysis.ts`：Net、檢查結果、Routing Score 依電路參照快取。
  - `library.ts`：元件庫分類（74LS / 電阻 8 種阻值 / LED 4 色 / 電源 / 輸入）與搜尋。
  - `builder.ts`、`examples.ts`：電路建構工具與 3 個範例電路（原本在 `tests/fixtures/`，
    改由 `src/editor` 提供，測試沿用同一份，保證範例一定佈得出來）。

- `src/workers/`：佈線 Web Worker（`routing.worker.ts`）與用戶端（`routingClient.ts`）：
  每次佈線一個 module Worker、可取消（terminate）、沒有 Worker 時退回主執行緒。
- `src/state/store.ts`：Zustand store——可 Undo 的編輯動作、選取、元件放置工具、
  AI 標準佈線生命週期（計算 → 套用 → 描線動畫 → 結果）、MANUAL / AUTO ROUTE / COMPARE 模式
  （由資料推導，與 Undo 一致）、提示訊息；`persistence.ts`：自動儲存與瀏覽器專案庫（localStorage）。
- `src/render/theme.ts`：麵包板與元件配色、電阻色環計算。
- SVG 繪圖元件：麵包板底圖（830 孔、電源軌色線、凹槽、排標籤與欄號）、
  74LS IC / 指撥開關 / 電阻（依阻值畫色環）/ LED（陰極切平、標 + −）/ VCC / GND / DC Power / 按鈕、
  跳線（外框、端點插針、描線動畫）。

- **可操作的 Web App**（`npm run dev`），版面依需求文件第二十一章：
  - 頂部選單（檔案 / 編輯 / 電路 / 自動佈線 / 檢視 / 說明）、MANUAL / AUTO ROUTE / COMPARE 模式切換、
    「Check Circuit」與「AI 標準佈線」按鈕。
  - 左側元件庫：74LS / 電阻 / LED 以兩欄小格子顯示、分類快速跳轉、搜尋；拖曳或點一下放置；
    Jumper Wire 預設顏色選擇。
  - 中央互動式麵包板：放置時 ghost 預覽（綠 = 可放、紅 = 不可放）並自動吸附；拖曳移動（拖曳中可按 R 旋轉）；
    從空孔拖曳到空孔接線（預覽正交路徑）；滑鼠停在孔上高亮整個導通群組並顯示孔位、群組、Net 與佔用狀態；
    點腳位 / 導線 / Net 高亮整個 Net；右鍵選單（Rotate 90°、刪除、導線改色、Fit）；
    滾輪以游標為中心縮放、中鍵 / Space + 拖曳 / 拖曳空白處平移、Fit to Screen、Reset View。
  - Check Circuit：錯誤（紅）/ 警告（黃）直接標在板上，通過時顯示綠色「✓ Circuit Valid」，右側列出所有結果，
    點一項會把畫面移過去。
  - AI 標準佈線：在 Web Worker 計算（可取消）、原始導線淡化、新導線依 Net 優先序逐條描線出現，
    完成後顯示 Standard Routing Complete 與前後統計（Wire Count、Total Length、Bends、Crossings、Overlaps、
    Routing Score）；失敗時列出每個失敗 Net 的原因，電路不變。
  - COMPARE：User Routing 與 AI Standard Routing 並排（可切換上下 / 左右），可套用 AI 佈線或切回手動接線。
  - 右側資訊面板：選取項目的屬性（阻值、LED 顏色、兩腳間距、指撥開關狀態、腳位表）、Nets 清單、檢查結果。
  - 底部狀態列：狀態、元件 / 導線 / Net 數、錯誤與警告、Routing Score、模式、縮放。
  - Undo / Redo（所有編輯與 Auto Route）、儲存 / 另存新檔 / 開啟（瀏覽器專案庫）、匯入 / 匯出 JSON、
    匯出 PNG / SVG、自動儲存、3 個範例電路、快捷鍵說明。

- 測試：
  - `tests/web/store.test.ts`（14 個）：store 的編輯 / Undo、AI 標準佈線生命週期（套用、失敗、取消、
    沒有東西可佈線）、MANUAL / AUTO ROUTE / COMPARE 切換、匯入檔案。
  - `e2e/acceptance.spec.ts`（Playwright，3 個）：用真實滑鼠拖曳走完需求文件第三十四章驗收流程
    （分數 ≥ 90、0 交叉、0 重疊、Undo / Redo）、第三十三章 Test 6 的「No valid routing solution.」、
    旋轉 / 刪除 / Undo 與自動儲存還原。
  - 新增 `tests/web/tsconfig.json`：需要 DOM 型別的測試與核心測試分開檢查。

- `README.md`：功能總覽、快速開始、指令、架構與路線圖。

### 修正

- 範例電路的說明會在載入時顯示；加法器與驗收電路的手動接線故意很亂（用來展示 AI 標準佈線），
  說明中會提醒，避免學生以為工具壞了。提示訊息越長，顯示時間越久。

- 從 COMPARE 按「返回編輯」會把比較畫面誤判成「不是自動佈線」而重新佈線一次（多出一步 Undo）。
  新增 `closeCompare()`，模式切換只依導線本身判斷；Esc 離開比較畫面也改用它。
- 拖曳元件或導線時會選到頁面文字：整個介面停用文字選取（輸入框除外）。
- 開啟右鍵選單時，滑鼠提示會疊在選單後面；拖曳元件時，原位置的選取框會留在原地。
- IC 旋轉 180° 後型號與編號的上下順序顛倒。
- 屬性面板的 Net 數（含單腳 Net）與狀態列不一致，統一只計算兩隻腳以上的 Net。
- 提示訊息依種類調整顯示時間（一般 2.5 秒、錯誤 7 秒）。
- 元件庫太長（20 顆 IC 把其他分類擠到畫面外）：改成兩欄小格子並加上分類快速跳轉。

### 變更

- 元件定義 JSON 新增 `description` 欄位（28 個元件都有中文說明），`parseDefinition` 會驗證其型別。

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
