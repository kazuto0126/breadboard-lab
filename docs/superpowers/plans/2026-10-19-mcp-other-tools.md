# 給其他 AI 工具用的 MCP 與題目工具（子專案 33）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 MCP 伺服器打包成一個檔案給任何 MCP 用戶端使用（指定工作資料夾），並加上 `list_files` 與四個真值表題目工具。

**Architecture:** 工具邏輯維持在 `src/mcp/`（純函式、不碰 Node API）；檔案系統的事（工作資料夾、掃描電路檔）留在 `scripts/`。
用專案已有的 Vite 以 SSR 模式把 `scripts/mcp-server.ts` 打包成 `dist-mcp/breadboard-lab-mcp.mjs`；發布程式把它和設定說明頁放到網站 repo。

**Tech Stack:** TypeScript、`@modelcontextprotocol/sdk` 1.31.0、zod 4.6.5、Vite 8（rolldown）、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-19-mcp-other-tools-design.md`

## Global Constraints

- 只能讀寫工作資料夾（含子資料夾）裡的 `.json` 檔；只能蓋掉電路檔（沿用 `insideProject` 的規則與訊息）。
- 現有 14 個工具的名稱與參數不變；`.mcp.json`、`npm run mcp` 照常可用（原始碼版版本號 `1.0.0`）。
- 打包檔目標 Node.js 20 以上；不新增建置工具，不新增 npm 依賴。
- 網站 repo 只放建好的檔案；打包檔與說明頁裡出現作者 Email（`git log` 的作者 / 提交者 Email、`git config user.email`）就停止發布。
- 回覆、說明頁、註解用繁體中文；commit message 英文。
- `src/mcp/` 的檔案不能用 Node API（`tsconfig.json` 的規則：工具是純函式）。

## Review Focus

- `--folder` 是含空白、反斜線的 Windows 路徑（例如 `C:\Users\me\My Circuits`）→ 正常使用（Task 1、Task 4 的測試釘住）。
- 打包檔放在沒有 `node_modules` 的資料夾執行 → 仍能啟動（Task 4 把檔案複製到暫存資料夾再跑）。
- 只有題目、沒有邏輯圖的檔案經過別的工具改寫 → 題目還在（Task 1）。
- `task_set` 的列號超出範圍、名稱重複、顯示器的值個數不對、三種用法混用 → 說明原因、檔案不變（Task 2、Task 3）。
- 發布時打包檔裡有作者 Email → 停止發布（Task 6）。

---

### Task 1: 工作資料夾、`list_files`、存檔不丟題目

**Files:**
- Modify: `scripts/mcp-paths.ts`（加 `folderFromArgs`）
- Create: `scripts/mcp-files.ts`（掃描電路檔）
- Modify: `src/mcp/tools.ts`（加 `describeLabFile`）
- Modify: `scripts/mcp-server.ts`（ROOT 改成工作資料夾、存檔規則、註冊 `list_files`、instructions 寫出資料夾）
- Test: `tests/mcp/paths.test.ts`、`tests/mcp/files.test.ts`（新）、`tests/mcp/server.test.ts`

**Interfaces:**
- Produces: `folderFromArgs(argv: string[], cwd: string): { ok: true; folder: string } | { ok: false; error: string }` —
  `--folder <路徑>` 或 `--folder=<路徑>`，相對路徑從 cwd 算；沒給時回傳 cwd；資料夾不存在或不是資料夾時
  `error: 找不到工作資料夾 <路徑>`。（這個函式會用 `existsSync` / `statSync`，所以在 `scripts/`。）
- Produces: `listCircuitFiles(folder: string): Array<{ path: string; lab: LabFile }>` — `path` 是相對路徑（`/` 分隔），
  照路徑排序；最多往下 3 層（資料夾本身算第 0 層，所以 `a/b/c/x.json` 可以、`a/b/c/d/x.json` 不行）、
  略過 `node_modules`、`.git` 與 `.` 開頭的資料夾、最多 100 個；讀不了或不是電路檔的 `.json` 不列。
  讀檔共用伺服器的 `load`：把 `load` 從 `mcp-server.ts` 搬到 `mcp-files.ts` 並 export（`loadLabFile(abs, shown)`）。
- Produces: `describeLabFile(lab: LabFile): string`（`src/mcp/tools.ts`）— 例如 `MB-102，元件 5 個，有邏輯圖，有題目（A B C → X）`。

- [ ] **Step 1: 寫失敗的測試**
  - `paths.test.ts`：`folderFromArgs(['--folder', 'sub dir'], tmp)` 回傳 `join(tmp, 'sub dir')`（先建立含空白的資料夾）；
    `['--folder=' + abs]` 可以；`[]` 回傳 cwd；不存在的資料夾 → `ok: false`、訊息含「找不到工作資料夾」。
  - `files.test.ts`（在 `os.tmpdir()` 下建暫存資料夾）：放 `a.json`（電路檔）、`notes.json`（`{}`）、`node_modules/x.json`、
    `.hidden/y.json`、`a/b/c/ok.json`、`a/b/c/d/deep.json` → 只列出 `a.json` 與 `a/b/c/ok.json`；`describeLabFile` 的文字含「有題目」。
  - `server.test.ts`：工具清單變成 15 個（加 `list_files`）；用 `writeFileSync` 寫一個只有題目的電路檔（`logic: { version: 1, nodes: [], wires: [], task }`），
    呼叫 `place_part` 後再讀檔，`logic.task` 還在；`list_files` 的回覆列出 `tests/.tmp-mcp/xor.json`。
    （伺服器仍用 `cwd: root` 啟動，不加 `--folder`，確認預設是目前資料夾。）
- [ ] **Step 2: 跑測試確認失敗** — `npx vitest run tests/mcp` → 新測試 FAIL（函式不存在 / 工具數量不符 / 題目遺失）。
- [ ] **Step 3: 實作** 上面三個函式；`mcp-server.ts`：`ROOT` 改成 `folderFromArgs(process.argv.slice(2), process.cwd())`，
  失敗時 `console.error(error)` 並 `process.exit(1)`；存檔改成 `toCircuitFile(..., lab.logic)`（由 `toCircuitFile` 決定要不要存）；
  instructions 第一行後加「工作資料夾：<完整路徑>；file 參數寫相對於它的路徑。」；註冊 `list_files`（沒有參數；
  沒有檔案時回覆「工作資料夾裡還沒有電路檔；用 new_circuit 建立」）。錯誤訊息「只能讀寫專案資料夾裡的檔案」改成「只能讀寫工作資料夾裡的檔案」
  （`insideProject` 與它的測試一起改）。
- [ ] **Step 4: 跑測試** — `npx vitest run tests/mcp` → PASS。
- [ ] **Step 5: Commit** — `feat(mcp): working folder, list_files, keep a task-only diagram when saving (sub-project 33)`

### Task 2: 題目工具的純函式

**Files:**
- Create: `src/mcp/taskTools.ts`
- Test: `tests/mcp/taskTools.test.ts`

**Interfaces:**
- Consumes: `LabFile`、`ToolResult`（`src/mcp/tools.ts`，把 `fail` 改成 export）；`createTask`、`setColumn`、`setOutputKind`、
  `setDisplayColumn`、`taskFromDiagram`、`withTask`、`compareDiagramToTask`、`rowBits`、`isDisplayOutput`（`src/logic/task.ts`）；
  `designFromTask`、`termsOfTask`、`usesPos`（`src/logic/design.ts`）；`sopText`、`posText`（`src/logic/minimize.ts`）；
  `checkAgainstTask`（`src/logic/diagramCheck.ts`）。
- Produces（全部 `(f: LabFile, args) => ToolResult`）：
  - `taskSet(f, args: { inputs?: string[]; outputs?: TaskOutputArg[]; from_diagram?: boolean; clear?: boolean })`
  - `type TaskOutputArg = { name: string; ones?: number[]; dont_care?: number[]; display?: boolean; values?: Array<number | 'X'> }`
  - `taskShow(f, args: { form?: 'sop' | 'pos' })`
  - `taskToDiagram(f, args: { form?: 'sop' | 'pos' | 'nand' | 'nor' })`
  - `taskCheck(f)`

- [ ] **Step 1: 寫失敗的測試**（`newLabFile('t', 'MB102')` 起手）
  - `taskSet` 多數決：`inputs ['A','B','C']`、`outputs [{ name: 'X', ones: [3,5,6,7] }]` → `file.logic.task.rows` 第 3 列是 `[1]`、第 0 列 `[0]`；
    回覆含「3 個輸入、1 個輸出、8 列」。
  - 顯示器：`outputs [{ name: 'S1', display: true, values: [0..9, 'X'×6] }]`（4 個輸入）→ `task.displays` 是 `['S1']`。
  - 錯誤（`error: true`、沒有 `file`）：三種用法混用 → 「inputs / outputs、from_diagram、clear 只能選一種」；
    `ones: [8]`（3 個輸入）→ 訊息和 `setColumn` 一樣；名稱重複 → `createTask` 的訊息；顯示器 `values` 個數不對 → 「要寫 16 個數字（有 3 個）」；
    一般輸出寫了 `values` 或顯示器寫了 `ones` → 「X 是一般輸出，用 ones / dont_care」 / 「S1 是顯示器，用 values」。
  - `from_diagram`：檔案的邏輯圖是 `majorityDiagram()`（`src/logic/examples`）→ 題目 `ones` 是 3、5、6、7；沒有邏輯圖 → 失敗並說明。
  - `clear`：題目拿掉、邏輯圖不變；本來就沒有題目 → 回覆「檔案裡沒有題目」（不算錯誤、沒有 `file`）。
  - `taskShow`：表頭 `A B C | X`、8 列、`X = AB + AC + BC`；`form: 'pos'` → `X = (A + B)(A + C)(B + C)`；沒有題目 → 失敗「檔案裡還沒有題目；用 task_set 寫入」。
    顯示器的布林式一欄一行（`S1.A = …`）。
  - `taskToDiagram`：多數決 `nand` → `file.logic.nodes` 只有 INPUT、NAND、OUTPUT 種類；`file.logic.task` 保留；回覆含「和題目比對：8 種輸入組合全部一致」；
    原本有邏輯圖時回覆含「取代了原本的邏輯圖（8 個元件）」。
  - `taskCheck`：題目 + `designFromTask` 的邏輯圖 → 「邏輯圖：…全部一致」，麵包板空的 → 「麵包板：還沒有元件」；
    把題目第 0 列改成 1 → 列出「A B C = 0 0 0：題目 X = 1，邏輯圖 X = 0」；超過 10 列不一致只列 10 列再加「還有 N 列」。
    麵包板部分用 `logic_to_breadboard` 之後的電路（可以在測試裡直接用 `toBreadboard(...).circuit`）→「麵包板：…全部一致」。
- [ ] **Step 2: 跑測試確認失敗** — `npx vitest run tests/mcp/taskTools.test.ts` → FAIL（模組不存在）。
- [ ] **Step 3: 實作** `src/mcp/taskTools.ts`：每個輸出依序套用 `setOutputKind` / `setColumn` / `setDisplayColumn`（不另寫驗證）；
  `taskShow` 的值：一般輸出 0 / 1 / X，顯示器數字或 X；比對結果的句子照網頁 `TaskTab` / `DiagramCheckCard` 的寫法。
- [ ] **Step 4: 跑測試** → PASS。
- [ ] **Step 5: Commit** — `feat(mcp): truth-table task tools (sub-project 33)`

### Task 3: 在伺服器註冊題目工具

**Files:**
- Modify: `scripts/mcp-server.ts`
- Test: `tests/mcp/server.test.ts`

**Interfaces:**
- Consumes: Task 2 的四個函式。工具名稱 `task_set`、`task_show`、`task_to_diagram`、`task_check`，參數名稱與 Task 2 相同（snake_case）。

- [ ] **Step 1: 寫失敗的測試** — 工具清單 19 個；在 `tests/.tmp-mcp/task.json`：`new_circuit` → `task_set`（多數決）→ `task_to_diagram`（`form: 'sop'`）
  → `logic_to_breadboard` → `task_check` 回覆含「邏輯圖：」與「麵包板：」且都「全部一致」；`task_set` 混用三種用法 → `isError`，檔案內容不變。
- [ ] **Step 2: 跑測試確認失敗** → FAIL（工具不存在）。
- [ ] **Step 3: 實作** 註冊四個工具（zod schema：`outputs` 是物件陣列，`values` 元素 `z.union([z.number().int(), z.literal('X')])`），
  每個參數寫繁體中文說明；instructions 加一行「從真值表題目開始：task_set → task_show → task_to_diagram → logic_to_breadboard → task_check。」
- [ ] **Step 4: 跑測試** → PASS。
- [ ] **Step 5: Commit** — `feat(mcp): register the task tools (sub-project 33)`

### Task 4: 打包成一個檔案

**Files:**
- Create: `vite.mcp.config.ts`
- Modify: `package.json`（`"build:mcp": "vite build --config vite.mcp.config.ts"`）、`tsconfig.json`（include 加 `vite.mcp.config.ts`）、`.gitignore`（`dist-mcp`）
- Modify: `scripts/mcp-server.ts`（版本號、`--version`）
- Test: `tests/mcp/bundle.test.ts`（新）

**Interfaces:**
- Produces: `dist-mcp/breadboard-lab-mcp.mjs`；版本號 `process.env.BREADBOARD_LAB_MCP_VERSION ?? '1.0.0'`，打包時用 Vite `define`
  換成建置日期 `YYYY.M.D`（例如 `2026.10.19`）；檔頭 banner：`// Breadboard Lab MCP 伺服器 <版本>（commit <短雜湊>）— https://kazuto0126.github.io/breadboard-lab-site/mcp/`。
