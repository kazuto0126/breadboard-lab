import { expect, test, type Page } from '@playwright/test';

/** 平板（觸控）：點一下放元件、手指拖曳接線、兩指縮放。用 Chromium 的 CDP 送出真正的觸控事件。 */
test.use({ viewport: { width: 1366, height: 1024 }, hasTouch: true });

type Pt = { x: number; y: number };

async function center(page: Page, selector: string): Promise<Pt> {
  const box = (await page.locator(selector).first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
const hole = (page: Page, name: string) => center(page, `[data-hole="${name}"]`);

/** 依序送出觸控事件；每一步是當下所有手指的位置（空陣列 = 全部放開）。 */
async function touch(page: Page, steps: Array<{ type: 'touchStart' | 'touchMove' | 'touchEnd'; points: Pt[] }>) {
  const cdp = await page.context().newCDPSession(page);
  for (const step of steps) {
    await cdp.send('Input.dispatchTouchEvent', { type: step.type, touchPoints: step.points.map((p, id) => ({ x: p.x, y: p.y, id })) });
  }
  await cdp.detach();
}

async function zoom(page: Page): Promise<number> {
  return Number((await page.getByTestId('zoom').textContent())!.replace('%', ''));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('[data-hole]')).toHaveCount(830);
  await page.getByRole('button', { name: '關閉' }).first().tap();
});

test('平板：點元件庫再點麵包板放置、手指拖曳接線、兩指縮放', async ({ page }) => {
  // 點一下元件庫的紅色 LED，再點麵包板上的位置（放開時才放置）。
  await page.locator('[data-library-item="led-red"]').tap();
  const a = await hole(page, 'G40');
  const b = await hole(page, 'G41');
  await page.touchscreen.tap((a.x + b.x) / 2, a.y);
  await expect(page.locator('g[data-component-id="D1"]')).toHaveCount(1);

  // 手指從空孔拖到另一個空孔：先往水平方向動，決定 L 形的轉角。
  const from = await hole(page, 'A45');
  const to = await hole(page, 'A50');
  const steps = Array.from({ length: 8 }, (_, i) => ({ x: from.x + ((to.x - from.x) * (i + 1)) / 8, y: from.y }));
  await touch(page, [
    { type: 'touchStart', points: [from] },
    ...steps.map((p) => ({ type: 'touchMove' as const, points: [p] })),
    { type: 'touchEnd', points: [] },
  ]);
  await expect(page.getByTestId('wire-count')).toHaveText('1');

  // 兩指在板子下方的空白處張開：距離變兩倍，縮放也變約兩倍，不會多出導線或移動元件。
  const canvas = (await page.locator('#bbl-board-svg').boundingBox())!;
  const mid = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height * 0.85 };
  const before = await zoom(page);
  const spread = (d: number) => [
    { x: mid.x - d / 2, y: mid.y },
    { x: mid.x + d / 2, y: mid.y },
  ];
  await touch(page, [
    { type: 'touchStart', points: spread(100) },
    ...[120, 140, 160, 180, 200].map((d) => ({ type: 'touchMove' as const, points: spread(d) })),
    { type: 'touchEnd', points: [] },
  ]);
  const after = await zoom(page);
  expect(after / before).toBeGreaterThan(1.8);
  expect(after / before).toBeLessThan(2.2);
  await expect(page.getByTestId('wire-count')).toHaveText('1');
  await expect(page.locator('g[data-component-id]')).toHaveCount(1);
});

test('平板：拿著元件時用一指平移畫面，放開不會誤放', async ({ page }) => {
  await page.locator('[data-library-item="74LS00"]').tap();
  const canvas = (await page.locator('#bbl-board-svg').boundingBox())!;
  const start = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height * 0.85 };
  const svgTransform = () => page.locator('[data-viewport]').getAttribute('transform');
  const before = await svgTransform();
  await touch(page, [
    { type: 'touchStart', points: [start] },
    ...[20, 40, 60, 80].map((dy) => ({ type: 'touchMove' as const, points: [{ x: start.x, y: start.y - dy }] })),
    { type: 'touchEnd', points: [] },
  ]);
  expect(await svgTransform()).not.toBe(before);
  await expect(page.locator('g[data-component-id]')).toHaveCount(0);
});
