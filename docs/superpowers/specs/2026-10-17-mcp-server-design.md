# 給 Claude Code 用的 MCP 伺服器（子專案 23）設計規格

- 日期：2026-10-17
- 狀態：規格待確認（使用者 2026-10-17 在對話中同意設計：先給 Claude Code 用、計算與編輯工具都做）
- 前一份：`docs/ideas/2026-10-16-mcp-interface.md`（構想與評估）

---

## 0. 目的

在這個專案資料夾裡用 Claude Code 時，Claude 可以用工具直接檢查、編輯、佈線、模擬電路檔，以及把邏輯圖轉成麵包板並比對，
不用自己算孔位座標、也不用一步一步在網頁上點。做好的電路檔在網頁「檔案 → 匯入 JSON」打開。

## 1. 決定

| 項目 | 決定 |
|---|---|
| 給誰用 | 第一版只給這個專案資料夾裡的 Claude Code；Claude Desktop 等其他工具列為未開發項目 |
| 怎麼啟動 | 專案根目錄的 `.mcp.json`：`node --import tsx scripts/mcp-server.ts`（stdio）；Claude Code 第一次使用時會問要不要允許 |
| 狀態 | 不記狀態：每個工具「讀檔 → 處理 → 寫回」；檔案格式和網頁「匯出 JSON」相同（`CircuitFile`，含邏輯圖） |
| 路徑 | 只接受專案資料夾裡的路徑（相對或絕對都可以）；資料夾外的一律拒絕。不連網路 |
| 回覆 | 繁體中文、先講結論；孔位寫法和網頁一樣（F10、T+3、多塊板時 b2:A12、EIC-1106 時 1-F10） |
| 新增套件 | `@modelcontextprotocol/sdk`、`zod`（devDependencies，不會打包進網頁）；版本照安裝時 npm 上的最新穩定版 |
| 不做 | Claude Desktop、發布到 npm、操作已經開著的網頁、用連結開啟電路 |

## 2. 檔案

- `src/mcp/tools.ts`：所有工具的邏輯，純函式（不讀寫檔、不碰 Node API）：`(file: LabFile, args) → { file?: LabFile; text: string }`。
  `LabFile = { name: string; circuit: Circuit; logic: LogicDiagram }`。核心 `tsconfig.json` 的 include 加上 `src/mcp`。
- `scripts/mcp-server.ts`：MCP 伺服器。註冊工具（參數用 zod 描述）、檢查路徑、讀檔（`parseCircuitData`）、呼叫 `tools.ts`、寫檔（`toCircuitFile`）。
- `.mcp.json`：`{ "mcpServers": { "breadboard-lab": { "command": "node", "args": ["--import", "tsx", "scripts/mcp-server.ts"] } } }`。
- `package.json`：`"mcp": "node --import tsx scripts/mcp-server.ts"`（手動啟動、除錯用）。

## 3. 工具

所有工具第一個參數都是 `file`（電路檔路徑）。會改檔案的工具，成功時寫回並在回覆最後加一句「已存到 <檔名>；在網頁用『檔案 → 匯入 JSON』打開」。
失敗時不寫檔，回覆原因（MCP 的 `isError`）。