- `node breadboard-lab-mcp.mjs --version` 印出版本號後結束（在讀資料夾之前處理）。

- [ ] **Step 1: 寫失敗的測試**（`beforeAll` 用 `execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.mcp.config.ts'])`，
  再把打包檔複製到 `mkdtemp(join(tmpdir(), 'bl mcp '))`（名稱含空白、在原始碼資料夾外、沒有 `node_modules`）；逾時 120 秒）
  - `--version` 印出 `/^\d{4}\.\d{1,2}\.\d{1,2}$/`。
  - `--folder <不存在>` → 結束碼不是 0，stderr 含「找不到工作資料夾」。
  - 用 `StdioClientTransport({ command: process.execPath, args: [copied, '--folder', work] })` 連線（`cwd` 設成別的資料夾，例如 `tmpdir()`）：
    19 個工具；`new_circuit { file: 'maj.json' }` → 檔案出現在 `work` 裡；`task_set` → `task_to_diagram` → `task_check` 全部一致；
    `circuit_summary { file: '../x.json' }` → 錯誤「只能讀寫工作資料夾裡的檔案」。
  - 打包檔內容不含 `from "zod"`、`from "@modelcontextprotocol` 這種外部 import（只允許 `node:` 開頭）。
- [ ] **Step 2: 跑測試確認失敗** — `npx vitest run tests/mcp/bundle.test.ts` → FAIL（設定檔不存在）。
- [ ] **Step 3: 實作** `vite.mcp.config.ts`：`build.ssr = 'scripts/mcp-server.ts'`、`outDir: 'dist-mcp'`、`target: 'node20'`、
  輸出檔名 `breadboard-lab-mcp.mjs`、`ssr.noExternal: true`、不用網頁的 plugins；`define` 注入版本號；banner 的 commit 用 `git rev-parse --short HEAD`
  （拿不到時寫 `unknown`）。
