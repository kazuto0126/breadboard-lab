/**
 * 規格（2026-10-17 mcp-server）：Breadboard Lab 的 MCP 伺服器（stdio）。
 * 原始碼版：node --import tsx scripts/mcp-server.ts（專案根目錄的 .mcp.json 已經設定好，給 Claude Code 用）。
 * 子專案 33（規格 2026-10-19 mcp-other-tools）：也打包成一個檔案（npm run build:mcp → dist-mcp/breadboard-lab-mcp.mjs），
 * 給 Cursor、VS Code、Gemini CLI、Claude Desktop 等用；--folder 指定工作資料夾（沒給就是目前資料夾）。
 * 工具的邏輯在 src/mcp/（純函式）；這裡只負責路徑檢查、讀檔、寫檔。
 */
import { existsSync, writeFileSync } from 'node:fs';
import { basename, relative, sep } from 'node:path';
import { isMainThread } from 'node:worker_threads';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { toCircuitFile } from '../src/editor/fileFormat';
import * as taskTools from '../src/mcp/taskTools';
import * as tools from '../src/mcp/tools';
import { listCircuitFiles, loadLabFile } from './mcp-files';
import { createRoutingPool, poolSize } from './mcp-pool';
import { folderFromArgs, insideProject } from './mcp-paths';

/** 版本號：打包時換成建置的日期（vite.mcp.config.ts），原始碼版是 1.0.0。 */
const VERSION = process.env.BREADBOARD_LAB_MCP_VERSION ?? '1.0.0';
if (process.argv.includes('--version')) {
  console.log(VERSION);
  process.exit(0);
}

const where0 = folderFromArgs(process.argv.slice(2), process.cwd());
if (!where0.ok) {
  console.error(where0.error);
  process.exit(1);
}
/** 工作資料夾：只能讀寫這裡面的 .json 檔。 */
const ROOT = where0.folder;
const shown = (abs: string) => relative(ROOT, abs).split(sep).join('/');

type Reply = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
const reply = (text: string, isError = false): Reply => ({ content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) });

const load = (abs: string) => loadLabFile(abs, shown(abs));

/** 子專案 33：邏輯圖沒有節點但有題目或便條時也要存（由 toCircuitFile 決定）。 */
function save(abs: string, lab: tools.LabFile): void {
  writeFileSync(abs, `${JSON.stringify(toCircuitFile(lab.circuit, lab.name, new Date(), undefined, lab.logic), null, 2)}\n`, 'utf8');
}

/** 讀檔 → 執行工具 → 有新檔案時寫回。失敗時不寫檔。 */
function withFile(file: string, run: (lab: tools.LabFile) => tools.ToolResult): Reply {
  const where = insideProject(ROOT, file);
  if (!where.ok) return reply(where.error, true);
  const lab = load(where.path);
  if (typeof lab === 'string') return reply(lab, true);
  try {
    return saved(where.path, run(lab));
  } catch (err) {
    return reply(`工具執行失敗（程式的問題）：${err instanceof Error ? err.message : String(err)}`, true);
  }
}

/** 子專案 42：同上，工具要等一段時間（轉成麵包板用好幾個執行緒同時佈線）。 */
async function withFileAsync(file: string, run: (lab: tools.LabFile) => Promise<tools.ToolResult>): Promise<Reply> {
  const where = insideProject(ROOT, file);
  if (!where.ok) return reply(where.error, true);
  const lab = load(where.path);
  if (typeof lab === 'string') return reply(lab, true);
  try {
    return saved(where.path, await run(lab));
  } catch (err) {
    return reply(`工具執行失敗（程式的問題）：${err instanceof Error ? err.message : String(err)}`, true);
  }
}

function saved(path: string, r: tools.ToolResult): Reply {
  if (r.error || !r.file) return reply(r.text, r.error === true);
  save(path, r.file);
  return reply(`${r.text}\n已存到 ${shown(path)}；在網頁用「檔案 → 匯入 JSON」打開。`);
}

