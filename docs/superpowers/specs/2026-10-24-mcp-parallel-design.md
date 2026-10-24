# MCP 轉換也同時跑好幾種擺法（子專案 42）設計規格

- 日期：2026-10-24
- 狀態：已實作（分支 `feat/mcp-parallel`）
- 出處：子專案 41 只讓網頁同時跑，MCP 照舊一次一件；使用者 2026-10-24：「那等等做這個」。

---

## 1. 目標

MCP 的 `logic_to_breadboard` 和網頁一樣，同時試好幾種擺法；結果（線數、總長）不變，時間變短。

## 2. 做法

- **佈線執行緒**（`scripts/mcp-pool.ts`）：用 Node 的 worker_threads，執行緒數是核心數 − 1、最多 4 個；只有 1 個時不用執行緒（照舊一次一件）。
  執行緒第一次轉換時才建立，之後留著給下一次（閒著時不會讓伺服器關不掉）；執行緒意外結束時下一次重新建立。
  環境變數 `BREADBOARD_LAB_MCP_THREADS` 可以指定執行緒數（我加的，給測試減少負擔用）。
- **執行緒載入的程式**：就是 `mcp-pool.ts` 所在的模組。原始碼版是 `scripts/mcp-pool.ts`（繼承 `--import tsx`）；
  打包版只有一個檔案，執行緒載入整個 `breadboard-lab-mcp.mjs`，所以伺服器只在主執行緒連上 AI 工具（stdio），
  執行緒的輸出也不轉到伺服器的 stdout（那是和 AI 工具溝通用的）。
- **排程**：和網頁一樣用 `convertAndRouteParallel`（子專案 41 的 `convertSteps`），每件分到的時間和一次一件時一樣。
  `src/mcp/tools.ts` 加上 `logicToBreadboardParallel`；原本的 `logicToBreadboard`（一次一件）留給測試與只有 1 個核心的電腦。

## 3. 不做

- 其他 MCP 工具（`auto_route` 只佈線一次，不需要）。

## 4. 驗收

- 執行緒跑的結果和主執行緒一樣（同一個電路、同樣的設定），一批工作真的分到好幾個執行緒；從之前的結果接著搬也一樣。
- 打包版的 `logic_to_breadboard` 正常（轉完再呼叫其他工具也正常，表示 stdout 沒有被干擾）。
- 量測：每個電路線數、總長和一次一件時一樣，時間變短。
