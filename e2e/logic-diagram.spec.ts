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

test('畫出圖 2-5：真值表正確、撥開關看輸出、存檔再開圖還在', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('view-switch').getByRole('button', { name: '邏輯圖' }).click();
  await expect(page.getByTestId('logic-canvas')).toBeVisible();

  await placeAt(page, 'INPUT', 0, 2);
  await placeAt(page, 'INPUT', 0, 4);
  await placeAt(page, 'INPUT', 0, 10);
  await placeAt(page, 'AND', 12, 1);
  await placeAt(page, 'AND', 12, 8);
  await placeAt(page, 'AND', 12, 15);
  await placeAt(page, 'OR', 22, 8);
  await page.getByRole('button', { name: '輸入數 3' }).click(); // 剛放的 OR 被選取：輸入數改 3
  await placeAt(page, 'OUTPUT', 30, 9);

  for (const [from, to] of [
    ['i1:out', 'g1:in:0'], ['i2:out', 'g1:in:1'],
    ['i1:out', 'g2:in:0'], ['i3:out', 'g2:in:1'],
    ['i2:out', 'g3:in:0'], ['i3:out', 'g3:in:1'],
    ['g1:out', 'g4:in:0'], ['g2:out', 'g4:in:1'], ['g3:out', 'g4:in:2'],
    ['g4:out', 'o1:in:0'],
  ]) await drag(page, from, to);
  await expect(page.locator('[data-logic-wire]')).toHaveCount(10);

  await page.getByRole('tab', { name: /真值表/ }).click();
  const table = page.getByTestId('truth-table');
  await expect(table.locator('tr[data-row]')).toHaveCount(8);
  await expect(table.locator('tr[data-row="011"] td').last()).toHaveText('1');
  await expect(table.locator('tr[data-row="100"] td').last()).toHaveText('0');

  await page.locator('[data-logic-switch="i1"]').click();
  await page.locator('[data-logic-switch="i2"]').click();
  await expect(page.locator('[data-logic-lamp="o1"]')).toHaveText('1');
  await expect(table.locator('tr[data-row="110"]')).toHaveAttribute('aria-current', 'true');
  await table.locator('tr[data-row="000"]').click();
  await expect(page.locator('[data-logic-lamp="o1"]')).toHaveText('0');

  // 自動暫存在修改後 0.4 秒寫入：等邏輯圖寫進 localStorage 再重新整理。
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('breadboard-lab:autosave') ?? 'null')?.logic?.wires?.length ?? 0))
    .toBe(10);
  await page.reload();
  await page.getByTestId('view-switch').getByRole('button', { name: '邏輯圖' }).click();
  await expect(page.locator('[data-logic-wire]')).toHaveCount(10);
});

test('範例「多數決電路（圖 2-5）」載入到邏輯圖', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: '多數決電路（圖 2-5）' }).click();
  await expect(page.locator('[data-logic-node]')).toHaveCount(8);
  await page.getByRole('tab', { name: /檢查/ }).click();
  await expect(page.getByText('沒有發現問題')).toBeVisible();
});

test('框選多個元件一起移動、複製貼上，重新整理後仍在邏輯圖', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: '多數決電路（圖 2-5）' }).click();
  await expect(page.locator('[data-logic-node]')).toHaveCount(8);

  // Shift 拖曳框住 A、B、C 三個輸入端（x −1～3、y 1～11）。
  const a = await cell(page, -1.5, 1);
  const b = await cell(page, 3, 11);
  await page.keyboard.down('Shift');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.getByText('已選取 3 個元件')).toBeVisible();

  // 拖曳其中一個：整組往左移 2 格。
  const before = await page.locator('[data-logic-node="i3"]').getAttribute('transform');
  const from = await cell(page, -0.5, 4);
  const to = await cell(page, -2.5, 4);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('[data-logic-node="i3"]')).not.toHaveAttribute('transform', before!);

  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(page.locator('[data-logic-node]')).toHaveCount(11);
  await expect(page.getByText('已選取 3 個元件')).toBeVisible();

  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('breadboard-lab:autosave') ?? 'null')?.logic?.nodes?.length ?? 0)).toBe(11);
  await page.reload();
  await expect(page.locator('[data-logic-node]')).toHaveCount(11);
  await expect(page.getByTestId('view-switch').getByRole('button', { name: '邏輯圖' })).toHaveAttribute('aria-pressed', 'true');
});
