import { expect, test } from '@playwright/test';

/** 子專案 52（規格 2026-10-25 state-table-task）：寫狀態表題目、看化簡後的式子、產生電路、看時序表。 */
test('狀態表題目：2 位元上數計數器，D 型正反器的式子、產生電路後時序表數 0–3', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('view-switch').getByRole('button', { name: '邏輯圖' }).click();
  await page.getByRole('tab', { name: '題目' }).click();
  await page.getByRole('button', { name: '狀態表題目', exact: true }).click();
  await page.getByLabel('狀態數').selectOption('4');
  await page.getByRole('button', { name: '建立狀態表題目' }).click();

  const table = page.getByTestId('state-table');
  await expect(table.locator('tr[data-row]')).toHaveCount(4);
  for (let s = 0; s < 4; s++) await page.getByLabel(`S${s} 的下一個狀態`).selectOption(String((s + 1) % 4));
  const equations = page.getByTestId('state-equations');
  await expect(equations).toContainText("D1 = Q1'Q0 + Q1Q0'");
  await expect(equations).toContainText("D0 = Q0'");
  // 改用 JK：J1 = K1 = Q0、J0 = K0 = 1。
  await page.getByRole('button', { name: '改用 JK 正反器' }).click();
  await expect(equations).toContainText('J1 = Q0');
  await expect(equations).toContainText('K0 = 1');

  await page.getByRole('button', { name: '產生電路', exact: true }).click();
  await expect(page.locator('[data-logic-node]')).toHaveCount(6);
  await page.getByRole('tab', { name: '時序表' }).click();
  const rows = page.getByTestId('sequence-table').locator('tr[data-pulse]');
  await expect(rows.nth(1)).toHaveText('110');
  await expect(rows.nth(2)).toHaveText('201');
  await expect(rows.nth(3)).toHaveText('311');
  await expect(rows.nth(4)).toHaveText('400');
  await page.locator('svg').filter({ has: page.locator('[data-logic-node]') }).first().screenshot({ path: 'test-results/state-task.png' });

  // 子專案 53：和邏輯圖比對；刪掉 Q0 的輸出端後說明要有 Q0。
  await page.getByRole('tab', { name: '題目' }).click();
  const compare = page.getByTestId('state-compare');
  await expect(compare).toContainText('從 S0 開始比對了 4 列，邏輯圖和狀態表全部一致');
  await page.locator('[data-logic-node]').filter({ hasText: 'Q0' }).click();
  await page.keyboard.press('Delete');
  await expect(compare).toContainText('要有輸出端 Q0');
});
