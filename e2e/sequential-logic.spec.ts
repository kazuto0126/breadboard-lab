import { expect, test } from '@playwright/test';

/** 子專案 46（規格 2026-10-24 sequential-logic）：時脈與計數器：按脈衝、時序表、轉成麵包板後送脈衝比對。 */
test('十進位計數器：按時脈數 0–9、時序表、重設，轉成麵包板後比對時序表全部一致', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: '十進位計數器（74LS90 + 7 段顯示器）' }).click();
  await expect(page.locator('[data-logic-node]')).toHaveCount(3);

  const shown = page.locator('[data-logic-display="d1"]');
  await expect(shown).toHaveAttribute('data-value', '0');
  for (let k = 1; k <= 3; k++) await page.locator('[data-logic-pulse="c1"]').click();
  await expect(shown).toHaveAttribute('data-value', '3');

  await page.getByRole('tab', { name: '時序表' }).click();
  const table = page.getByTestId('sequence-table');
  await expect(table.locator('tr[data-pulse]')).toHaveCount(17);
  await expect(table.locator('tr[data-pulse="9"] td').last()).toHaveText('9');
  await expect(table.locator('tr[data-pulse="10"] td').last()).toHaveText('0');
  await page.getByRole('button', { name: '重設（正反器、計數器回到 0）' }).click();
  await expect(shown).toHaveAttribute('data-value', '0');
  await page.locator('[data-logic-node="c1"]').screenshot({ path: 'test-results/sequential-clock.png' });

  await page.getByRole('tab', { name: '屬性' }).click();
  await page.getByRole('button', { name: '轉成麵包板…' }).click();
  const dialog = page.getByRole('dialog', { name: '轉成麵包板' });
  await expect(dialog.getByTestId('convert-preview')).toContainText('74LS90 × 1');
  await dialog.getByRole('button', { name: '轉換' }).click();
  await expect(page.locator('g[data-component-id="CLK1"]')).toHaveCount(1, { timeout: 120_000 });
  await expect(page.getByTestId('status')).not.toContainText('Routing…', { timeout: 120_000 });
  await page.getByRole('tab', { name: /檢查/ }).click();
  await expect(page.getByTestId('diagram-check')).toContainText('1 種輸入組合各送 16 個脈衝，麵包板的模擬結果和時序表全部一致', { timeout: 60_000 });
});
