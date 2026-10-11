import { expect, test } from '@playwright/test';

test('新增 EIC-1106、載入範例、AI 標準佈線', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '關閉' }).first().click();
  await page.getByRole('button', { name: '＋ EIC-1106' }).click();
  await expect(page.locator('[data-hole="2-A15"]')).toHaveCount(1);
  await expect(page.locator('[data-hole="紅"]')).toHaveCount(1);
  await expect(page.locator('[data-post="red"]')).toHaveCount(1);

  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: 'EIC-1106 大型麵包板', exact: true }).click();
  await page.getByRole('button', { name: '⚡ AI 標準佈線' }).click();
  await expect(page.getByTestId('routing-result')).toContainText('Standard Routing Complete', { timeout: 30_000 });
});
