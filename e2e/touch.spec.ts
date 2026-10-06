import { expect, test, type Page } from '@playwright/test';

/** 平板（觸控）：點一下放元件、手指拖曳接線、兩指縮放。用 Chromium 的 CDP 送出真正的觸控事件。 */
test.use({ viewport: { width: 1366, height: 1024 }, hasTouch: true });

/** id 省略時用陣列順序；同一根手指在整個手勢中要用同一個 id。 */
type Pt = { x: number; y: number; id?: number };

async function center(page: Page, selector: string): Promise<Pt> {
  const box = (await page.locator(selector).first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
const hole = (page: Page, name: string) => center(page, `[data-hole="${name}"]`);

/**
 * 依序送出觸控事件。touchStart / touchMove 是當下所有手指的位置（沒列出的手指不動）；
 * touchEnd 列出的手指放開，空陣列 = 全部放開。
 */
async function touch(page: Page, steps: Array<{ type: 'touchStart' | 'touchMove' | 'touchEnd'; points: Pt[] }>) {
  const cdp = await page.context().newCDPSession(page);
  for (const step of steps) {
    await cdp.send('Input.dispatchTouchEvent', { type: step.type, touchPoints: step.points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })) });
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
  // 從一個點一下就能放置的位置（跨過中間溝槽）開始滑。
  const spot = async () => {
    const e = await hole(page, 'E20');
    const f = await hole(page, 'F20');
    return { x: (e.x + f.x) / 2, y: (e.y + f.y) / 2 };
  };
  const start = await spot();
  const svgTransform = () => page.locator('[data-viewport]').getAttribute('transform');
  const before = await svgTransform();
  await touch(page, [
    { type: 'touchStart', points: [start] },
    ...[20, 40, 60, 80].map((dy) => ({ type: 'touchMove' as const, points: [{ x: start.x, y: start.y - dy }] })),
    { type: 'touchEnd', points: [] },
  ]);
  expect(await svgTransform()).not.toBe(before);
  await expect(page.locator('g[data-component-id]')).toHaveCount(0);
  await expect(page.getByText('這裡放不下')).toHaveCount(0);

  // 對照：在同一個位置點一下就會放置。
  const here = await spot();
  await page.touchscreen.tap(here.x, here.y);
  await expect(page.locator('g[data-component-id="U1"]')).toHaveCount(1);
});

test('平板：兩指手勢結束時另一指在畫布外放開，之後單指接線仍正常', async ({ page }) => {
  const canvas = (await page.locator('#bbl-board-svg').boundingBox())!;
  const mid = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height * 0.85 };
  const zoomBox = (await page.getByTestId('zoom').boundingBox())!;
  const onZoom = { x: zoomBox.x + zoomBox.width / 2, y: zoomBox.y + zoomBox.height / 2, id: 1 };
  // 兩指張開；先放開第 0 指，第 1 指滑到縮放數字上才放開（不在 svg 上）。
  await touch(page, [
    { type: 'touchStart', points: [{ x: mid.x - 50, y: mid.y, id: 0 }, { x: mid.x + 50, y: mid.y, id: 1 }] },
    { type: 'touchMove', points: [{ x: mid.x - 80, y: mid.y, id: 0 }, { x: mid.x + 80, y: mid.y, id: 1 }] },
    { type: 'touchEnd', points: [{ x: mid.x - 80, y: mid.y, id: 0 }] },
    { type: 'touchMove', points: [{ x: (mid.x + onZoom.x) / 2, y: (mid.y + onZoom.y) / 2, id: 1 }] },
    { type: 'touchMove', points: [onZoom] },
    { type: 'touchEnd', points: [] },
  ]);

  const from = await hole(page, 'A45');
  const to = await hole(page, 'A50');
  await touch(page, [
    { type: 'touchStart', points: [from] },
    ...Array.from({ length: 8 }, (_, i) => ({ type: 'touchMove' as const, points: [{ x: from.x + ((to.x - from.x) * (i + 1)) / 8, y: from.y }] })),
    { type: 'touchEnd', points: [] },
  ]);
  await expect(page.getByTestId('wire-count')).toHaveText('1');
});

test('平板：第一指正在接線時放下第二指，改成縮放、不會多出導線', async ({ page }) => {
  const from = await hole(page, 'A45');
  const to = await hole(page, 'A50');
  const other = await hole(page, 'J45');
  await touch(page, [
    { type: 'touchStart', points: [{ ...from, id: 0 }] },
    ...[0.25, 0.5].map((t) => ({ type: 'touchMove' as const, points: [{ x: from.x + (to.x - from.x) * t, y: from.y, id: 0 }] })),
    { type: 'touchStart', points: [{ x: from.x + (to.x - from.x) * 0.5, y: from.y, id: 0 }, { ...other, id: 1 }] },
    ...[20, 40, 60].map((d) => ({
      type: 'touchMove' as const,
      points: [
        { x: from.x + (to.x - from.x) * 0.5, y: from.y - d, id: 0 },
        { x: other.x, y: other.y + d, id: 1 },
      ],
    })),
    { type: 'touchEnd', points: [] },
  ]);
  await expect(page.getByTestId('wire-count')).toHaveText('0');
});

test('平板：放置時長按（Android 會送 contextmenu）不會取消，放開才放置', async ({ page }) => {
  await page.locator('[data-library-item="led-red"]').tap();
  const a = await hole(page, 'G40');
  const b = await hole(page, 'G41');
  const at = { x: (a.x + b.x) / 2, y: a.y };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...at, id: 0 }] });
  await page.locator('#bbl-board-svg').dispatchEvent('contextmenu', { clientX: at.x, clientY: at.y, bubbles: true, cancelable: true });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await expect(page.locator('g[data-component-id="D1"]')).toHaveCount(1);
});

test('觸控筆：點元件庫再點麵包板，放在點的位置', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  const penTap = async (p: Pt) => {
    for (const type of ['mousePressed', 'mouseReleased'] as const) {
      await cdp.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1, pointerType: 'pen' });
    }
  };
  await penTap(await center(page, '[data-library-item="74LS00"]'));
  const e = await hole(page, 'E20');
  const f = await hole(page, 'F20');
  await penTap({ x: (e.x + f.x) / 2, y: (e.y + f.y) / 2 });
  await cdp.detach();
  await expect(page.locator('g[data-component-id="U1"]')).toHaveCount(1);
  await expect(page.locator('[data-hole="E20"]')).toBeVisible();
});
