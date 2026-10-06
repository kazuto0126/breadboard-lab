import { expect, test, type Locator, type Page } from '@playwright/test';
import { cellSize, components, holeCenter, importFixture, midpoint, openEditor, wires, type Pt } from './helpers';

/** 規格第 12 節：寬度 < 1024 px 時可點擊元素至少 44 × 44 px；勾選框以包住它的 label 為點擊範圍。 */
async function smallTargets(scope: Locator): Promise<string[]> {
  return scope.evaluate((root) => {
    const found: string[] = [];
    for (const el of root.querySelectorAll<HTMLElement>('button, select, input, [role="tab"]')) {
      const target = el instanceof HTMLInputElement && el.type === 'checkbox' ? (el.closest('label') ?? el) : el;
      const r = target.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.width < 44 || r.height < 44) {
        const name = el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '';
        found.push(`${el.tagName.toLowerCase()} 「${name}」 ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    return found;
  });
}

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

test('平板：接線清單的勾選框、屬性欄位、搜尋框與對話框也夠大', async ({ page }) => {
  await openEditor(page);
  await importFixture(page, 'acceptance.breadboard.json');
  await page.getByRole('button', { name: 'AI 標準佈線' }).tap();
  await expect(page.getByText('Standard Routing Complete')).toBeVisible();

  await page.getByRole('button', { name: '資訊' }).tap();
  const info = page.getByRole('complementary', { name: '資訊' });
  await expect(info.getByRole('checkbox').first()).toBeVisible();
  expect(await smallTargets(info)).toEqual([]);

  const resistor = await holeCenter(page, 'G32');
  await page.touchscreen.tap(resistor.x, resistor.y);
  await expect(info.getByLabel('電阻值')).toBeVisible();
  expect(await smallTargets(info)).toEqual([]);

  await page.getByRole('button', { name: '元件庫' }).tap();
  expect(await smallTargets(page.getByRole('complementary', { name: '元件庫' }))).toEqual([]);

  await page.getByRole('button', { name: '檔案' }).tap();
  await page.getByRole('menuitem', { name: '另存新檔' }).tap();
  await expect(page.getByLabel('名稱')).toBeVisible();
  expect(await smallTargets(page.getByRole('dialog'))).toEqual([]);
});
