import { expect, test } from '@playwright/test';

test('真值表題目：輸入多數決的題目，和邏輯圖、麵包板比對，重新整理後還在', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: '多數決電路（圖 2-5）' }).click();
  await expect(page.locator('[data-logic-node]')).toHaveCount(8);

  // 建立題目：輸入 A B C、輸出 X。
  await page.getByRole('tab', { name: '題目' }).click();
  const tab = page.getByTestId('task-tab');
  await tab.getByLabel('輸入名稱').fill('A B C');
  await tab.getByLabel('輸出名稱').fill('X');
  await tab.getByRole('button', { name: '建立題目' }).click();
  await expect(tab.locator('tr[data-task-row]')).toHaveCount(8);
  // 輸出全是 0：和多數決有 4 列不一致。
  const compare = tab.getByTestId('task-compare');
  await expect(compare).toContainText('有 4 列不一致');

  // 用「1 的列」輸入多數決：3、5、6、7。
  const ones = tab.getByLabel('X 的 1 的列');
  await ones.fill('3, 5, 6, 7');
  await ones.press('Enter');
  await expect(tab.locator('tr[data-task-row="3"] [data-task-cell="0"]')).toHaveText('1');
  await expect(compare).toContainText('8 種輸入組合，邏輯圖和題目全部一致');

  // 點第 0 列的輸出格：0 → 1（不一致）→ X（不在乎，不比）→ 0。
  const cell = tab.locator('tr[data-task-row="0"] [data-task-cell="0"]');
  await cell.click();
  await expect(compare).toContainText('有 1 列不一致');
  await expect(compare).toContainText('A B C = 0 0 0：題目 X = 1，邏輯圖 X = 0');
  await cell.click();
  await expect(cell).toHaveText('X');
  await expect(compare).toContainText('全部一致（不在乎的格子不比）');
  await cell.click();
  await expect(cell).toHaveText('0');

  // 轉成麵包板：「檢查」分頁的「和題目比對」也全部一致。
  await page.getByRole('tab', { name: '屬性' }).click();
  await page.getByRole('button', { name: '轉成麵包板…' }).click();
  await page.getByRole('dialog', { name: '轉成麵包板' }).getByRole('button', { name: '轉換' }).click();
  await expect(page.getByTestId('status')).not.toContainText('Routing…', { timeout: 60_000 });
  await page.getByRole('tab', { name: /檢查/ }).click();
  await expect(page.getByTestId('task-check')).toContainText('8 種輸入組合，麵包板的模擬結果和題目全部一致', { timeout: 60_000 });

  // 重新整理後題目還在（自動保存）。
  await page.reload();
  await page.getByTestId('view-switch').getByRole('button', { name: '邏輯圖' }).click();
  await page.getByRole('tab', { name: '題目' }).click();
  await expect(page.getByTestId('task-tab').locator('tr[data-task-row]')).toHaveCount(8);
  await expect(page.getByTestId('task-tab').locator('tr[data-task-row="5"] [data-task-cell="0"]')).toHaveText('1');
});

test('真值表題目：用邏輯圖的真值表建立、改名稱、刪除', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: '多數決電路（圖 2-5）' }).click();
  await page.getByRole('tab', { name: '題目' }).click();
  const tab = page.getByTestId('task-tab');
  await tab.getByRole('button', { name: '用邏輯圖的真值表建立' }).click();
  await expect(tab.getByLabel('X 的 1 的列')).toHaveValue('3, 5, 6, 7');
  await expect(tab.getByTestId('task-compare')).toContainText('全部一致');

  // 改名稱：輸出改成 Y，邏輯圖找不到 Y。
  await tab.getByRole('button', { name: '改名稱' }).click();
  await tab.getByLabel('輸出名稱').fill('Y');
  await tab.getByRole('button', { name: '套用' }).click();
  await expect(tab.getByTestId('task-compare')).toContainText('題目的輸出 Y 在邏輯圖找不到輸出端');
  // 名稱不合法時說明原因、不套用。
  await tab.getByRole('button', { name: '改名稱' }).click();
  await tab.getByLabel('輸入名稱').fill('A 1B');
  await tab.getByRole('button', { name: '套用' }).click();
  await expect(tab).toContainText('名稱 1B 不合法');

  // Undo 回到改名稱之前（邏輯圖的 Undo 也包含題目）。
  await tab.getByRole('button', { name: '取消' }).click();
  await page.keyboard.press('Control+z');
  await expect(tab.getByTestId('task-compare')).toContainText('全部一致');

  await tab.getByRole('button', { name: '刪除題目' }).click();
  await expect(tab.getByRole('button', { name: '建立題目' })).toBeVisible();
});

