import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { importFixture, openEditor, wires } from './helpers';

const SINGLE_FILE = resolve(process.cwd(), 'dist-single/breadboard-lab.html');

test('單一 HTML 檔用 file:// 開啟可以完成一次 AI 佈線', async ({ page }) => {
  const html = readFileSync(SINGLE_FILE, 'utf8');
  expect(html).not.toMatch(/<script[^>]*\ssrc=/i);
  expect(html).not.toMatch(/<link[^>]*\shref=/i);

  const external: string[] = [];
  page.on('request', (request) => {
    if (!/^(file|blob|data):/.test(request.url())) external.push(request.url());
  });

  await openEditor(page, pathToFileURL(SINGLE_FILE).href);
  await importFixture(page, 'acceptance.breadboard.json');
  await expect(page.getByText('導線 7', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'AI 標準佈線' }).click();
  await expect(page.getByText('Standard Routing Complete')).toBeVisible();
  await expect(wires(page, 'w_').first()).toBeAttached();
  expect(external).toEqual([]);
});
