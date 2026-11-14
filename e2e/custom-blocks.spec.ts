import { expect, test, type Page } from '@playwright/test';

/** 格子座標 → 畫布上的螢幕座標（讀 LogicCanvas 的 viewport）。 */
async function cell(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('logic-canvas').boundingBox())!;
  const v = await page.evaluate(() => (window as unknown as { __logicViewport: () => { x: number; y: number; scale: number } }).__logicViewport());
  return { x: box.x + v.x + x * 20 * v.scale, y: box.y + v.y + y * 20 * v.scale };
}

/** 子專案 65（規格 2026-11-14 custom-blocks）：框選包成方塊、再放一個、點兩下進去改、回來後兩個都變、Undo。 */
test('自訂方塊：半加器包成方塊，真值表不變；再放一個；進去刪掉 C，回來後兩個方塊都只剩 S', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const logic = {
    version: 1,
    nodes: [
      { id: 'i1', kind: 'INPUT', name: 'A', x: 0, y: 0, value: 0 },
      { id: 'i2', kind: 'INPUT', name: 'B', x: 0, y: 4, value: 0 },
      { id: 'g1', kind: 'XOR', x: 6, y: 0, inputs: 2 },
      { id: 'g2', kind: 'AND', x: 6, y: 4, inputs: 2 },
      { id: 'o1', kind: 'OUTPUT', name: 'S', x: 14, y: 1 },
      { id: 'o2', kind: 'OUTPUT', name: 'C', x: 14, y: 5 },
    ],
    wires: [
      { id: 'w1', from: 'i1', to: { node: 'g1', pin: 0 } },
      { id: 'w2', from: 'i2', to: { node: 'g1', pin: 1 } },
      { id: 'w3', from: 'i1', to: { node: 'g2', pin: 0 } },
      { id: 'w4', from: 'i2', to: { node: 'g2', pin: 1 } },
      { id: 'w5', from: 'g1', to: { node: 'o1', pin: 0 } },
      { id: 'w6', from: 'g2', to: { node: 'o2', pin: 0 } },
    ],
  };
  const file = { format: 'breadboard-lab/circuit', version: 2, name: '半加器', circuit: { version: 1, boards: [{ id: 'b1', layoutId: 'MB102', x: 0, y: 0, groupId: null }], components: [], wires: [] }, logic };
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: '匯入 JSON… Import' }).click()]);
  await chooser.setFiles({ name: '半加器.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await page.getByTestId('view-switch').getByRole('button', { name: '邏輯圖' }).click();
  await expect(page.locator('[data-logic-node]')).toHaveCount(6);

  // Shift 拖曳框住兩個閘。
  const a = await cell(page, 4.5, -1.2);
  const b = await cell(page, 10.6, 7.3);
  await page.keyboard.down('Shift');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.getByText('已選取 2 個元件')).toBeVisible();
  await page.getByLabel('方塊名稱').fill('HA');
  await page.getByRole('button', { name: '包成方塊' }).click();
  await expect(page.locator('[data-logic-node]')).toHaveCount(5);
  await expect(page.locator('[data-logic-node="m1"]')).toContainText('HA');

  await page.getByRole('tab', { name: '真值表' }).click();
  const rows = page.getByTestId('truth-table').locator('tbody tr');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(3)).toContainText('1110');

  // 從元件庫再放一個。
  await page.locator('[data-logic-part="CUSTOM:HA"]').click();
  const spot = await cell(page, 6, 12);
  await page.mouse.click(spot.x, spot.y);
  await expect(page.locator('[data-logic-node^="m"]')).toHaveCount(2);
  await expect(page.locator('[data-logic-out^="m2:"]')).toHaveCount(2);

  // 點兩下進到裡面，刪掉 AND 和 C，回到上一層。
  const center = await page.locator('[data-logic-node="m1"] [data-logic-block] rect').first().boundingBox();
  await page.mouse.dblclick(center!.x + center!.width / 2, center!.y + center!.height / 2);
  await expect(page.getByTestId('block-path')).toContainText('HA');
  await page.locator('main').screenshot({ path: 'test-results/custom-block-inside.png' });
  // 方塊裡的 id 照原本的：AND 是 g2，輸出端 C 是 po2（S、C 由上到下）。
  for (const id of ['g2', 'po2']) {
    await page.locator('[data-logic-node="' + id + '"] rect').first().click({ force: true });
    await page.keyboard.press('Delete');
  }
  await expect(page.locator('[data-logic-node]')).toHaveCount(4);
  await page.getByRole('button', { name: '回到上一層' }).click();
  await expect(page.getByTestId('block-path')).toHaveCount(0);
  await expect(page.locator('[data-logic-out^="m1:"]')).toHaveCount(1);
  await expect(page.locator('[data-logic-out^="m2:"]')).toHaveCount(1);
  await page.locator('[data-logic-node="m1"]').screenshot({ path: 'test-results/custom-block.png' });

  // 整次修改是一步 Undo。
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-logic-out^="m1:"]')).toHaveCount(2);
});
