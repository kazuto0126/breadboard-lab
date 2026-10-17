import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
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
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ['--import', 'tsx', 'scripts/mcp-server.ts'], cwd: root }));
}, 60_000);

afterAll(async () => {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('the MCP server', () => {
  it('lists the 14 tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'add_wire', 'auto_route', 'check_against_diagram', 'check_circuit', 'circuit_summary', 'list_parts', 'logic_set',
        'logic_to_breadboard', 'logic_truth_table', 'new_circuit', 'place_part', 'remove', 'set_part', 'simulate',
      ].sort(),
    );
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

  it('refuses paths outside the project and never overwrites files that are not circuits', async () => {
    expect(await call('circuit_summary', { file: '../outside.json' })).toMatchObject({ isError: true, text: expect.stringContaining('只能讀寫專案資料夾裡的檔案') });
    const before = readFileSync(join(root, 'package.json'), 'utf8');
    expect(await call('new_circuit', { file: 'package.json', overwrite: true })).toMatchObject({ isError: true, text: expect.stringContaining('不是電路檔') });
    expect(readFileSync(join(root, 'package.json'), 'utf8')).toBe(before);
  });
});