/** 子專案 42：轉成麵包板的佈線執行緒（核心數 − 1，最多 4 個；只有 1 個時不用執行緒）。 */
const pool = isMainThread && poolSize() > 1 ? createRoutingPool(poolSize()) : null;

const file = z.string().describe('電路檔的路徑（工作資料夾裡的 .json 檔，例如 circuits/xor.json）');
const hole = (what: string) =>
  z.string().describe(`${what}：孔位名稱，寫法和網頁一樣，例如 F10、A3、T+10（上方 + 軌）、B-3（下方 − 軌）；EIC-1106 寫 1-F10、P2+12；有好幾塊板時加板子 ID，例如 b2:F10`);

const server = new McpServer(
  { name: 'breadboard-lab', version: VERSION },
  {
    instructions: [
      'Breadboard Lab：在 MB-102 / EIC-1106 麵包板上放 74LS IC、電阻、LED、指撥開關並接線，可以檢查、AI 佈線、模擬，也可以把邏輯圖轉成麵包板。',
      `工作資料夾：${ROOT}；file 參數寫相對於它的路徑（例如 circuits/xor.json），list_files 列出裡面的電路檔。`,
      '電路檔就是網頁「匯出 JSON」的格式；做完用 share_link 給使用者一個連結（點開就在網頁上看到），或請使用者在網頁用「檔案 → 匯入 JSON」打開。',
      '接線規則（一定要遵守）：每條導線只能水平或垂直的直線，不能斜；要轉彎就分成兩條線（轉角接在同一排相通的五孔排）；兩條線不能重疊，也不能交叉；線不能跨過 IC（上下、左右都不行）或經過元件腳、別條線的端點。add_wire 會拒絕不合規則的線；auto_route 與 logic_to_breadboard 接出來的線都符合這些規則。',
      '建議流程：new_circuit → list_parts（查元件名稱與腳位）→ place_part（IC 第 1 腳放在 F 列，跨過凹槽）→ add_wire → check_circuit → auto_route → simulate。',
      '從邏輯圖開始：logic_set → logic_truth_table → logic_to_breadboard（轉換、佈線、比對一次完成）。手接的麵包板用 set_part 標上和邏輯圖一樣的名稱，再用 check_against_diagram 比對。',
      '從真值表題目開始：task_set → task_show → task_to_diagram → logic_to_breadboard → task_check。',
      '時序電路（正反器、計數器）：logic_set 用 CLOCK 節點與 74LS74 / 76 / 90 / 93 / 161 / 193 方塊 → logic_truth_table 看時序表 → logic_to_breadboard。',
    ].join('\n'),
  },
);

server.registerTool(
  'list_files',
  { title: '電路檔清單', description: '列出工作資料夾裡的電路檔（往下 3 層以內），每個寫出麵包板、元件數、有沒有邏輯圖與真值表題目。', inputSchema: {} },
  async () => {
    const { files, truncated } = listCircuitFiles(ROOT);
    const more = truncated ? ['（資料夾裡的檔案太多，只看了一部分；請在設定裡用 --folder 指定放電路檔的資料夾）'] : [];
    if (files.length === 0) return reply(['工作資料夾裡還沒有電路檔；用 new_circuit 建立', ...more].join('\n'));
    return reply([`工作資料夾 ${ROOT} 裡的電路檔：`, ...files.map((f) => `- ${f.path}：${tools.describeLabFile(f.lab)}`), ...more].join('\n'));
  },
);

