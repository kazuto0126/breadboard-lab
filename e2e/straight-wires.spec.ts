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

test('手動拉的直線不能交叉、不能跨過 IC；斜線可以拉、不出提醒（子專案 39、58）', async ({ page }) => {
  await drag(page, await hole(page, 'A30'), await hole(page, 'A34'));
  await expect(page.getByTestId('wire-count')).toHaveText('1');
  const c = await saved(page);
  expect(c.wires[0]).toMatchObject({ straight: true, start: { x: 30, y: 4 }, end: { x: 34, y: 4 } });
  expect(c.wires[0].path).toHaveLength(2);

  // 和 A30–A34 十字交叉
  await drag(page, await hole(page, 'T+33'), await hole(page, 'C33'));
  await expect(page.locator('[data-toast="warning"]').last()).toContainText('交叉');
  // 從上到下跨過 IC
  await drag(page, await hole(page, 'D12'), await hole(page, 'H12'));
  await expect(page.locator('[data-toast="warning"]').last()).toContainText('不能跨過元件（例如 IC）');
  await expect(page.getByTestId('wire-count')).toHaveText('1');
  // 子專案 58：斜線可以拉（AI 標準佈線會改成直線），不出提醒
  const warnings = await page.locator('[data-toast="warning"]').count();
  await drag(page, await hole(page, 'A40'), await hole(page, 'E44'));
  await expect(page.getByTestId('wire-count')).toHaveText('2');
  expect(await page.locator('[data-toast="warning"]').count()).toBeLessThanOrEqual(warnings);
  expect((await saved(page)).wires[1]).toMatchObject({ straight: true, start: { x: 40, y: 4 }, end: { x: 44, y: 8 } });
});

// 子專案 58：使用者自己拉斜線（可以壓過 IC），按 AI 標準佈線後全部變成水平或垂直的線。
test('自己拉的斜線，AI 標準佈線後全部變成直線（子專案 58）', async ({ page }) => {
  const withResistor = { ...ic, components: [...ic.components, { id: 'R1', defId: 'resistor', boardId: 'b1', anchor: { x: 30, y: 4 }, rotation: 0, span: 4, props: {} }] };
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: '匯入 JSON… Import' }).click()]);
  await chooser.setFiles({ name: 'r.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(withResistor)) });
  await expect(page.locator('g[data-component-id="R1"]')).toHaveCount(1);
  await drag(page, await hole(page, 'C12'), await hole(page, 'D34')); // U1 → R1，斜的
  await drag(page, await hole(page, 'D11'), await hole(page, 'H26')); // 斜的，壓過 U1
  await drag(page, await hole(page, 'J26'), await hole(page, 'B30')); // 接到 R1 的另一隻腳
  await expect(page.getByTestId('wire-count')).toHaveText('3');
  await page.getByRole('button', { name: '⚡ AI 標準佈線' }).click();
  await expect(page.getByTestId('routing-result')).toContainText('Standard Routing Complete', { timeout: 30_000 });
  const c = await saved(page);
  expect(c.wires.length).toBeGreaterThan(0);
  for (const w of c.wires) for (let i = 1; i < w.path.length; i++) expect(w.path[i].x === w.path[i - 1].x || w.path[i].y === w.path[i - 1].y).toBe(true);
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
