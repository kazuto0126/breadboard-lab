import { expect, test } from '@playwright/test';

/** 子專案 43（規格 2026-10-24 share-link）：複製連結，在新分頁點開看到同一個電路；有未儲存的修改時先問。 */
test('複製連結：新分頁點開看到同一個電路，網址的 #c= 會拿掉；有未儲存的修改時先問', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: '多數決電路（圖 2-5）' }).click();
  await expect(page.locator('[data-logic-node]')).toHaveCount(8);
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: /複製連結/ }).click();
  await expect(page.getByText(/已複製連結。連結有 \d+ 個字。/)).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/^http:\/\/localhost:\d+\/#c=[A-Za-z0-9_-]+$/);

  // 新分頁（另一個瀏覽器設定檔，沒有自動儲存的電路）：直接開啟。
  const other = await context.browser()!.newContext();
  const fresh = await other.newPage();
  await fresh.goto(link);
  await expect(fresh.getByText('已從連結開啟「多數決電路（圖 2-5）」')).toBeVisible();
  await fresh.getByTestId('view-switch').getByRole('button', { name: '邏輯圖' }).click();
  await expect(fresh.locator('[data-logic-node]')).toHaveCount(8);
  expect(new URL(fresh.url()).hash).toBe('');

  // 先改一下（未儲存），再點連結：先問；取消時電路不變。
  await fresh.getByRole('button', { name: '檔案', exact: true }).click();
  await fresh.getByRole('menuitem', { name: '新電路 New Circuit' }).click();
  await fresh.getByTestId('view-switch').getByRole('button', { name: '邏輯圖' }).click();
  await fresh.locator('[data-logic-part="INPUT"]').click();
  await fresh.getByTestId('logic-canvas').click({ position: { x: 200, y: 200 } });
  await expect(fresh.locator('[data-logic-node]')).toHaveCount(1);
  await fresh.evaluate((href) => (window.location.href = href), link);
  const dialog = fresh.getByRole('dialog', { name: '開啟連結裡的電路？' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(fresh.locator('[data-logic-node]')).toHaveCount(1);
  await fresh.evaluate((href) => (window.location.href = href), link);
  await fresh.getByRole('dialog', { name: '開啟連結裡的電路？' }).getByRole('button', { name: '不儲存，開啟連結' }).click();
  await expect(fresh.locator('[data-logic-node]')).toHaveCount(8);
  await other.close();
});

test('連結被截斷時說明原因，不動目前的電路', async ({ page }) => {
  await page.goto('/#c=@@@');
  await expect(page.getByText('連結裡的電路讀不出來（連結不完整，可能被截斷了）')).toBeVisible();
});
