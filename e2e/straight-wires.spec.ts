import { expect, test, type Page } from '@playwright/test';

async function centerOf(page: Page, selector: string) {
  const box = (await page.locator(selector).first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
const hole = (page: Page, name: string) => centerOf(page, `[data-hole="${name}"]`);

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + (to.x - from.x) * 0.3, from.y + (to.y - from.y) * 0.3, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

async function saved(page: Page) {
  await page.waitForTimeout(600);
  return page.evaluate(() => JSON.parse(localStorage.getItem('breadboard-lab:autosave')!).circuit);
}

const ic = {
  version: 1,
  boards: [{ id: 'b1', layoutId: 'MB102', x: 0, y: 0, groupId: null }],
  components: [{ id: 'U1', defId: '74LS00', boardId: 'b1', anchor: { x: 10, y: 11 }, rotation: 0, props: {} }],
  wires: [],
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('[data-hole]')).toHaveCount(830);
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: '匯入 JSON… Import' }).click()]);
  await chooser.setFiles({ name: 'ic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(ic)) });
  await expect(page.locator('g[data-component-id="U1"]')).toHaveCount(1);
});

test('手動拉線只能水平或垂直；斜的、交叉的、跨過 IC 的線不會建立（子專案 39）', async ({ page }) => {
  await drag(page, await hole(page, 'A30'), await hole(page, 'A34'));
  await expect(page.getByTestId('wire-count')).toHaveText('1');
  const c = await saved(page);
  expect(c.wires[0]).toMatchObject({ straight: true, start: { x: 30, y: 4 }, end: { x: 34, y: 4 } });
  expect(c.wires[0].path).toHaveLength(2);

  // 斜的線
  await drag(page, await hole(page, 'A40'), await hole(page, 'E44'));
  await expect(page.locator('[data-toast="warning"]').last()).toContainText('導線只能水平或垂直');
  // 和 A30–A34 十字交叉
  await drag(page, await hole(page, 'T+33'), await hole(page, 'C33'));
  await expect(page.locator('[data-toast="warning"]').last()).toContainText('交叉');
  // 從上到下跨過 IC
  await drag(page, await hole(page, 'D12'), await hole(page, 'H12'));
  await expect(page.locator('[data-toast="warning"]').last()).toContainText('不能跨過元件（例如 IC）');
  await expect(page.getByTestId('wire-count')).toHaveText('1');
});

test('選取導線後拖曳端點改接到別的孔，可以復原', async ({ page }) => {
  await drag(page, await hole(page, 'A30'), await hole(page, 'A35'));
  await expect(page.getByTestId('wire-count')).toHaveText('1');
  const handle = page.locator('[data-wire-handle="end"]');
  await expect(handle).toHaveCount(1);
  await drag(page, await centerOf(page, '[data-wire-handle="end"]'), await hole(page, 'A38'));
  let c = await saved(page);
  expect(c.wires[0]).toMatchObject({ straight: true, start: { x: 30, y: 4 }, end: { x: 38, y: 4 } });
  await page.keyboard.press('Control+z');
  c = await saved(page);
  expect(c.wires[0].end).toEqual({ boardId: 'b1', x: 35, y: 4 });
});
