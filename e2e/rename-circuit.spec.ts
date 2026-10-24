import { expect, test } from '@playwright/test';

/** 子專案 47（規格 2026-10-25 convert-improvements 第 5 節）：左上角的電路名稱點一下就能改。 */
test('左上角的電路名稱：點一下改名，Enter 確定、Esc 取消', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const title = page.getByTestId('project-name');
  await expect(title).toHaveText('未命名電路');
  await title.click();
  await page.getByLabel('電路名稱').fill('我的計數器');
  await page.getByLabel('電路名稱').press('Enter');
  await expect(title).toHaveText('我的計數器');
  await title.click();
  await page.getByLabel('電路名稱').fill('不要這個');
  await page.getByLabel('電路名稱').press('Escape');
  await expect(title).toHaveText('我的計數器');
});