- [ ] **Step 4: 跑測試** → PASS；`npm run build:mcp` 成功。
- [ ] **Step 5: Commit** — `build(mcp): bundle the server into one file (sub-project 33)`

### Task 5: 設定說明頁與網頁的連結

**Files:**
- Create: `public/mcp/index.html`（網站建置時複製到 `dist/mcp/index.html`；開發伺服器的 `/mcp/` 也看得到）
- Modify: `src/components/Toolbar/Toolbar.tsx`（「說明」選單加「給 AI 工具用（MCP）」，`window.open(MCP_GUIDE_URL, '_blank', 'noopener')`；
  `MCP_GUIDE_URL = 'https://kazuto0126.github.io/breadboard-lab-site/mcp/'`）
- Test: `e2e/mcp-guide.spec.ts`（新）、`tests/mcp/guide.test.ts`（新）

- [ ] **Step 1: 查證** Cursor、VS Code（Copilot agent 模式）、Gemini CLI、Claude Desktop、Claude Code 目前的官方文件：MCP 設定檔的位置、格式、
  有沒有 `cwd` 或工作區變數（VS Code 的 `${workspaceFolder}`）。記下查證日期與網址（寫在頁面裡）。
- [ ] **Step 2: 寫失敗的測試**
  - `guide.test.ts`：讀 `public/mcp/index.html`，含 `lang="zh-Hant"`、`breadboard-lab-mcp.mjs` 的下載連結、五個工具的名稱、`--folder`、`node --version`；
    每段設定（`<pre>` 裡的 JSON 範例）都能 `JSON.parse`（把路徑佔位字換成真的字串後）。
  - `mcp-guide.spec.ts`：攔截 `https://kazuto0126.github.io/**`（`route.fulfill` 回一個簡單頁面）；點「說明」→「給 AI 工具用（MCP）」→ 新分頁網址是 `MCP_GUIDE_URL`。
