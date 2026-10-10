# CLAUDE.md

Breadboard Lab：在網頁上的 MB-102 麵包板放 74LS IC、電阻、LED 並接線；「AI 標準佈線」重新算出只走水平 / 垂直、
不重疊、不穿過元件的標準接線；「▶ 模擬」做 74LS 邏輯模擬；多塊麵包板可以貼合成 Board Group。

- 需求：`digitaldesigned.md`（用章節號引用，例如「38.19」）
- 設計規格：`docs/superpowers/specs/`（每個子專案一份；新功能先寫規格再實作）
- 變更紀錄：`CHANGELOG.md`；功能表與路線圖：`README.md`

## 指令

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck    # 四份 tsconfig：核心 / 畫面 / store 測試 / e2e
npm test             # Vitest 單元測試
npm run build
npm run build:single # 單一 HTML 離線版 dist-single/breadboard-lab.html
npm run e2e          # Playwright；雲端容器不能下載瀏覽器，要加 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium
npm run demo         # 終端機 ASCII 預覽佈線前後
npm run publish:site # 建置網站版與離線版，發布到公開 repo kazuto0126/breadboard-lab-site（GitHub Pages）
```

推送前至少跑 `npm run typecheck && npm test`，改到畫面時再跑 e2e。CI（`.github/workflows/ci.yml`）在 PR 與 main 上跑同樣的檢查。

## 架構（依賴方向由上往下）

```text
src/components/       React 畫面，只負責顯示與操作
src/state/            Zustand store：動作經 commit() 進 Undo；佈線計算中、模擬中用 guardEdit() 鎖住結構編輯
src/editor/           編輯邏輯純函式：commands、placement（吸附）、manualWire、boards（多板吸附 / 群組）、fileFormat、geometry
src/workers/          佈線 Web Worker
src/ai/               問 AI：Gemini 連線（第一次發問才動態載入 @google/genai）、錯誤分類
src/core/             核心引擎：breadboard/（版型、孔位命名、lattice）、circuit/（footprint、nets、validate）、
                      routing/（autoRoute、legality、score）、simulation/（models、simulate）
src/data/components/  元件定義 JSON（74ls/、generic/），IC 行為寫在 `logic` 欄位
```

- `tsconfig.json` 不含 DOM 型別，涵蓋 core 與 editor：這兩層不能用瀏覽器 API（佈線在 Worker 裡跑）。
- 編輯動作回傳新的 Circuit，沒變的部分沿用原本的參照；快取與「比較結果是否過期」都靠參照判斷。

## 重要概念

- `GridPoint { boardId, x, y }` 是板內座標：孔與板面 x 1–63、y 1–18，留白 x 0 / 64、y 0 / 19；節點 ID 形如 `b1:12,15`。
- 多塊板共用 0.1 吋全域格子（`core/breadboard/lattice.ts`）：板子位置以 mm 儲存、一律對齊 2.54 mm，用 `latticeOf` / `pointAt` 轉換。
  Board Group 由幾何推導（邊對邊貼合且對齊）；同組兩板之間的接縫留白可以走線，其他留白不行。
- 貼在一起不代表導通：導通只來自同一個導通群組、元件內部導通與導線端點（導線中段不導電）。
- 自動佈線每個群組一張格子；不移動元件，只保留使用者接線所定義的連接，結果一定經過 `checkRoutingLegality`。

## 慣例

- 文件、介面文字、程式註解用繁體中文；commit message 用英文（`feat(editor): …`、`fix: …`、`docs: …`）。
- 每次修改都要 commit 並 push 到 GitHub，並在 `CHANGELOG.md` 最上面的區段用繁體中文記錄。
- 測試放 `tests/`（對應 src 的結構）；需要 DOM 型別的 store 測試放 `tests/web/`；e2e 用真實滑鼠操作。
- 測試與範例電路用 `src/editor/builder.ts` 建立（`comp`、`wire`、`board`、`holeOn`、`latticeWire`）。

## 工作流程（避免進度遺失）

雲端容器閒置後會被回收，沒推送的修改會跟著消失；GitHub 才是唯一可靠的紀錄。

- 開始工作前，先看對話開始時自動顯示的進度摘要（`docs/PROGRESS.md` 與各分支最新的 commit）；目前分支落後 origin 就先 `git pull`。
- 每個任務用自己的分支；第一個 commit 推上去後就開 draft PR，描述裡放待辦清單，做完一項勾一項。
- 每完成一個小步驟（測試通過）就 commit 並推送，不要累積大量修改才推。
- 推送前更新 `docs/PROGRESS.md`（進行中、下一步、卡住的地方）；做完的事記在 `CHANGELOG.md`。
- `.claude/hooks/checkpoint.sh` 會在每次回覆結束或因用量上限中斷時，把工作分支上還沒提交或推送的修改存成
  `wip: checkpoint` commit 推上去（不會動 main）。這只是保險，平常仍要自己寫有意義的 commit。
- 要知道其他對話做到哪裡：`git fetch --all`，再看 `docs/PROGRESS.md`、`git log origin/<分支>` 與 PR。

## 目前狀態

見 `docs/PROGRESS.md`。主線是這套程式碼；`feat/core-engine` 分支是另一套子專案 2 實作（`src/app/`），只拿來參考、
把它獨有的功能分批移植過來，不要在上面開發。
