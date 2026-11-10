import { expect, test } from '@playwright/test';

// 子專案 59：閘接回前面的迴授（課本圖 10-14 的閘控 SR 閂鎖）可以畫，真值表寫「保持」。
const n = (id: string, kind: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({ id, kind, x, y, ...extra });
const w = (id: string, from: string, to: string, pin: number) => ({ id, from, to: { node: to, pin } });
const file = {
  format: 'breadboard-lab/circuit',
  version: 2,
  name: 'gated-sr',
  savedAt: '2026-11-10T00:00:00.000Z',
  circuit: { version: 1, boards: [{ id: 'b1', layoutId: 'MB102', x: 0, y: 0, groupId: null }], components: [], wires: [] },
  logic: {
    version: 1,
    nodes: [
      n('s', 'INPUT', 0, 0, { name: 'S' }), n('cp', 'INPUT', 0, 6, { name: 'CP' }), n('r', 'INPUT', 0, 12, { name: 'R' }),
      n('g1', 'NAND', 8, 1, { inputs: 2 }), n('g2', 'NAND', 8, 11, { inputs: 2 }), n('g3', 'NAND', 18, 2, { inputs: 2 }), n('g4', 'NAND', 18, 10, { inputs: 2 }),
      n('q', 'OUTPUT', 28, 3, { name: 'Q' }), n('qb', 'OUTPUT', 28, 11, { name: 'QBAR' }),
    ],
    wires: [
      w('w1', 's', 'g1', 0), w('w2', 'cp', 'g1', 1), w('w3', 'r', 'g2', 0), w('w4', 'cp', 'g2', 1),
      w('w5', 'g1', 'g3', 0), w('w6', 'g4', 'g3', 1), w('w7', 'g2', 'g4', 0), w('w8', 'g3', 'g4', 1),
      w('w9', 'g3', 'q', 0), w('w10', 'g4', 'qb', 0),
    ],
  },
};

test('畫得出 SR 閂鎖：檢查沒有錯誤，真值表寫「保持」（子專案 59）', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: '匯入 JSON… Import' }).click()]);
  await chooser.setFiles({ name: 'sr.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await page.getByTestId('view-switch').getByRole('button', { name: '邏輯圖' }).click();
  await page.getByRole('tab', { name: /真值表/ }).click();
  const cells = (row: string) => page.getByTestId('truth-table').locator(`tr[data-row="${row}"] td`);
  // 輸入依名稱排序：CP、R、S；輸出 Q、QBAR。
  await expect(cells('000').nth(3)).toHaveText('保持');
  await expect(cells('101').nth(3)).toHaveText('1');
  await expect(cells('110').nth(3)).toHaveText('0');
  await expect(page.getByText('「保持」是跟之前的狀態有關')).toBeVisible();
  await page.getByRole('tab', { name: /檢查/ }).click();
  await expect(page.getByText('形成迴圈')).toHaveCount(0);
});
