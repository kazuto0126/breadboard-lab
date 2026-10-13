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

test('放 74LS138 方塊、5V 與 GND，接好後輸出照解碼表變化', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('view-switch').getByRole('button', { name: '邏輯圖' }).click();

  await placeAt(page, 'HIGH', 0, 0); // k1
  await placeAt(page, 'LOW', 0, 3); // k2
  await placeAt(page, 'BLOCK:74LS138', 8, 0); // b1：A B C G1 /G2A /G2B
  // A = 1、B = 1、C = 0、G1 = 1、/G2A = /G2B = 0 → 只有 /Y3 = 0
  for (const [from, pin] of [['k1', 0], ['k1', 1], ['k2', 2], ['k1', 3], ['k2', 4], ['k2', 5]] as const) await drag(page, `${from}:out`, `b1:in:${pin}`);
  await expect(page.locator('[data-logic-wire]')).toHaveCount(6);
  const out = (k: number) => page.locator(`[data-logic-out="b1:${k}"]`);
  await expect(out(3)).toHaveAttribute('data-value', '0');
  for (const k of [0, 1, 2, 4, 5, 6, 7]) await expect(out(k)).toHaveAttribute('data-value', '1');

  // 方塊的輸出接到輸出端
  await placeAt(page, 'OUTPUT', 20, 3); // o1
  await drag(page, 'b1:out:3', 'o1:in:0');
  await expect(page.locator('[data-logic-lamp="o1"]')).toHaveText('0');
});

test('範例「2 位元加法器（74LS83 方塊）」轉成麵包板，比對全部一致', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: '2 位元加法器（74LS83 方塊）' }).click();
  await expect(page.locator('[data-logic-block="b1"]')).toBeVisible();
  await page.getByRole('tab', { name: /真值表/ }).click();
  // A1 A2 B1 B2 = 1 1 1 1 → 3 + 3 = 6 → S1 S2 S3 = 0 1 1
  await expect(page.getByTestId('truth-table').locator('tr[data-row="1111"] td').nth(4)).toHaveText('0');
  await expect(page.getByTestId('truth-table').locator('tr[data-row="1111"] td').nth(5)).toHaveText('1');
  await expect(page.getByTestId('truth-table').locator('tr[data-row="1111"] td').nth(6)).toHaveText('1');

  await page.getByRole('tab', { name: '屬性' }).click();
  await page.getByRole('button', { name: '轉成麵包板…' }).click();
  const dialog = page.getByRole('dialog', { name: '轉成麵包板' });
  await expect(dialog.getByTestId('convert-preview')).toContainText('74LS83 × 1');
  await dialog.getByRole('button', { name: '轉換' }).click();
  await page.getByRole('tab', { name: /檢查/ }).click();
  await expect(page.getByTestId('conversion-check')).toContainText('16 種輸入組合', { timeout: 120_000 });
  await expect(page.getByTestId('status')).not.toContainText('Routing', { timeout: 120_000 });
  await expect(page.getByTestId('conversion-check')).toContainText('全部一致');
});
