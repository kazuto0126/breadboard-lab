import { expect, test, type Page } from '@playwright/test';

async function centerOf(page: Page, selector: string) {
  const box = (await page.locator(selector).first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** 74LS00 跨在凹槽上（第 1 腳 F10），VCC 在 T+3、GND 在 B-3；第 7 腳已接 GND，第 14 腳（VCC）還沒接。 */
const circuit = {
  version: 1,
  boards: [{ id: 'b1', layoutId: 'MB102', x: 0, y: 0, groupId: null }],
  components: [
    { id: 'U1', defId: '74LS00', boardId: 'b1', anchor: { x: 10, y: 11 }, rotation: 0, props: {} },
    { id: 'V1', defId: 'vcc', boardId: 'b1', anchor: { x: 3, y: 2 }, rotation: 0, props: {} },
    { id: 'G1', defId: 'gnd', boardId: 'b1', anchor: { x: 3, y: 18 }, rotation: 0, props: {} },
  ],
  wires: [
    {
      id: 'g1', color: '#212121', source: 'manual',
      start: { boardId: 'b1', x: 16, y: 15 }, end: { boardId: 'b1', x: 16, y: 18 },
      path: [15, 16, 17, 18].map((y) => ({ boardId: 'b1', x: 16, y })),
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('[data-hole]')).toHaveCount(830);
});

test('點一個檢查錯誤看到為什麼與具體孔位，照著接線後錯誤消失', async ({ page }) => {
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: '匯入 JSON… Import' }).click()]);
  await chooser.setFiles({ name: 'explain.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(circuit)) });
  await expect(page.locator('g[data-component-id="U1"]')).toHaveCount(1);

  await page.getByRole('button', { name: '電路', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Check Circuit 檢查電路' }).click();
  const issue = page.getByRole('button', { name: /第 14 腳 VCC 未連接/ });
  await issue.click();
  const card = page.getByTestId('explanation');
  await expect(card).toContainText('為什麼');
  await expect(card).toContainText('74LS 晶片要從 VCC 腳拿 +5 V');
  await expect(card.getByRole('button', { name: /A10/ })).toBeVisible();
  await expect(card.getByRole('button', { name: /T\+10/ })).toBeVisible();
  await expect(page.locator('[data-suggested-hole="A10"]')).toHaveCount(1);
  await expect(page.locator('[data-suggested-hole="T+10"]')).toHaveCount(1);

  // 照建議從 1 號孔拉到 2 號孔。
  const a = await centerOf(page, '[data-hole="A10"]');
  const b = await centerOf(page, '[data-hole="T+10"]');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: /第 14 腳 VCC 未連接/ })).toHaveCount(0);
});
