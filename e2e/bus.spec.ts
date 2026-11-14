import { expect, test } from '@playwright/test';

/** 子專案 66（規格 2026-11-14 bus）：合起來 → 匯流排 → 拆開；粗線寫位元數與值，真值表直通；改位元數時接不上的線拿掉。 */
test('匯流排：A–D 合起來再拆開，真值表直通，粗線寫 /4 = 值；改成 2 位元時匯流排斷開', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const names = ['A', 'B', 'C', 'D'];
  const outs = ['W', 'X', 'Y', 'Z'];
  const logic = {
    version: 1,
    nodes: [
      ...names.map((name, k) => ({ id: `i${k}`, kind: 'INPUT', name, x: 0, y: k * 2, value: 0 })),
      { id: 'm', kind: 'MERGE', width: 4, x: 6, y: 1 },
      { id: 's', kind: 'SPLIT', width: 4, x: 16, y: 1 },
      ...outs.map((name, k) => ({ id: `o${k}`, kind: 'OUTPUT', name, x: 22, y: k * 2 })),
    ],
    wires: [
      ...names.map((_, k) => ({ id: `wi${k}`, from: `i${k}`, to: { node: 'm', pin: k } })),
      { id: 'wb', from: 'm', to: { node: 's', pin: 0 } },
      ...outs.map((_, k) => ({ id: `wo${k}`, from: 's', ...(k > 0 ? { fromPin: k } : {}), to: { node: `o${k}`, pin: 0 } })),
    ],
  };
  const file = { format: 'breadboard-lab/circuit', version: 2, name: '匯流排', circuit: { version: 1, boards: [{ id: 'b1', layoutId: 'MB102', x: 0, y: 0, groupId: null }], components: [], wires: [] }, logic };
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: '匯入 JSON… Import' }).click()]);
  await chooser.setFiles({ name: '匯流排.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await page.getByTestId('view-switch').getByRole('button', { name: '邏輯圖' }).click();
  await expect(page.locator('[data-logic-node]')).toHaveCount(10);
  await expect(page.locator('[data-logic-bus]')).toHaveCount(2);

  // 匯流排的值：A（第 0 位）、C（第 2 位）是 1 → 5。
  const label = page.locator('[data-bus-label="wb"]');
  await expect(label).toHaveText('/4 = 0');
  for (const id of ['i0', 'i2']) await page.locator(`[data-logic-switch="${id}"]`).click();
  await expect(label).toHaveText('/4 = 5');
  await page.locator('main').screenshot({ path: 'test-results/bus.png' });

  await page.getByRole('tab', { name: '真值表' }).click();
  const rows = page.getByTestId('truth-table').locator('tbody tr');
  await expect(rows).toHaveCount(16);
  await expect(rows.nth(6)).toContainText('01100110');

  // 拆開改成 2 位元：4 位元的匯流排接不上，拿掉。
  await page.getByRole('tab', { name: '屬性' }).click();
  await page.locator('[data-logic-node="s"] [data-logic-bus]').click({ force: true });
  await page.getByRole('button', { name: '2', exact: true }).click();
  await expect(page.locator('[data-logic-wire="wb"]')).toHaveCount(0);
});