server.registerTool(
  'new_circuit',
  {
    title: '建立電路檔',
    description: '建立新的空白電路檔（一塊麵包板）。檔案已經存在時拒絕，除非 overwrite 為 true（而且原本的檔案也是電路檔）。',
    inputSchema: {
      file,
      board: z.enum(['MB102', 'EIC1106']).optional().describe('麵包板：MB102（預設，830 孔）或 EIC1106（大型）'),
      overwrite: z.boolean().optional().describe('檔案已存在時是否蓋掉（只能蓋掉電路檔）'),
    },
  },
  async (args) => {
    const where = insideProject(ROOT, args.file);
    if (!where.ok) return reply(where.error, true);
    if (existsSync(where.path)) {
      if (!args.overwrite) return reply(`${shown(where.path)} 已經存在；要蓋掉請加 overwrite: true`, true);
      if (typeof load(where.path) === 'string') return reply(`${shown(where.path)} 不是電路檔，不能蓋掉`, true);
    }
    const board = args.board ?? 'MB102';
    save(where.path, tools.newLabFile(basename(where.path, '.json'), board));
    return reply(`建立了 ${shown(where.path)}（${board === 'MB102' ? 'MB-102' : 'EIC-1106'}，空白）。`);
  },
);

server.registerTool(
  'circuit_summary',
  { title: '電路摘要', description: '列出元件與每一隻腳所在的孔、導線、連在一起的腳（Net）、沒接的腳。', inputSchema: { file } },
  async (args) => withFile(args.file, (lab) => tools.circuitSummary(lab)),
);

server.registerTool(
  'rename_circuit',
  {
    title: '改電路名稱',
    description: '改電路檔裡的名稱（網頁左上角顯示的名稱，最多 60 個字；不改檔名）。',
    inputSchema: { file, name: z.string().describe('新的電路名稱') },
  },
  async (args) => withFile(args.file, (lab) => tools.renameCircuit(lab, { name: args.name })),
);

server.registerTool(
  'share_link',
  {
    title: '分享連結',
    description: '把電路檔（麵包板、邏輯圖、題目）做成網址，使用者點開就在網頁上看到這個電路，不用匯入檔案。做完電路後給使用者這個連結。',
    inputSchema: { file },
  },
  async (args) => withFileAsync(args.file, (lab) => tools.shareLink(lab)),
);

server.registerTool(
  'check_circuit',
  { title: '檢查電路', description: '錯誤與警告（短路、IC 沒接電源、輸入懸空、斜的線、一條線裡轉彎、線交叉或重疊…），每一項附原因與建議的接法。', inputSchema: { file } },
  async (args) => withFile(args.file, (lab) => tools.checkCircuit(lab)),
);

server.registerTool(
  'list_parts',
  {
    title: '元件庫',
    description: '列出可以放的元件名稱（例如 74LS00、resistor-220、led-red、dipsw-4、vcc、gnd）與說明；結果 6 個以內時列出腳位。',
    inputSchema: { query: z.string().optional().describe('關鍵字，例如 NAND、74LS08、LED、電阻') },
  },
  async (args) => {
    const r = tools.listParts(args);
    return reply(r.text, r.error === true);
  },
);

server.registerTool(
  'place_part',
  {
    title: '放元件',
    description: '把元件放到麵包板上。hole 是第 1 腳的孔；不能放時說明原因。沒給 hole 時自動找空位。IC 要跨過中間的凹槽（第 1 腳放在 F 列）。',
    inputSchema: {
      file,
      part: z.string().describe('元件名稱（list_parts 列出的名稱）'),
      hole: hole('第 1 腳的位置').optional(),
      rotation: z.number().int().optional().describe('旋轉角度：0、90、180、270'),
      id: z.string().optional().describe('指定元件 ID（預設自動編號：U1、R1、D1、SW1…）'),
    },
  },
  async ({ file: f, ...args }) => withFile(f, (lab) => tools.placePart(lab, args)),
);

