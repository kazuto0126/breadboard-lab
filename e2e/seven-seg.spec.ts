import { expect, test, type Page } from '@playwright/test';

/** 格子座標 → 畫布上的螢幕座標（讀 LogicCanvas 的 viewport）。 */
async function cell(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('logic-canvas').boundingBox())!;
  const v = await page.evaluate(() => (window as unknown as { __logicViewport: () => { x: number; y: number; scale: number } }).__logicViewport());
  return { x: box.x + v.x + x * 20 * v.scale, y: box.y + v.y + y * 20 * v.scale };
}

async function placeAt(page: Page, part: string, x: number, y: number) {
  await page.locator(`[data-logic-part="${part}"]`).click();
  const p = await cell(page, x, y);
  await page.mouse.click(p.x, p.y);
}

async function drag(page: Page, from: string, to: string) {
  const a = (await page.locator(`[data-logic-pin="${from}"]`).boundingBox())!;
  const b = (await page.locator(`[data-logic-pin="${to}"]`).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

test('放一個 7 段顯示器、接 4 個輸入端，撥開關看到數字改變', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('view-switch').getByRole('button', { name: '邏輯圖' }).click();
  await expect(page.getByTestId('logic-canvas')).toBeVisible();

  // A（i1）→ A 腳 … D（i4）→ D 腳
  for (const y of [0, 2, 6, 8]) await placeAt(page, 'INPUT', 0, y);
  await placeAt(page, 'DISPLAY', 10, 2);
  for (let k = 0; k < 4; k++) await drag(page, `i${k + 1}:out`, `d1:in:${k}`);
  await expect(page.locator('[data-logic-wire]')).toHaveCount(4);

  const display = page.locator('[data-logic-display="d1"]');
  await expect(display).toHaveAttribute('data-value', '0');
  await page.locator('[data-logic-switch="i1"]').click(); // A = 1
  await page.locator('[data-logic-switch="i3"]').click(); // C = 1
  await expect(display).toHaveAttribute('data-value', '5');
  await expect(display.locator('[data-lit]')).toHaveCount(5); // 5 = a c d f g

  await page.getByRole('tab', { name: /真值表/ }).click();
  const table = page.getByTestId('truth-table');
  await expect(table.locator('tr[data-row]')).toHaveCount(16);
  // 輸入端依名稱排序（A 是最高位元），所以 A=1、C=1 這一列是 1010。
  await expect(table.locator('tr[data-row="1010"] td').last()).toHaveText('5');
});

test('範例「BCD 顯示」轉成麵包板：74LS47 與 7 段顯示器，比對全部一致', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: 'BCD 顯示（7 段顯示器）' }).click();
  await expect(page.locator('[data-logic-display="d1"]')).toBeVisible();
  await page.getByRole('button', { name: '轉成麵包板…' }).click();
  const dialog = page.getByRole('dialog', { name: '轉成麵包板' });
  await expect(dialog.getByTestId('convert-preview')).toContainText('74LS47 × 1');
  await expect(dialog.getByTestId('convert-preview')).toContainText('7 段顯示器 × 1');
  await dialog.getByRole('button', { name: '轉換' }).click();

  await page.getByRole('tab', { name: /檢查/ }).click();
  await expect(page.getByTestId('conversion-check')).toContainText('16 種輸入組合', { timeout: 120_000 });
  await expect(page.getByTestId('conversion-check')).toContainText('全部一致');
  await expect(page.getByTestId('status')).not.toContainText('Routing', { timeout: 120_000 });
  await expect(page.getByTestId('conversion-check')).toContainText('全部一致');
  await expect(page.locator('g[data-component-id="DS1"]')).toBeVisible();
  await expect(page.locator('[data-label="S1"]')).toHaveCount(1);
});
