import { expect, test } from '@playwright/test';

/** 子專案 51（規格 2026-10-25 single-flip-flops）：單顆 D 型正反器的同步計數器，轉成麵包板時兩顆合用一片 74LS74。 */
test('2 位元同步計數器：時序表數 0–3，轉成麵包板用一片 74LS74，送脈衝比對全部一致', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: '2 位元同步計數器（D 型正反器）' }).click();
  await expect(page.locator('[data-logic-node]')).toHaveCount(6);

  await page.getByRole('tab', { name: '時序表' }).click();
  const rows = page.getByTestId('sequence-table').locator('tr[data-pulse]');
  await expect(rows.nth(0)).toHaveText('000');
  await expect(rows.nth(1)).toHaveText('110');
  await expect(rows.nth(2)).toHaveText('201');
  await expect(rows.nth(3)).toHaveText('311');
  await expect(rows.nth(4)).toHaveText('400');

  await page.getByRole('tab', { name: '屬性' }).click();
  await page.getByRole('button', { name: '轉成麵包板…' }).click();
  const dialog = page.getByRole('dialog', { name: '轉成麵包板' });
  await expect(dialog.getByTestId('convert-preview')).toContainText('74LS74 × 1');
  await dialog.getByRole('button', { name: '轉換' }).click();
  await expect(page.locator('g[data-component-id="CLK1"]')).toHaveCount(1, { timeout: 120_000 });
  await expect(page.getByTestId('status')).not.toContainText('Routing…', { timeout: 120_000 });
  await page.getByRole('tab', { name: /檢查/ }).click();
  await expect(page.getByTestId('diagram-check')).toContainText('送 16 個脈衝，麵包板的模擬結果和時序表全部一致', { timeout: 60_000 });
});