server.registerTool(
  'add_wire',
  {
    title: '接線',
    description: '在兩個孔之間接一條直線導線。只能水平或垂直，不能斜；要轉彎就分成兩條（轉角接在同一排相通的孔）；不能和別條線重疊，也不能交叉；不能跨過 IC 或經過元件腳、別條線的端點。不合規則時說明原因。',
    inputSchema: { file, from: hole('起點'), to: hole('終點'), color: z.string().optional().describe('顏色（#rrggbb）；預設接 + 軌紅色、− 軌黑色') },
  },
  async ({ file: f, ...args }) => withFile(f, (lab) => tools.addWire(lab, args)),
);

server.registerTool(
  'set_part',
  {
    title: '改元件設定',
    description: '改名稱（指撥開關每個開關一個、LED 與 7 段顯示器一個）、電阻值、LED 顏色、指撥開關 ON / OFF。',
    inputSchema: {
      file,
      id: z.string().describe('元件 ID'),
      labels: z.array(z.string()).optional().describe('名稱；指撥開關第 k 個開關用第 k 個名稱'),
      resistance: z.number().optional().describe('電阻值（Ω）'),
      color: z.enum(['red', 'green', 'yellow', 'blue']).optional().describe('LED 顏色'),
      switches: z.array(z.boolean()).optional().describe('指撥開關每個開關的狀態，true = ON'),
    },
  },
  async ({ file: f, ...args }) => withFile(f, (lab) => tools.setPart(lab, args)),
);

server.registerTool(
  'remove',
  { title: '刪除', description: '依 ID 刪除元件或導線。', inputSchema: { file, id: z.string().describe('元件或導線的 ID') } },
  async ({ file: f, ...args }) => withFile(f, (lab) => tools.remove(lab, args)),
);

server.registerTool(
  'auto_route',
  {
    title: 'AI 標準佈線',
    description: '重新算出只走水平 / 垂直、轉彎分成兩條、不重疊、不交叉、不穿過元件的標準接線（保留目前接線定義的連接），回覆這次佈線的說明。排不完時不改檔案。',
    inputSchema: {
      file,
      move_ics: z.boolean().optional().describe('允許搬動 IC（找更好的位置）'),
      apply: z.boolean().optional().describe('是否寫回檔案（預設 true；false 只看結果）'),
    },
  },
  async ({ file: f, ...args }) => withFile(f, (lab) => tools.autoRoute(lab, args)),
);

server.registerTool(
  'simulate',
  {
    title: '模擬',
    description: '74LS 邏輯模擬到穩定：哪些 LED 亮、7 段顯示器顯示什麼、哪顆 IC 沒有供電。switches 只用在這次模擬，不寫回檔案。',
    inputSchema: {
      file,
      switches: z.record(z.string(), z.array(z.boolean())).optional().describe('指撥開關狀態，例如 { "SW1": [true, false, false, false] }'),
      pressed: z.array(z.string()).optional().describe('按著的按鈕 ID'),
    },
  },
  async ({ file: f, ...args }) => withFile(f, (lab) => tools.simulate(lab, args)),
);

server.registerTool(
  'logic_set',
  {
    title: '寫入邏輯圖',
    description: [
      '寫入（取代）電路檔裡的邏輯圖。節點種類：AND、OR、NAND、NOR（inputs 2–4）、NOT、XOR、INPUT、OUTPUT（要有 name；activeLow: true 是低態致動，0 時亮，轉成麵包板時 LED 正極接 +5 V、負極經過電阻接到輸出）、DISPLAY（7 段顯示器，name）、',
      'HIGH（5V）、LOW（GND）、BLOCK（chip：74LS83、74LS151、74LS153、74LS138、74LS85；時序 IC：74LS74 雙 D 正反器、74LS76 雙 JK 正反器、74LS90、74LS93、74LS161、74LS193 計數器，輸入可以不接：清除 / 預設 / 載入不用、資料 0、時脈 1）、',
      'CLOCK（時脈，name，一張圖最多一個；接到正反器、計數器的 CLK）。腳的順序用 BLOCK 的腳名（和 74LS 資料表一樣），fromPin 是第幾個輸出。',
      '線：{ id, from, fromPin?（方塊的第幾個輸出）, to: { node, pin } }。節點沒有 x、y 時自動排版。',
    ].join(''),
    inputSchema: {
      file,
      diagram: z
        .object({ nodes: z.array(z.record(z.string(), z.unknown())), wires: z.array(z.record(z.string(), z.unknown())) })
        .passthrough()
        .describe('{ nodes: [...], wires: [...] }'),
    },
  },
  async ({ file: f, diagram }) => withFile(f, (lab) => tools.logicSet(lab, { diagram })),
);

