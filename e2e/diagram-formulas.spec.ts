import { expect, test, type Page } from '@playwright/test';

/** 子專案 40（規格 2026-10-23 diagram-formulas）：自己畫的邏輯圖顯示布林式。 */

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

test('畫 NAND：真值表分頁列出照圖寫出來與化簡後的式子，可以顯示在圖上，選取輸出端也看得到', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('view-switch').getByRole('button', { name: '邏輯圖' }).click();
  await expect(page.getByTestId('logic-canvas')).toBeVisible();

  await placeAt(page, 'INPUT', 0, 2);
  await placeAt(page, 'INPUT', 0, 5);
  await placeAt(page, 'NAND', 10, 3);
  await placeAt(page, 'OUTPUT', 18, 4);
  for (const [from, to] of [['i1:out', 'g1:in:0'], ['i2:out', 'g1:in:1'], ['g1:out', 'o1:in:0']]) await drag(page, from, to);
  await expect(page.locator('[data-logic-wire]')).toHaveCount(3);

  await page.getByRole('tab', { name: /真值表/ }).click();
  const formulas = page.getByTestId('formulas');
  await expect(formulas.locator('[data-read]')).toHaveAttribute('data-read', "(AB)'");
  await expect(formulas.locator('[data-simplified]')).toHaveAttribute('data-simplified', "A' + B'");

  await expect(page.locator('[data-logic-formula]')).toHaveCount(0);
  await formulas.getByLabel('在圖上顯示').check();
  await expect(page.locator('[data-logic-formula="o1"]')).toHaveText(/= \(AB\)'$/);
  await formulas.getByLabel('在圖上顯示').uncheck();
  await expect(page.locator('[data-logic-formula]')).toHaveCount(0);

  await page.getByRole('tab', { name: /屬性/ }).click();
  await page.locator('[data-logic-node="o1"]').click();
  await expect(page.getByTestId('output-formula').locator('[data-read]')).toHaveAttribute('data-read', "(AB)'");
});
