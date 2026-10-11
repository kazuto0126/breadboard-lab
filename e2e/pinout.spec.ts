import { expect, test, type Page } from '@playwright/test';

async function centerOf(page: Page, selector: string) {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`${selector} is not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('點 IC 會在屬性面板最上面顯示腳位圖，點圖上的腳會選取那隻腳', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '關閉' }).first().click();
  await page.getByPlaceholder(/搜尋/).fill('74LS47');
  const from = await centerOf(page, '[data-library-item="74LS47"]');
  const e = await centerOf(page, '[data-hole="E20"]');
  const f = await centerOf(page, '[data-hole="F20"]');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y, { steps: 3 });
  await page.mouse.move((e.x + f.x) / 2, (e.y + f.y) / 2, { steps: 10 });
  await page.mouse.up();

  const pinout = page.getByTestId('pinout');
  await expect(pinout).toContainText('74LS47 腳位圖');
  await expect(pinout).toContainText('VCC');
  await expect(pinout).toContainText('缺口在左');
  await page.getByTestId('pinout-pin-8').click();
  await expect(page.getByTestId('pinout-pin-8')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('U1 腳 8').first()).toBeVisible();
});
