import { expect, test } from '@playwright/test';

test('佈線後按「看說明」：前後比較、點訊號在板上標出來、沒有金鑰時可以設定', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: '74LS00 + LED（驗收電路）' }).click();
  // 佈線前沒有這段說明。
  await expect(page.getByTestId('routing-summary')).toHaveCount(0);

  await page.getByRole('button', { name: '⚡ AI 標準佈線' }).click();
  await expect(page.getByTestId('routing-result')).toContainText('Standard Routing Complete', { timeout: 20_000 });
  await page.getByRole('tab', { name: /Nets/ }).click();
  await page.getByTestId('routing-explain').click();

  const summary = page.getByTestId('routing-summary');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('佈線成功');
  await expect(summary).toContainText('佈線前');
  await expect(summary).toContainText('佈線後');

  const nets = summary.locator('[data-routing-net]');
  expect(await nets.count()).toBeGreaterThan(0);
  await nets.first().click();
  await expect(page.getByTestId('flash-ring').first()).toBeVisible();

  const ask = summary.getByTestId('ask-ai');
  await expect(ask.getByRole('button', { name: '設定 Gemini API 金鑰' })).toBeVisible();

  // 復原佈線之後說明消失。
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('routing-summary')).toHaveCount(0);
});
