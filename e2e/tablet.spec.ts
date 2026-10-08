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

type Pt = { x: number; y: number };

/** 用 CDP 送出單指觸控：按下、依序移動、放開。 */
async function swipe(page: Page, points: Pt[]) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...points[0], id: 0 }] });
  for (const p of points.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...p, id: 0 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('平板：在元件上下滑動可以捲動元件庫，往旁邊拖到麵包板可以放置', async ({ page }) => {
  // 先選取一個元件：捲動元件庫不應該取消選取。
  await page.getByRole('button', { name: '檔案', exact: true }).tap();
  await page.getByRole('menuitem', { name: '74LS00 + LED（驗收電路）' }).tap();
  const body = await center(page, 'g[data-component-id="U1"]');
  await page.touchscreen.tap(body.x, body.y);

  const library = page.getByRole('complementary', { name: '元件庫' });
  await page.getByRole('button', { name: '元件庫', exact: true }).tap();
  await expect(library).toBeVisible();
  const tile = library.locator('[data-library-item="74LS04"]');
  const scrollTop = () =>
    tile.evaluate((el) => {
      let node: HTMLElement | null = el.parentElement;
      while (node && !/(auto|scroll)/.test(getComputedStyle(node).overflowY)) node = node.parentElement;
      return node?.scrollTop ?? -1;
    });
  expect(await scrollTop()).toBe(0);
  const start = await center(page, '[data-library-item="74LS04"]');
  await swipe(page, Array.from({ length: 11 }, (_, i) => ({ x: start.x, y: start.y - i * 25 })));
  await expect(library).toBeVisible();
  await expect.poll(scrollTop).toBeGreaterThan(0);
  // 等慣性捲動停下來（捲動中的第一下點擊會被拿來停止捲動）。
  let last = -1;
  await expect.poll(async () => {
    const now = await scrollTop();
    const settled = now === last;
    last = now;
    return settled;
  }).toBe(true);
  await page.getByRole('button', { name: '資訊', exact: true }).tap();
  await expect(page.getByRole('complementary', { name: '資訊' }).getByText('U1').first()).toBeVisible();
  await page.getByTestId('drawer-backdrop').tap();

  // 往旁邊拖：抽屜收起，放到麵包板上。
  await page.getByRole('button', { name: '元件庫', exact: true }).tap();
  const from = await center(page, '[data-library-item="led-red"]');
  const a = await center(page, '[data-hole="G55"]');
  const b = await center(page, '[data-hole="G56"]');
  const to = { x: (a.x + b.x) / 2, y: a.y };
  await swipe(page, Array.from({ length: 13 }, (_, i) => ({ x: from.x + ((to.x - from.x) * i) / 12, y: from.y + ((to.y - from.y) * Math.max(0, i - 2)) / 10 })));
  await expect(library).toBeHidden();
  await expect(page.locator('g[data-component-id="D2"]')).toHaveCount(1);
});

test('平板：比較畫面上也能打開抽屜；面板外的「顯示…」會打開資訊抽屜', async ({ page }) => {
  await page.getByRole('button', { name: '檔案', exact: true }).tap();
  await page.getByRole('menuitem', { name: '74LS00 + LED（驗收電路）' }).tap();
  const info = page.getByRole('complementary', { name: '資訊' });

  // 狀態列的 Nets：打開資訊抽屜的 Nets 分頁。
  await page.locator('footer').getByRole('button', { name: /Nets/ }).tap();
  await expect(info).toBeVisible();
  await expect(info.getByRole('tab', { name: /Nets/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('drawer-backdrop').tap();
  await expect(info).toBeHidden();

  // 比較畫面：抽屜要蓋在比較畫面上面，點得到。
  await page.getByRole('radio', { name: 'COMPARE' }).tap();
  await expect(page.getByTestId('compare-view')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: '資訊', exact: true }).tap();
  await expect(info).toBeVisible();
  const box = (await info.boundingBox())!;
  const onTop = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest('aside')?.getAttribute('aria-label') ?? null,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(onTop).toBe('資訊');
});

test('平板：工具列的選單都在畫面裡（iPad mini 直放 744 px）', async ({ page }) => {
  await page.setViewportSize({ width: 744, height: 1133 });
  const width = 744;
  for (const name of ['檔案', '編輯', '電路', '自動佈線', '檢視', '說明']) {
    await page.getByRole('button', { name, exact: true }).tap();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    const box = (await menu.boundingBox())!;
    expect(box.x, name).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, name).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  }
});

test('平板：在畫布右下角打開右鍵選單，選單整個留在畫布裡', async ({ page }) => {
  const canvas = (await page.locator('#bbl-board-svg').boundingBox())!;
  // 右下角的縮放按鈕上方、板子下方的空白處。
  const at = { x: canvas.x + canvas.width - 20, y: canvas.y + canvas.height - 90 };
  await page.mouse.click(at.x, at.y, { button: 'right' });
  const menu = page.getByTestId('context-menu');
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(canvas.x);
  expect(box.y).toBeGreaterThanOrEqual(canvas.y);
  expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width);
  expect(box.y + box.height).toBeLessThanOrEqual(canvas.y + canvas.height);
  // 放不下時翻到指標的左邊 / 上面，仍然貼著指標。
  expect(box.x + box.width).toBeLessThanOrEqual(at.x + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(at.y + 1);
  await expect(menu.getByRole('button', { name: 'AI 標準佈線' })).toBeVisible();
});

test('平板橫放、扣掉瀏覽器網址列（1133 × 660）：最長的選單與說明對話框都在畫面裡，可以捲到最後一項', async ({ page }) => {
  await page.setViewportSize({ width: 1133, height: 660 });
  const height = 660;
  await page.getByRole('button', { name: '檔案', exact: true }).tap();
  const menu = page.getByRole('menu');
  const box = (await menu.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(height);
  const last = menu.getByRole('menuitem').last();
  await last.scrollIntoViewIfNeeded();
  const item = (await last.boundingBox())!;
  expect(item.y + item.height).toBeLessThanOrEqual(height);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: '說明', exact: true }).tap();
  await page.getByRole('menuitem').first().tap();
  const dialog = page.getByRole('dialog');
  const d = (await dialog.boundingBox())!;
  expect(d.y).toBeGreaterThanOrEqual(0);
  expect(d.y + d.height).toBeLessThanOrEqual(height);
  await expect(dialog.getByRole('button', { name: '關閉' })).toBeInViewport();
});