test('真值表題目：看化簡結果、產生邏輯圖，和題目全部一致，可以 Undo', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('view-switch').getByRole('button', { name: '邏輯圖' }).click();
  await page.getByRole('tab', { name: '題目' }).click();
  const tab = page.getByTestId('task-tab');
  await tab.getByLabel('輸入名稱').fill('A B C');
  await tab.getByLabel('輸出名稱').fill('X Y');
  await tab.getByRole('button', { name: '建立題目' }).click();
  // X 是多數決；Y = A XOR B（C 不影響）。
  for (const [name, rows] of [['X', '3, 5, 6, 7'], ['Y', '2, 3, 4, 5']]) {
    await tab.getByLabel(`${name} 的 1 的列`).fill(rows);
    await tab.getByLabel(`${name} 的 1 的列`).press('Enter');
  }
  await expect(tab.locator('[data-sop="X"]')).toHaveAttribute('data-text', 'AB + AC + BC');
  await expect(tab.locator('[data-sop="Y"]')).toHaveAttribute('data-text', "A'B + AB'");

  await tab.getByRole('button', { name: '產生邏輯圖' }).click();
  // 輸入 3、NOT 2、AND 5、OR 2、輸出 2。
  await expect(page.locator('[data-logic-node]')).toHaveCount(14);
  await expect(tab.getByTestId('task-compare')).toContainText('8 種輸入組合，邏輯圖和題目全部一致');
  await expect(tab.getByRole('button', { name: '產生邏輯圖（取代目前的）' })).toBeVisible();

  // 一個 Undo 回到沒有邏輯圖，題目還在。
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-logic-node]')).toHaveCount(0);
  await expect(tab.locator('[data-sop="X"]')).toBeVisible();
});

test('真值表題目：選和積、只用 NAND 產生邏輯圖（子專案 31）', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('view-switch').getByRole('button', { name: '邏輯圖' }).click();
  await page.getByRole('tab', { name: '題目' }).click();
  const tab = page.getByTestId('task-tab');
  await tab.getByLabel('輸入名稱').fill('A B C');
  await tab.getByLabel('輸出名稱').fill('X');
  await tab.getByRole('button', { name: '建立題目' }).click();
  await tab.getByLabel('X 的 1 的列').fill('3, 5, 6, 7');
  await tab.getByLabel('X 的 1 的列').press('Enter');

  await tab.getByRole('button', { name: '和積', exact: true }).click();
  await expect(tab.locator('[data-sop="X"]')).toHaveAttribute('data-text', '(A + B)(A + C)(B + C)');

  await tab.getByRole('button', { name: '只用 NAND', exact: true }).click();
  await expect(tab.locator('[data-sop="X"]')).toHaveAttribute('data-text', 'AB + AC + BC');
  await tab.getByRole('button', { name: '產生邏輯圖' }).click();
  // 輸入 3、NAND 4（三個積項 + 最後一個）、輸出 1。
  await expect(page.locator('[data-logic-node]')).toHaveCount(8);
  await expect(tab.getByTestId('task-compare')).toContainText('8 種輸入組合，邏輯圖和題目全部一致');
});
