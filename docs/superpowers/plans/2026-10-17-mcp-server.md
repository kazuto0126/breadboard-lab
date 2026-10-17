# 給 Claude Code 用的 MCP 伺服器 Implementation Plan

> 執行方式：在這個對話內依序實作（executing-plans），每個任務先寫測試、看它失敗、再實作。

**Goal:** `scripts/mcp-server.ts`（stdio MCP 伺服器）＋ `src/mcp/tools.ts`（14 個工具的純函式）＋ `.mcp.json`。

**Spec:** `docs/superpowers/specs/2026-10-17-mcp-server-design.md`

**Tech:** `@modelcontextprotocol/sdk` 1.31.0（`McpServer.registerTool(name, { title, description, inputSchema: zod shape }, cb)`、
`StdioServerTransport`；測試用 `Client` + `StdioClientTransport({ command, args, cwd })`），`zod` 4.6.5。
兩個版本都選上架超過兩週的版本、固定版本號。

## Global Constraints

- `src/mcp/` 不能用 Node API（`tsconfig.web.json` 也會檢查 `src/`）；讀寫檔、路徑檢查放在 `scripts/`。
- `src/mcp/` 不能被網頁的程式 import（不打包進網頁）。
- 回覆用繁體中文；孔位用 `holeLabel` 的寫法。

## Review Focus

1. 專案資料夾外的路徑（`..`、其他磁碟、符號連結以外的絕對路徑）一律拒絕。
2. 工具失敗時不能寫檔（檔案維持原樣）。
3. 多塊麵包板時孔位沒有板子 ID → 說明要怎麼寫，不能猜。
4. `new_circuit` 不能蓋掉已存在的檔案（除非 `overwrite`）。
5. `simulate` 的開關設定不能寫回檔案。

---

### Task 1：讀取與檢查工具（`circuit_summary`、`check_circuit`、`list_parts`）與孔位解析
### Task 2：編輯工具（`new_circuit`、`place_part`、`add_wire`、`set_part`、`remove`）
### Task 3：計算工具（`auto_route`、`simulate`）
### Task 4：邏輯圖工具（`logic_set` + 自動排版、`logic_truth_table`、`logic_to_breadboard`、`check_against_diagram`）
### Task 5：伺服器（`scripts/mcp-server.ts`、`scripts/mcp-paths.ts`、`.mcp.json`、`npm run mcp`）＋ 路徑測試 ＋ 整合測試
### Task 6：文件（README、構想文件、backlog、CHANGELOG、PROGRESS）

每個任務的測試寫在 `tests/mcp/`；工具測試用 `tests/fixtures/handWired.ts` 與 `src/editor/examples.ts` 的電路。