| 工具 | 參數 | 做什麼 |
|---|---|---|
| `new_circuit` | `file`、`board?`（`MB102` 預設 / `EIC1106`）、`overwrite?` | 建新的電路檔；檔案已存在且沒有 `overwrite` 時拒絕 |
| `circuit_summary` | `file` | 現在送給 Gemini 的電路摘要（`circuitBrief`）：元件、每隻腳的孔位、導線、Net、沒接的腳 |
| `check_circuit` | `file` | `validateCircuit` 的錯誤與警告，每一項附離線解說的「為什麼」與「建議的改法」（`explainIssue`，孔位寫成名稱） |
| `list_parts` | `query?` | 元件庫：名稱（`74LS00`、`resistor-220`、`led-red`、`dipsw-4`…）、說明、腳位（腳號與腳名）；有 `query` 時只列符合的 |
| `place_part` | `file`、`part`、`hole?`、`rotation?`（0 / 90 / 180 / 270）、`id?` | 放元件：`hole` 是第 1 腳的孔；不能放時說原因（`checkPlacement`）；沒給 `hole` 時自動找空位（`findPlacement`，從板子中央附近找）。回覆新元件的 ID 與每隻腳的孔位 |
| `add_wire` | `file`、`from`、`to`、`color?` | 兩孔之間的直線導線；不合法時回覆 `straightProblemText` 的說明；顏色預設和網頁一樣（接 + 軌紅、− 軌黑） |
| `set_part` | `file`、`id`、`labels?`、`resistance?`、`color?`、`switches?` | 改名稱（開關每個位置一個、LED 與顯示器一個）、電阻值、LED 顏色、開關 ON / OFF（`true` = ON） |
| `remove` | `file`、`id` | 刪除元件或導線（依 ID） |
| `auto_route` | `file`、`move_ics?`、`apply?`（預設 true） | AI 標準佈線（`autoRoute` / `autoPlaceAndRoute`）；`apply` 時寫回。回覆「這次佈線」的說明（`routingSummaryText`）與接不通的原因 |
| `simulate` | `file`、`switches?`（`{ "SW1": [true, false, …] }`）、`pressed?`（按著的按鈕 ID） | 模擬到穩定：亮的 LED、7 段顯示器的數字、沒供電的 IC、衝突的 Net；`switches` 只在這次模擬用，不寫回 |
| `logic_set` | `file`、`diagram` | 寫入邏輯圖（`parseLogicDiagram` 檢查）；節點沒有 `x`、`y` 時自動排版（第 4 節） |
| `logic_truth_table` | `file` | 邏輯圖的真值表與檢查結果（`checkDiagram`） |
| `logic_to_breadboard` | `file`、`switch_to?`（`vcc` / `gnd`）、`board?`、`gates?`、`pulls?` | 轉成麵包板（取代電路）→ AI 佈線（可移動 IC；MB-102 排不完時改用 EIC-1106，和網頁一樣）→ 依名稱比對；寫回並回覆零件清單、佈線說明、比對結果 |
| `check_against_diagram` | `file` | 依名稱和邏輯圖比對（`checkAgainstDiagram`）：一致、不一致的列、或還不能比對的原因 |

- 孔位解析：`b1:F10` 這種有板子 ID 的寫法任何時候都可以；只有一塊板時可以省略 ID。EIC-1106 用 `1-F10`、`P2+12`。
- 元件 ID 依網頁規則自動編號（U1、R1、D1、SW1…）；`place_part` 給了 `id` 且沒重複時用它。

## 4. 邏輯圖自動排版（`logic_set`）

- 只排沒有 `x`、`y` 的節點：依拓撲深度分欄（輸入端與常數第 0 欄，每多一級閘往右 10 格），同一欄由上往下排，間隔為節點高度 + 1 格；
  輸出端與顯示器放在最右一欄。已經有位置的節點不動；排好後仍和別的節點重疊時，往下找空位。

## 5. 測試

- 單元（`tests/mcp/tools.test.ts`）：每個工具的成功與失敗情況（放不下的位置與原因、自動找空位、不合法的導線、改名稱與開關、刪除、
  佈線與說明、模擬結果、邏輯圖自動排版與檢查、轉換 + 佈線 + 比對一致、比對的各種結果）；從零做出一個 XOR 電路（放 IC、開關、LED，接線，佈線，模擬）。
- 路徑檢查（`tests/mcp/paths.test.ts`）：專案資料夾裡的相對 / 絕對路徑可以，`..` 跳出去與其他磁碟拒絕。
- 整合（`tests/mcp/server.test.ts`）：用 SDK 的用戶端啟動 `scripts/mcp-server.ts`，列出 13 個工具，對暫存檔呼叫 `new_circuit`、`place_part`、`circuit_summary`。

## 6. 文件

- README：「在 Claude Code 裡使用（MCP）」：怎麼啟用、工具一覽、例子。
- `docs/ideas/2026-10-16-mcp-interface.md` 狀態改成「第一版（Claude Code）已在子專案 23 完成」。
- `docs/ideas/backlog.md` 加上：Claude Desktop 等其他 AI 工具的接口（要打包或發布）、用連結開啟電路。
