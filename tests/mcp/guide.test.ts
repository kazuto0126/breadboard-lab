import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** 子專案 33（規格 2026-10-19 mcp-other-tools 第 6 節）：網站上的 MCP 設定說明頁。 */
const html = readFileSync('public/mcp/index.html', 'utf8');

describe('the MCP setup guide page', () => {
  it('is a Traditional Chinese page with the download link and every AI tool', () => {
    expect(html).toContain('lang="zh-Hant"');
    expect(html).toMatch(/<a [^>]*href="breadboard-lab-mcp\.mjs"[^>]*download/);
    for (const name of ['Cursor', 'VS Code', 'Gemini CLI', 'Claude Desktop', 'Claude Code']) expect(html).toContain(name);
    expect(html).toContain('--folder');
    expect(html).toContain('node --version');
    // Node.js 20 已經停止支援（2026-04），CI 用 22 測打包檔。
    expect(html).toContain('Node.js 22 以上');
    expect(html).not.toContain('Node.js 20');
    expect(html).toContain('匯入 JSON');
  });

  it('has settings that are valid JSON, for both Windows and macOS', () => {
    const blocks = [...html.matchAll(/<pre class="json (win|mac)">([\s\S]*?)<\/pre>/g)];
    expect(blocks.filter((b) => b[1] === 'win').length).toBeGreaterThanOrEqual(4);
    expect(blocks.filter((b) => b[1] === 'mac').length).toBe(blocks.filter((b) => b[1] === 'win').length);
    for (const [, , text] of blocks) expect(() => JSON.parse(text)).not.toThrow();
  });

  it('loads nothing from other sites', () => {
    expect(html).not.toMatch(/<(script|link|img)\b[^>]*\b(src|href)="https?:/);
  });
});
