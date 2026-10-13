import { expect, test } from '@playwright/test';

test('便條：N 新增、打字、拖曳、換顏色、指向元件、重新整理後還在、可以復原', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: '74LS00 + LED（驗收電路）' }).click();
  await page.keyboard.press('Escape');

  await page.keyboard.press('n');
  const editor = page.getByLabel('便條內容');
  await expect(editor).toBeFocused();
  await editor.fill('先接電源\n再接 LED');
  await page.keyboard.press('Control+Enter');
  const note = page.locator('[data-note="n1"]');
  await expect(note).toContainText('先接電源');
  await expect(note).toContainText('再接 LED');

  // 拖曳移動
  const before = (await note.boundingBox())!;
  await page.mouse.move(before.x + 20, before.y + 10);
  await page.mouse.down();
  await page.mouse.move(before.x + 120, before.y + 70, { steps: 8 });
  await page.mouse.up();
  const after = (await note.boundingBox())!;
  expect(after.x - before.x).toBeGreaterThan(60);
  expect(after.y - before.y).toBeGreaterThan(30);

  // 點一下選取，屬性面板換顏色、指向 U1
  await note.click();
  await page.getByRole('tab', { name: '屬性' }).click();
  await page.getByRole('button', { name: '便條顏色：藍' }).click();
  await expect(page.getByRole('button', { name: '便條顏色：藍' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('便條指向').selectOption('U1');
  await expect(page.locator('[data-note-arrow="n1"]')).toHaveCount(1);

  // 自動暫存後重新整理
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('breadboard-lab:autosave') ?? 'null')?.circuit?.notes?.[0]?.target ?? null))
    .toBe('U1');
  await page.reload();
  await expect(page.locator('[data-note="n1"]')).toContainText('先接電源');
  await expect(page.locator('[data-note-arrow="n1"]')).toHaveCount(1);

  // 刪除後可以復原
  await page.locator('[data-note="n1"]').click();
  await page.keyboard.press('Delete');
  await expect(page.locator('[data-note="n1"]')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-note="n1"]')).toHaveCount(1);
});

test('新增後沒打字就結束：不留下空便條', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '電路', exact: true }).click();
  await page.getByRole('menuitem', { name: /新增便條/ }).click();
  await expect(page.getByLabel('便條內容')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-note]')).toHaveCount(0);
});
