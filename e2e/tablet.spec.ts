import { expect, test, type Page } from '@playwright/test';
import { cellSize, components, holeCenter, midpoint, openEditor, wires, type Pt } from './helpers';

test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true });

/** 用 Chromium 的觸控事件拖曳（先往水平方向動，決定 L 形的轉角）。 */
async function touchDrag(page: Page, from: Pt, to: Pt, cell: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: Pt) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
  await send('touchStart', from);
  const dir = Math.abs(to.x - from.x) < 1 ? 0 : Math.sign(to.x - from.x);
  const first = dir === 0 ? { x: from.x, y: from.y + Math.sign(to.y - from.y) * cell * 0.8 } : { x: from.x + dir * cell * 0.8, y: from.y };
  await send('touchMove', first);
  for (let i = 1; i <= 8; i++) await send('touchMove', { x: first.x + ((to.x - first.x) * i) / 8, y: first.y + ((to.y - first.y) * i) / 8 });
  await send('touchEnd');
  await cdp.detach();
}

test('平板：按鈕夠大，可以用觸控放置元件與接線', async ({ page }) => {
  await openEditor(page);

  for (const button of await page.locator('header button').all()) {
    const box = await button.boundingBox();
    expect(box, (await button.getAttribute('aria-label')) ?? (await button.textContent()) ?? '').not.toBeNull();
    expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44);
  }

  await page.getByRole('button', { name: '元件庫' }).tap();
  await page.locator('[data-part="led-red"]').tap();
  await expect(page.getByRole('complementary', { name: '元件庫' })).toBeHidden();
  const led = midpoint(await holeCenter(page, 'G40'), await holeCenter(page, 'G41'));
  await page.touchscreen.tap(led.x, led.y);
  await expect(components(page)).toHaveCount(1);

  await touchDrag(page, await holeCenter(page, 'A45'), await holeCenter(page, 'A50'), await cellSize(page));
  await expect(wires(page)).toHaveCount(1);
  await expect(page.getByText('導線 1', { exact: true })).toBeVisible();
});