server.registerTool(
  'logic_truth_table',
  {
    title: '真值表',
    description: '電路檔裡邏輯圖的真值表（輸入依名稱排序，第一個是最高位元）、每個輸出的布林式（照圖寫出來與化簡後）與檢查結果。時序電路（有正反器、計數器或時脈）回傳時序表：從重設開始每次脈衝之後的輸出。',
    inputSchema: { file, pulses: z.number().int().min(1).max(64).optional().describe('時序表列到第幾次脈衝（預設 16）') },
  },
  async (args) => withFile(args.file, (lab) => tools.logicTruthTable(lab, { pulses: args.pulses })),
);

server.registerTool(
  'logic_to_breadboard',
  {
    title: '邏輯圖轉成麵包板',
    description: '把邏輯圖轉成 74LS IC、指撥開關、LED 的麵包板（取代目前的電路），接著 AI 佈線、逐列模擬比對真值表；時序電路的時脈換成時脈元件，從重設開始送 16 個脈衝比對時序表。',
    inputSchema: {
      file,
      switch_to: z.enum(['vcc', 'gnd']).optional().describe('開關另一端接 +5 V（ON = 1，預設）或 GND（ON = 0）'),
      board: z.enum(['auto', 'MB102', 'EIC1106']).optional().describe('麵包板（預設自動：先試 MB-102，排不完改用 EIC-1106，還排不完用兩塊 EIC-1106 左右貼在一起；指定時只用那一塊）'),
      gates: z.enum(['direct', 'nand', 'nor']).optional().describe('照種類對應（預設）、只用 NAND（74LS00）或只用 NOR（74LS02）'),
      inputs: z.enum(['switch', 'button']).optional().describe('輸入用指撥開關（預設）或每個輸入一顆按鈕'),
      display: z.enum(['ca', 'cc']).optional().describe('7 段顯示器用共陽極 + 74LS47（預設）或共陰極 + 74LS48'),
      display_resistors: z
        .enum(['each', 'shared'])
        .optional()
        .describe('7 段顯示器的電阻：each 每段一顆 220 Ω（亮度一致，最多 1 個顯示器）或 shared 共同腳共用一顆 100 Ω（線比較少，最多 2 個；亮的段越多越暗）。沒給時 1 個顯示器 each、2 個 shared'),
      pulls: z.boolean().optional().describe('加上 / 下拉電阻（預設加上；電阻直立插在開關那一排、另一端插進電源軌）'),
    },
  },
  async ({ file: f, ...args }) =>
    pool ? withFileAsync(f, (lab) => tools.logicToBreadboardParallel(lab, args, pool.routeMany, pool.size)) : withFile(f, (lab) => tools.logicToBreadboard(lab, args)),
);

server.registerTool(
  'check_against_diagram',
  {
    title: '和邏輯圖比對',
    description: '依名稱把麵包板的開關、LED、7 段顯示器對應到邏輯圖，逐列模擬比對真值表；列出不一致的列或還不能比對的原因。',
    inputSchema: { file },
  },
  async (args) => withFile(args.file, (lab) => tools.checkAgainstDiagram(lab)),
);

// ---- 子專案 33：真值表題目 ----