- [ ] **Step 3: 跑測試確認失敗** → FAIL。
- [ ] **Step 4: 實作** 說明頁（內容照規格第 6 節的 8 點；深色、`max-width` 置中、手機可讀；不載入外部資源）與選單項目。
- [ ] **Step 5: 跑測試** — `npx vitest run tests/mcp/guide.test.ts`、`npx playwright test e2e/mcp-guide.spec.ts` → PASS；
  在開發伺服器開 `/mcp/` 看一次版面（窄螢幕也看）。
- [ ] **Step 6: Commit** — `feat: MCP setup guide page and help menu link (sub-project 33)`

### Task 6: 發布

**Files:**
- Create: `scripts/email-check.ts`
- Modify: `scripts/publish-site.ts`
- Test: `tests/scripts/emailCheck.test.ts`（新）

**Interfaces:**
- Produces: `findEmails(text: string, emails: string[]): string[]`（不分大小寫，回傳出現的 Email，去重）；
  `authorEmails(): string[]`（`git log --format=%ae%n%ce` 與 `git config user.email`，去重、去空白）。

- [ ] **Step 1: 寫失敗的測試** — `findEmails('a Foo@Example.com b', ['foo@example.com'])` → `['foo@example.com']`；找不到 → `[]`；空清單 → `[]`。
- [ ] **Step 2: 跑測試確認失敗** → FAIL。
- [ ] **Step 3: 實作** 函式；`publish-site.ts`：建置網站後執行 `npm run build:mcp`，把 `dist-mcp/breadboard-lab-mcp.mjs` 複製到網站的 `mcp/`
  （`dist/mcp/index.html` 已由 Vite 複製）；複製前對打包檔、`dist/mcp/index.html` 跑 `findEmails(..., authorEmails())`，
  有結果就 `console.error` 哪個檔案、`process.exit(1)`；網站 README 加打包檔與說明頁的網址。
