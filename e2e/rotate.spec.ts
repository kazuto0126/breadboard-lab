import { expect, test, type Page } from '@playwright/test';

/** 子專案 56：在麵包板上轉元件（按 R、右鍵「旋轉 90°」）；轉回原本的方向時要在原本的位置。 */
async function centerOf(page: Page, selector: string) {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`${selector} is not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
const hole = (page: Page, name: string) => centerOf(page, `[data-hole="${name}"]`);
const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

async function dragFromLibrary(page: Page, key: string, target: { x: number; y: number }) {
  const from = await centerOf(page, `[data-library-item="${key}"]`);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y, { steps: 3 });
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await page.mouse.up();
}

async function led(page: Page) {
  await page.waitForTimeout(600); // 自動儲存有 400 ms 的延遲。
  const c = await page.evaluate(() => JSON.parse(localStorage.getItem('breadboard-lab:autosave') ?? 'null')?.circuit);
  const d = c.components.find((x: { id: string }) => x.id === 'D1');
  return `${d.rotation}@${d.anchor.x},${d.anchor.y}`;
}

test('LED 按 R 轉一圈回到原位，右鍵「旋轉 90°」也一樣', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('[data-hole]')).toHaveCount(830);
  await page.getByRole('button', { name: '關閉' }).first().click();
  await dragFromLibrary(page, 'led-red', mid(await hole(page, 'C40'), await hole(page, 'C41')));
  const start = await led(page);
  expect(start).toMatch(/^0@/);

  const seen: string[] = [];
  for (let k = 0; k < 4; k++) {
    const body = await centerOf(page, 'g[data-component-id="D1"]');
    await page.mouse.click(body.x, body.y);
    await page.keyboard.press('r');
    seen.push(await led(page));
  }
  expect(seen.map((s) => s.split('@')[0])).toEqual(['90', '180', '270', '0']);
  expect(seen[3]).toBe(start);

  const body = await centerOf(page, 'g[data-component-id="D1"]');
  await page.mouse.click(body.x, body.y, { button: 'right' });
  await page.getByTestId('context-menu').getByText('旋轉 90°（Rotate）').click();
  expect(await led(page)).toBe(seen[0]);
});
