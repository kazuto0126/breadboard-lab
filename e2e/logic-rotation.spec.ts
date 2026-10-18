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

const centerX = async (page: Page, pin: string) => {
  const b = (await page.locator(`[data-logic-pin="${pin}"]`).boundingBox())!;
  return b.x + b.width / 2;
};

test('邏輯閘轉向：按 R 轉 90°、屬性面板選方向，接線後真值表不變，可以 Undo', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('view-switch').getByRole('button', { name: '邏輯圖' }).click();
  await expect(page.getByTestId('logic-canvas')).toBeVisible();

  await placeAt(page, 'AND', 12, 4);
  const gate = page.locator('[data-logic-node="g1"]');
  await expect(gate).toHaveAttribute('data-rotation', '0');
  // 選取（點本體），按兩次 R：轉 180°，輸入腳換到右邊、輸出腳在左邊。
  const body = (await gate.boundingBox())!;
  await page.mouse.click(body.x + body.width / 2, body.y + body.height / 2);
  await page.keyboard.press('r');
  await expect(gate).toHaveAttribute('data-rotation', '90');
  await page.keyboard.press('r');
  await expect(gate).toHaveAttribute('data-rotation', '180');
  expect(await centerX(page, 'g1:in:0')).toBeGreaterThan(await centerX(page, 'g1:out'));

  // 屬性面板的方向按鈕。
  await page.getByRole('tab', { name: '屬性' }).click();
  await page.getByRole('button', { name: '輸出朝上' }).click();
  await expect(gate).toHaveAttribute('data-rotation', '270');
  await page.getByRole('button', { name: '輸出朝右' }).click();
  await expect(gate).toHaveAttribute('data-rotation', '0');
  await page.getByRole('button', { name: '輸出朝左' }).click();
  await expect(gate).toHaveAttribute('data-rotation', '180');

  // 轉 180° 的 AND 也照常接線：A、B 接到右邊的輸入腳，輸出接到 X。
  await placeAt(page, 'INPUT', 0, 0);
  await placeAt(page, 'INPUT', 0, 10);
  await placeAt(page, 'OUTPUT', 0, 16);
  await drag(page, 'i1:out', 'g1:in:0');
  await drag(page, 'i2:out', 'g1:in:1');
  await drag(page, 'g1:out', 'o1:in:0');
  await expect(page.locator('[data-logic-wire]')).toHaveCount(3);
  await page.getByRole('tab', { name: /真值表/ }).click();
  const table = page.getByTestId('truth-table');
  await expect(table.locator('tr[data-row="11"] td').last()).toHaveText('1');
  await expect(table.locator('tr[data-row="10"] td').last()).toHaveText('0');

  // Undo 10 次：3 條線、放 3 個元件、3 次設定方向、第 2 次按 R → 回到第 1 次按 R 之後（90°）。
  for (let k = 0; k < 10; k++) await page.keyboard.press('Control+z');
  await expect(page.locator('[data-logic-wire]')).toHaveCount(0);
  await expect(gate).toHaveAttribute('data-rotation', '90');
});

test('放置前按 R 先轉好、M 鏡射，輸入端也能轉而且名稱正著寫', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('view-switch').getByRole('button', { name: '邏輯圖' }).click();
  await expect(page.getByTestId('logic-canvas')).toBeVisible();

  // 點元件庫的 AND，按 R，再點畫布：放下去就是轉 90°。
  await page.locator('[data-logic-part="AND"]').click();
  await page.keyboard.press('r');
  const p = await cell(page, 12, 4);
  await page.mouse.click(p.x, p.y);
  const gate = page.locator('[data-logic-node="g1"]');
  await expect(gate).toHaveAttribute('data-rotation', '90');

  // 選取後按 M 鏡射；屬性面板的「左右鏡射」再按一次取消。
  const body = (await gate.boundingBox())!;
  await page.mouse.click(body.x + body.width / 2, body.y + body.height / 2);
  await page.keyboard.press('m');
  await expect(gate).toHaveAttribute('data-flip', 'true');
  await page.getByRole('tab', { name: '屬性' }).click();
  await page.getByRole('button', { name: '左右鏡射' }).click();
  await expect(gate).not.toHaveAttribute('data-flip', 'true');

  // 輸入端轉 90°：輸出腳朝下，名稱正著寫（文字有轉回來的 transform）。
  await placeAt(page, 'INPUT', 0, 0);
  const input = page.locator('[data-logic-node="i1"]');
  const box = (await input.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height / 2);
  await page.keyboard.press('r');
  await expect(input).toHaveAttribute('data-rotation', '90');
  await expect(input.locator('text', { hasText: 'A' }).first()).toHaveAttribute('transform', /rotate\(-90\)/);
});
