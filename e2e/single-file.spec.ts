import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

/** 單一 HTML 離線版：不需要伺服器、不需要網路，直接用 file:// 開啟就能完整使用（包括在 Web Worker 裡佈線）。 */
const SINGLE_FILE = resolve('dist-single/breadboard-lab.html');

test.beforeAll(() => {
  execSync('npm run build:single', { stdio: 'pipe' });
});

test('單一 HTML 離線版：file:// 開啟、載入範例、AI 標準佈線，不連任何外部資源', async ({ page }) => {
  const html = readFileSync(SINGLE_FILE, 'utf8');
  expect(html).not.toMatch(/<script[^>]*\ssrc=/i);
  expect(html).not.toMatch(/<link[^>]*\shref="(?!data:)/i);

  const external: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (!/^(file|blob|data):/.test(request.url())) external.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(pathToFileURL(SINGLE_FILE).href);
  await expect(page.locator('[data-hole]')).toHaveCount(830);
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: '74LS00 + LED（驗收電路）' }).click();
  await expect(page.getByTestId('wire-count')).toHaveText('7');

  await page.getByRole('button', { name: '⚡ AI 標準佈線' }).click();
  await expect(page.getByTestId('routing-result')).toContainText('Standard Routing Complete', { timeout: 20_000 });
  await expect(page.getByTestId('mode')).toHaveText('AUTO ROUTE');
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
