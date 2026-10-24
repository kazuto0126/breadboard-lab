import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** 整合測試：真的啟動 scripts/mcp-server.ts（stdio），用 SDK 的用戶端呼叫工具。 */
const root = process.cwd();
const dir = join(root, 'tests', '.tmp-mcp');
const file = 'tests/.tmp-mcp/xor.json';
const client = new Client({ name: 'breadboard-lab-test', version: '1.0.0' });

type Result = { content: Array<{ type: string; text?: string }>; isError?: boolean };
async function call(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
  const r = (await client.callTool({ name, arguments: args })) as Result;
  return { text: r.content.map((c) => c.text ?? '').join('\n'), isError: r.isError === true };
}

beforeAll(async () => {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  // 子專案 42：一次一件（和其他限時的轉換測試同時跑時不要多佔核心；執行緒由 pool.test 與 bundle.test 測）。
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ['--import', 'tsx', 'scripts/mcp-server.ts'], cwd: root, env: { ...process.env, BREADBOARD_LAB_MCP_THREADS: '1' } as Record<string, string> }));
}, 60_000);

afterAll(async () => {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('the MCP server', () => {
  it('lists the 20 tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'add_wire', 'auto_route', 'check_against_diagram', 'check_circuit', 'circuit_summary', 'list_files', 'list_parts', 'logic_set',
        'logic_to_breadboard', 'logic_truth_table', 'new_circuit', 'place_part', 'remove', 'set_part', 'share_link', 'simulate',
        'task_check', 'task_set', 'task_show', 'task_to_diagram',
      ].sort(),
    );
  });

  // 子專案 39（規格 2026-10-20 wiring-rules）：其他 AI 工具看得到接線規則。
  it('tells AI tools the wiring rules', async () => {
    const rules = ['只能水平或垂直', '分成兩條', '不能交叉', '跨過 IC'];
    const instructions = client.getInstructions() ?? '';
    for (const r of rules) expect(instructions).toContain(r);
    const { tools } = await client.listTools();
    const describe = (name: string) => tools.find((t) => t.name === name)?.description ?? '';
    for (const r of rules) expect(describe('add_wire')).toContain(r);
    expect(describe('auto_route')).toContain('不交叉');
    expect(describe('check_circuit')).toContain('交叉');
  });

  it('creates a circuit file, edits it and reads it back', async () => {
    expect(await call('new_circuit', { file })).toEqual({ text: expect.stringContaining('建立了 tests/.tmp-mcp/xor.json'), isError: false });
    expect(existsSync(join(root, file))).toBe(true);
    expect(await call('new_circuit', { file })).toMatchObject({ isError: true, text: expect.stringContaining('已經存在') });
    const placed = await call('place_part', { file, part: '74LS00', hole: 'F10' });
    expect(placed.text).toMatch(/^放好 U1（74LS00）/);
    expect(placed.text).toContain('在網頁用「檔案 → 匯入 JSON」打開');
    expect(JSON.parse(readFileSync(join(root, file), 'utf8')).circuit.components).toHaveLength(1);
    expect((await call('circuit_summary', { file })).text).toContain('第 14 腳 VCC @ E10');
    // 失敗時不寫檔
    expect(await call('place_part', { file, part: '74LS04', hole: 'F12' })).toMatchObject({ isError: true });
    expect(JSON.parse(readFileSync(join(root, file), 'utf8')).circuit.components).toHaveLength(1);
  });

  it('keeps a task-only diagram when another tool rewrites the file, and lists circuit files (sub-project 33)', async () => {
    const only = 'tests/.tmp-mcp/only-task.json';
    const task = { inputs: ['A', 'B'], outputs: ['X'], rows: [[0], [1], [1], [0]] };
    const blank = JSON.parse(readFileSync(join(root, file), 'utf8'));
    writeFileSync(join(root, only), JSON.stringify({ ...blank, circuit: { ...blank.circuit, components: [], wires: [] }, logic: { version: 1, nodes: [], wires: [], task } }));
    expect(await call('place_part', { file: only, part: '74LS86', hole: 'F10' })).toMatchObject({ isError: false });
    expect(JSON.parse(readFileSync(join(root, only), 'utf8')).logic?.task).toEqual(task);
    // list_files 略過 . 開頭的資料夾，所以另外用 --folder 指到暫存資料夾啟動一次。
    const inFolder = new Client({ name: 'breadboard-lab-test-folder', version: '1.0.0' });
    await inFolder.connect(new StdioClientTransport({ command: process.execPath, args: ['--import', 'tsx', 'scripts/mcp-server.ts', '--folder', 'tests/.tmp-mcp'], cwd: root }));
    const listed = (await inFolder.callTool({ name: 'list_files', arguments: {} })) as Result;
    await inFolder.close();
    const text = listed.content.map((c) => c.text ?? '').join('\n');
    expect(text).toContain('- xor.json：MB-102，元件 1 個');
    expect(text).toContain('- only-task.json：MB-102，元件 1 個，沒有邏輯圖，有題目（A B → X）');
  });

  it('runs the task flow: write a task, draw it, convert it and check both (sub-project 33)', async () => {
    const t = 'tests/.tmp-mcp/task.json';
    await call('new_circuit', { file: t });
    expect(await call('task_set', { file: t, inputs: ['A', 'B', 'C'], outputs: [{ name: 'X', ones: [3, 5, 6, 7] }] })).toMatchObject({ isError: false });
    expect((await call('task_show', { file: t })).text).toContain('X = AB + AC + BC');
    expect((await call('task_to_diagram', { file: t, form: 'sop' })).text).toContain('邏輯圖和題目全部一致');
    expect(await call('logic_to_breadboard', { file: t })).toMatchObject({ isError: false });
    const checked = (await call('task_check', { file: t })).text;
    expect(checked).toMatch(/邏輯圖：8 種輸入組合，邏輯圖和題目全部一致/);
    expect(checked).toMatch(/麵包板：8 種輸入組合，麵包板的模擬結果和題目全部一致/);
    const before = readFileSync(join(root, t), 'utf8');
    expect(await call('task_set', { file: t, clear: true, from_diagram: true })).toMatchObject({ isError: true, text: 'inputs / outputs、expressions、from_diagram、clear 只能選一種' });
    expect(readFileSync(join(root, t), 'utf8')).toBe(before);
  }, 120_000);

  it('refuses paths outside the project and never overwrites files that are not circuits', async () => {
    expect(await call('circuit_summary', { file: '../outside.json' })).toMatchObject({ isError: true, text: expect.stringContaining('只能讀寫工作資料夾裡的檔案') });
    const before = readFileSync(join(root, 'package.json'), 'utf8');
    expect(await call('new_circuit', { file: 'package.json', overwrite: true })).toMatchObject({ isError: true, text: expect.stringContaining('不是電路檔') });
    expect(readFileSync(join(root, 'package.json'), 'utf8')).toBe(before);
  });
});
