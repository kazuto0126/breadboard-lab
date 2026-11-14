import { expect, test } from '@playwright/test';

/** 子專案 51（規格 2026-10-25 single-flip-flops）：單顆 D 型正反器的同步計數器，轉成麵包板時兩顆合用一片 74LS74。 */
test('2 位元同步計數器：時序表數 0–3，轉成麵包板用一片 74LS74，送脈衝比對全部一致', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: '2 位元同步計數器（D 型正反器）' }).click();
  await expect(page.locator('[data-logic-node]')).toHaveCount(6);

  await page.getByRole('tab', { name: '時序表' }).click();
  const rows = page.getByTestId('sequence-table').locator('tr[data-pulse]');
  await expect(rows.nth(0)).toHaveText('000');
  await expect(rows.nth(1)).toHaveText('110');
  await expect(rows.nth(2)).toHaveText('201');
  await expect(rows.nth(3)).toHaveText('311');
  await expect(rows.nth(4)).toHaveText('400');

  await page.getByRole('tab', { name: '屬性' }).click();
  await page.getByRole('button', { name: '轉成麵包板…' }).click();
  const dialog = page.getByRole('dialog', { name: '轉成麵包板' });
  await expect(dialog.getByTestId('convert-preview')).toContainText('74LS74 × 1');
  await dialog.getByRole('button', { name: '轉換' }).click();
  await expect(page.locator('g[data-component-id="CLK1"]')).toHaveCount(1, { timeout: 120_000 });
  await expect(page.getByTestId('status')).not.toContainText('Routing…', { timeout: 120_000 });
  await page.getByRole('tab', { name: /檢查/ }).click();
  await expect(page.getByTestId('diagram-check')).toContainText('送 16 個脈衝，麵包板的模擬結果和時序表全部一致', { timeout: 60_000 });
});

/** 子專案 64（規格 2026-11-14 multiple-clocks）：兩個時脈各接一顆 D 型正反器；時序表選送哪個時脈、自訂順序，畫布上的按鈕只送自己。 */
test('兩個時脈：時序表選 CLK2、寫自訂順序，畫布上 CLK2 的按鈕只讓 B 翻', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const ff = (id: string, y: number) => ({ id, kind: 'BLOCK', chip: 'DFF', x: 8, y });
  const logic = {
    version: 1,
    nodes: [
      { id: 'c1', kind: 'CLOCK', name: 'CLK', x: 0, y: 2, value: 0 },
      { id: 'c2', kind: 'CLOCK', name: 'CLK2', x: 0, y: 10, value: 0 },
      ff('f1', 0),
      ff('f2', 8),
      { id: 'o1', kind: 'OUTPUT', name: 'A', x: 16, y: 1 },
      { id: 'o2', kind: 'OUTPUT', name: 'B', x: 16, y: 9 },
    ],
    wires: [
      { id: 'w1', from: 'c1', to: { node: 'f1', pin: 1 } },
      { id: 'w2', from: 'c2', to: { node: 'f2', pin: 1 } },
      { id: 'w3', from: 'f1', fromPin: 1, to: { node: 'f1', pin: 0 } },
      { id: 'w4', from: 'f2', fromPin: 1, to: { node: 'f2', pin: 0 } },
      { id: 'w5', from: 'f1', to: { node: 'o1', pin: 0 } },
      { id: 'w6', from: 'f2', to: { node: 'o2', pin: 0 } },
    ],
  };
  const file = { format: 'breadboard-lab/circuit', version: 2, name: '兩個時脈', circuit: { version: 1, boards: [{ id: 'b1', layoutId: 'MB102', x: 0, y: 0, groupId: null }], components: [], wires: [] }, logic };
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: '匯入 JSON… Import' }).click()]);
  await chooser.setFiles({ name: '兩個時脈.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await page.getByTestId('view-switch').getByRole('button', { name: '邏輯圖' }).click();
  await expect(page.locator('[data-logic-node]')).toHaveCount(6);

  await page.getByRole('tab', { name: '時序表' }).click();
  const rows = page.getByTestId('sequence-table').locator('tr[data-pulse]');
  // 預設送 CLK：只有 A 翻。
  await expect(rows.nth(1)).toHaveText('1CLK10');
  await page.getByTestId('clock-order').getByRole('button', { name: 'CLK2' }).click();
  await expect(rows.nth(1)).toHaveText('1CLK201');
  await page.getByLabel('送時脈的順序').fill('CLK CLK2');
  await expect(rows.nth(1)).toHaveText('1CLK10');
  await expect(rows.nth(2)).toHaveText('2CLK211');
  await page.getByLabel('送時脈的順序').fill('CLK CLK3');
  await expect(page.getByText('沒有叫 CLK3 的時脈')).toBeVisible();

  // 畫布上 CLK2 的脈衝按鈕只送 CLK2。
  await expect(page.locator('[data-logic-node="o2"]')).toContainText('0');
  await page.locator('[data-logic-pulse="c2"]').click();
  await expect(page.locator('[data-logic-node="o2"]')).toContainText('1');
  await expect(page.locator('[data-logic-node="o1"]')).toContainText('0');
});
