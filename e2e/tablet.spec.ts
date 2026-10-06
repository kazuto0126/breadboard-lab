import { expect, test, type Locator, type Page } from '@playwright/test';

/** 直放的平板（820 × 1180、觸控）：左右面板收成抽屜，所有可以點的東西至少 44 × 44 px。 */
test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true });

/** 範圍內小於 44 × 44 px 的按鈕、分頁、選單項目、輸入框；勾選框以包住它的 label 為點擊範圍。 */
async function smallTargets(scope: Locator): Promise<string[]> {
  return scope.evaluate((root) => {
    const found: string[] = [];
    for (const el of root.querySelectorAll<HTMLElement>('button, select, input, [role="tab"], [role="menuitem"]')) {
      const target = el instanceof HTMLInputElement && el.type === 'checkbox' ? (el.closest('label') ?? el) : el;
      const r = target.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.width < 44 || r.height < 44) {
        const name = el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '';
        found.push(`${el.tagName.toLowerCase()}「${name}」${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    return found;
  });
}

async function center(page: Page, selector: string) {
  const box = (await page.locator(selector).first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('[data-hole]')).toHaveCount(830);
});

test('平板：抽屜式元件庫與資訊面板，點選放置元件，按鈕都夠大', async ({ page }) => {
  const library = page.getByRole('complementary', { name: '元件庫' });
  const info = page.getByRole('complementary', { name: '資訊' });
  await expect(library).toBeHidden();
  await expect(info).toBeHidden();
  expect(await smallTargets(page.locator('header'))).toEqual([]);

  // 打開元件庫：按鈕、分類、搜尋框都夠大；點一個元件後抽屜自動收起，再點麵包板放置。
  await page.getByRole('button', { name: '元件庫', exact: true }).tap();
  await expect(library).toBeVisible();
  expect(await smallTargets(library)).toEqual([]);
  await page.locator('[data-library-item="led-red"]').tap();
  await expect(library).toBeHidden();
  const a = await center(page, '[data-hole="G40"]');
  const b = await center(page, '[data-hole="G41"]');
  await page.touchscreen.tap((a.x + b.x) / 2, a.y);
  await expect(page.locator('g[data-component-id="D1"]')).toHaveCount(1);

  // 資訊面板：選取的元件可以直接修改；點旁邊的暗色區域關閉。
  await page.getByRole('button', { name: '資訊', exact: true }).tap();
  await expect(info).toBeVisible();
  await expect(info.getByLabel('LED 顏色')).toBeVisible();
  expect(await smallTargets(info)).toEqual([]);
  await page.getByTestId('drawer-backdrop').tap();
  await expect(info).toBeHidden();
});

test('平板：選單、接線清單的勾選框與狀態列也夠大', async ({ page }) => {
  await page.getByRole('button', { name: '檔案', exact: true }).tap();
  expect(await smallTargets(page.getByRole('menu'))).toEqual([]);
  await page.getByRole('menuitem', { name: '74LS00 + LED（驗收電路）' }).tap();
  await page.getByRole('button', { name: '⚡ AI 標準佈線' }).tap();
  await expect(page.getByTestId('routing-result')).toContainText('Standard Routing Complete', { timeout: 20_000 });

  await page.getByRole('button', { name: '資訊', exact: true }).tap();
  const info = page.getByRole('complementary', { name: '資訊' });
  await info.getByRole('tab', { name: /接線清單/ }).tap();
  await expect(info.getByRole('checkbox').first()).toBeVisible();
  expect(await smallTargets(info)).toEqual([]);
  await info.getByRole('checkbox').first().tap();
  await expect(page.getByTestId('checklist-progress')).toHaveText(/已完成 1 \//);
  expect(await smallTargets(page.locator('footer'))).toEqual([]);
});

/** 主畫布上的 b1 板子佔畫布寬度的比例，以及是否整塊都在畫布裡。 */
async function boardFit(page: Page) {
  const svg = page.locator('svg', { has: page.locator('[data-hole]') }).first();
  const canvas = (await svg.boundingBox())!;
  const board = (await svg.locator('[data-board="b1"]').first().boundingBox())!;
  const inside =
    board.x >= canvas.x - 0.5 &&
    board.y >= canvas.y - 0.5 &&
    board.x + board.width <= canvas.x + canvas.width + 0.5 &&
    board.y + board.height <= canvas.y + canvas.height + 0.5;
  return { fill: board.width / canvas.width, inside };
}

test('平板轉向：還沒自己縮放時整塊板子重新符合畫面，縮放過就保留', async ({ page }) => {
  expect(await boardFit(page)).toMatchObject({ inside: true });
  expect((await boardFit(page)).fill).toBeGreaterThan(0.85);

  // 橫放（≥ 1024 px，兩側面板回到版面裡、畫布變窄變矮）：重新 Fit，整塊板子仍在畫面裡、填滿寬度。
  await page.setViewportSize({ width: 1180, height: 820 });
  await expect.poll(async () => (await boardFit(page)).inside).toBe(true);
  await expect.poll(async () => (await boardFit(page)).fill).toBeGreaterThan(0.85);

  // 自己放大之後再轉回直放：保留使用者的縮放。
  await page.getByTitle('放大（+）').tap();
  const zoom = await page.getByTestId('zoom').textContent();
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.waitForTimeout(200);
  await expect(page.getByTestId('zoom')).toHaveText(zoom!);
});
