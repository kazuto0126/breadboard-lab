import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * 子專案 33（規格 2026-10-19 mcp-other-tools 第 5、7 節）：打包成一個檔案後，複製到原始碼資料夾以外
 * （名稱有空白、沒有 node_modules）的地方，用 --folder 指定工作資料夾執行。
 */
const root = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'bl mcp '));
const work = join(dir, 'My Circuits');
const bundle = join(dir, 'breadboard-lab-mcp.mjs');
const client = new Client({ name: 'breadboard-lab-bundle-test', version: '1.0.0' });

type Result = { content: Array<{ type: string; text?: string }>; isError?: boolean };
async function call(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
  const r = (await client.callTool({ name, arguments: args })) as Result;
  return { text: r.content.map((c) => c.text ?? '').join('\n'), isError: r.isError === true };
}

beforeAll(async () => {
  execFileSync(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', 'vite.mcp.config.ts', '--logLevel', 'error'], { cwd: root, stdio: 'pipe' });
  copyFileSync(join(root, 'dist-mcp', 'breadboard-lab-mcp.mjs'), bundle);
  mkdirSync(work);
  // 子專案 42：用 2 個佈線執行緒（測打包版的執行緒，又不要多佔其他限時測試的核心）。
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [bundle, '--folder', work], cwd: tmpdir(), env: { ...process.env, BREADBOARD_LAB_MCP_THREADS: '2' } as Record<string, string> }));
}, 120_000);

afterAll(async () => {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('the bundled MCP server', () => {
  it('is one file that imports nothing but Node built-ins', () => {
    expect(readdirSync(join(root, 'dist-mcp'))).toEqual(['breadboard-lab-mcp.mjs']);
    const code = readFileSync(bundle, 'utf8');
    // 檔案最上層的 import（套件裡註解與程式碼產生器字串中的 require / import 不算；真的能執行由下面在暫存資料夾跑的測試證明）。
    const specifiers = [...code.matchAll(/^import\s[^;]*?from\s*["']([^"']+)["'];?$/gm)].map((m) => m[1]);
    expect(specifiers.length).toBeGreaterThan(0);
    expect(specifiers.filter((s) => !s.startsWith('node:'))).toEqual([]);
    expect(code.startsWith('// Breadboard Lab MCP 伺服器')).toBe(true);
  });

  it('prints its version', () => {
    expect(execFileSync(process.execPath, [bundle, '--version'], { encoding: 'utf8' }).trim()).toMatch(/^\d{4}\.\d{1,2}\.\d{1,2}$/);
  });

  it('refuses a working folder that does not exist', () => {
    const r = spawnSync(process.execPath, [bundle, '--folder', join(dir, 'nope')], { encoding: 'utf8', timeout: 30_000 });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('找不到工作資料夾');
  });

  it('works in the working folder: 23 tools, the task flow, and nothing outside', async () => {
    expect((await client.listTools()).tools).toHaveLength(23);
    expect(await call('new_circuit', { file: 'maj.json' })).toMatchObject({ isError: false });
    expect(existsSync(join(work, 'maj.json'))).toBe(true);
    expect(await call('task_set', { file: 'maj.json', inputs: ['A', 'B', 'C'], outputs: [{ name: 'X', ones: [3, 5, 6, 7] }] })).toMatchObject({ isError: false });
    expect((await call('task_to_diagram', { file: 'maj.json' })).text).toContain('邏輯圖和題目全部一致');
    expect((await call('task_check', { file: 'maj.json' })).text).toContain('邏輯圖：8 種輸入組合，邏輯圖和題目全部一致');
    expect((await call('list_files', {})).text).toContain('- maj.json：MB-102，元件 0 個，有邏輯圖，有題目（A B C → X）');
    // 子專案 42：轉成麵包板用好幾個佈線執行緒（打包版的執行緒載入整個檔案，不能干擾和 AI 工具溝通的 stdout）。
    const converted = await call('logic_to_breadboard', { file: 'maj.json' });
    expect(converted).toMatchObject({ isError: false });
    expect(converted.text).toContain('已存到 maj.json');
    expect((await call('task_check', { file: 'maj.json' })).text).toContain('麵包板：8 種輸入組合');
    // 子專案 43：給使用者一個連結。
    expect((await call('share_link', { file: 'maj.json' })).text).toMatch(/https:\/\/kazuto0126\.github\.io\/breadboard-lab-site\/#c=[A-Za-z0-9_-]+/);
    expect(await call('circuit_summary', { file: '../x.json' })).toMatchObject({ isError: true, text: expect.stringContaining('只能讀寫工作資料夾裡的檔案') });
  }, 60_000);
});