- [ ] **Step 4: 跑測試** → PASS；在本機跑一次「只建置與檢查、不推送」的確認：用 `node -e` 呼叫 `findEmails` 檢查目前的打包檔（不執行 publish）。
- [ ] **Step 5: Commit** — `build: publish the MCP bundle and guide with the site, refuse author emails (sub-project 33)`

### Task 7: 真的在 AI 工具上試、文件、全部檢查

- [ ] **Step 1: 試用** — 找本機能用的 MCP 用戶端（Claude Code 命令列、VS Code、Antigravity…）。能用命令列時用暫時的設定檔
  （例如 `claude -p --mcp-config <暫存檔> --strict-mcp-config`），不改使用者的設定；說「出一題多數決、產生邏輯圖、轉成麵包板、和題目比對」，
  確認檔案出現在 `--folder` 的資料夾。找不到可以不改設定就試的用戶端時，記成 Ruling，最後請使用者在自己的工具上試。
- [ ] **Step 2: 文件** — `CHANGELOG.md` 新區段「子專案 33」；`README.md`（MCP 段落改寫：網站下載與設定說明頁；路線圖第 33 列）；
  `CLAUDE.md` 指令加 `npm run build:mcp`；`docs/PROGRESS.md`；`docs/ideas/backlog.md` 拿掉這一項（保留「用連結開啟電路」）；
  `docs/ideas/2026-10-16-mcp-interface.md` 狀態；規格狀態改「已完成」。
- [ ] **Step 3: 全部檢查** — `npm run typecheck`、`npm test`、`npm run build`、`npm run build:single`、`npm run build:mcp`、完整 e2e（跑的時候不改檔案）。
- [ ] **Step 4: Commit、推送、開 PR**（沒有 attribution），用 ccd_pr 綁定。
