import { expect, test } from '@playwright/test';

const GUIDE = 'https://kazuto0126.github.io/breadboard-lab-site/mcp/';

test('說明選單的「給 AI 工具用（MCP）」打開網站上的設定說明頁（子專案 33）', async ({ page, context }) => {
  // 不連到真的網站：攔下來回一個簡單的頁面。
  await context.route('https://kazuto0126.github.io/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>MCP</title>ok' }));
  await page.goto('/');
  await page.getByRole('button', { name: '說明', exact: true }).click();
  const popup = page.waitForEvent('popup');
  await page.getByRole('menuitem', { name: '給 AI 工具用（MCP）' }).click();
  expect((await popup).url()).toBe(GUIDE);
});
