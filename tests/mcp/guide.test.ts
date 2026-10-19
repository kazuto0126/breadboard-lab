import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** 子專案 33（規格 2026-10-19 mcp-other-tools 第 6 節）：網站上的 MCP 設定說明頁。 */
const html = readFileSync('public/mcp/index.html', 'utf8');
/** 說明頁寫了設定的 AI 工具（2026-10-19 補上後面 7 個）。 */
const TOOLS = ['Cursor', 'VS Code', 'Gemini CLI', 'Claude Desktop', 'Claude Code', 'Codex', 'Antigravity', 'Windsurf', 'Cline', 'Zed', 'JetBrains', 'LM Studio'];

describe('the MCP setup guide page', () => {
  it('is a Traditional Chinese page with the download link and every AI tool', () => {
    expect(html).toContain('lang="zh-Hant"');
    expect(html).toMatch(/<a [^>]*href="breadboard-lab-mcp\.mjs"[^>]*download/);
    for (const name of TOOLS) expect(html).toContain(name);
    expect(html).toContain('--folder');
    expect(html).toContain('node --version');
    // Node.js 20 已經停止支援（2026-04），CI 用 22 測打包檔。
    expect(html).toContain('Node.js 22 以上');
    expect(html).not.toContain('Node.js 20');
    expect(html).toContain('匯入 JSON');
    // 子專案 35：第一次可以怎麼問，有一個從布林式開始的例子。
    expect(html).toContain('布林式');
  });

  it('has settings that are valid JSON, for both Windows and macOS', () => {
    const blocks = [...html.matchAll(/<pre class="json (win|mac)">([\s\S]*?)<\/pre>/g)];
    expect(blocks.filter((b) => b[1] === 'win').length).toBeGreaterThanOrEqual(10);
    expect(blocks.filter((b) => b[1] === 'mac').length).toBe(blocks.filter((b) => b[1] === 'win').length);
    for (const [, , text] of blocks) expect(() => JSON.parse(text)).not.toThrow();
  });

  it('lists every tool at the top of the settings section, each with its own section', () => {
    const links = [...html.matchAll(/<a href="#(tool-[a-z-]+)">([^<]+)<\/a>/g)];
    expect(links.map((m) => m[2])).toEqual(TOOLS.map((t) => (t === 'VS Code' ? 'VS Code（Copilot）' : t === 'Codex' ? 'Codex CLI' : t === 'JetBrains' ? 'JetBrains AI Assistant' : t)));
    for (const [, id] of links) expect(html).toContain(`<h3 id="${id}">`);
  });

  it('has Codex settings in TOML for both Windows and macOS', () => {
    const blocks = [...html.matchAll(/<pre class="toml (win|mac)">([\s\S]*?)<\/pre>/g)];
    expect(blocks.map((b) => b[1]).sort()).toEqual(['mac', 'win']);
    for (const [, , text] of blocks) {
      const lines = text.split(/\r?\n/).filter(Boolean);
      expect(lines[0]).toBe('[mcp_servers.breadboard-lab]');
      for (const line of lines.slice(1)) expect(line).toMatch(/^[a-z_]+ = .+$/);
      expect(text).toContain('command = "node"');
    }
  });

  it('loads nothing from other sites', () => {
    expect(html).not.toMatch(/<(script|link|img)\b[^>]*\b(src|href)="https?:/);
  });
});