const output = z
  .object({
    name: z.string().describe('輸出名稱（英文字母開頭，最多 8 個字）'),
    ones: z.array(z.number().int()).optional().describe('一般輸出：值是 1 的列號（從 0 開始；第一個輸入是最高位元）；其他列是 0'),
    dont_care: z.array(z.number().int()).optional().describe('一般輸出：不在乎（X）的列號'),
    display: z.boolean().optional().describe('true：這個輸出是 7 段顯示器（BCD，格子是 0–15）'),
    values: z.array(z.union([z.number().int(), z.literal('X')])).optional().describe('7 段顯示器：每一列的數字（0–15 或 "X"），個數要等於列數'),
  })
  .describe('一個輸出');

server.registerTool(
  'task_set',
  {
    title: '寫入真值表題目',
    description: [
      '寫入（取代）電路檔裡的真值表題目，邏輯圖不動。四種用法選一種：',
      'inputs + outputs 直接寫題目（輸入最多 6 個、輸出最多 8 個；每一列的輸入照二進位從全 0 數到全 1，第一個輸入是最高位元）；',
      'expressions 用布林式建立（例如 "X = AB + A\'C"，每行一個輸出；A\' 是反相、連寫是 AND、+ 是 OR、⊕ 或 ^ 是 XOR；輸入依字母排序）；',
      'from_diagram: true 用檔案裡邏輯圖的真值表建立；clear: true 刪除題目。',
    ].join(''),
    inputSchema: {
      file,
      inputs: z.array(z.string()).optional().describe('輸入名稱，第一個是最高位元，例如 ["A", "B", "C"]'),
      outputs: z.array(output).optional().describe('每個輸出一個物件，例如 [{ "name": "X", "ones": [3, 5, 6, 7] }]'),
      expressions: z.string().optional().describe('布林式，每行一個輸出，例如 "X = AB + A\'C\\nY = A ⊕ B"'),
      from_diagram: z.boolean().optional().describe('用檔案裡邏輯圖的真值表建立題目'),
      clear: z.boolean().optional().describe('刪除題目'),
    },
  },
  async ({ file: f, ...args }) => withFile(f, (lab) => taskTools.taskSet(lab, args)),
);

server.registerTool(
  'task_show',
  {
    title: '看真值表題目',
    description: '列出題目的真值表，以及每個輸出化簡後的布林式（7 段顯示器拆成 A–D 四個位元，A 是最低位元）。',
    inputSchema: { file, form: z.enum(['sop', 'pos']).optional().describe('sop：積項和（預設）；pos：和積') },
  },
  async ({ file: f, ...args }) => withFile(f, (lab) => taskTools.taskShow(lab, args)),
);

server.registerTool(
  'task_to_diagram',
  {
    title: '從題目產生邏輯圖',
    description: '照題目化簡後畫出邏輯圖，取代檔案裡的邏輯圖（題目保留），並和題目比對。之後可以用 logic_to_breadboard 轉成麵包板。',
    inputSchema: {
      file,
      form: z.enum(['sop', 'pos', 'nand', 'nor']).optional().describe('sop：積項和 AND–OR（預設）；pos：和積 OR–AND；nand：只用 NAND；nor：只用 NOR'),
    },
  },
  async ({ file: f, ...args }) => withFile(f, (lab) => taskTools.taskToDiagram(lab, args)),
);

server.registerTool(
  'task_check',
  {
    title: '和題目比對',
    description: '拿題目和檔案裡的邏輯圖、麵包板比對（依名稱對應輸入與輸出，不在乎的格子不比），列出不一致的列或還不能比對的原因。',
    inputSchema: { file },
  },
  async (args) => withFile(args.file, (lab) => taskTools.taskCheck(lab)),
);

// 子專案 42：打包版的佈線執行緒載入的是整個檔案；只有主執行緒連上 AI 工具（執行緒的工作在 mcp-pool.ts）。
if (isMainThread) await server.connect(new StdioServerTransport());
