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

test('從元件庫把便條拖到麵包板上；寬度跟著文字變', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const card = page.locator('[data-library-item="note"]');
  const from = (await card.boundingBox())!;
  const board = (await page.locator('#bbl-board-svg').boundingBox())!;
  const drop = { x: board.x + board.width / 2, y: board.y + board.height / 2 };
  await page.mouse.move(from.x + 20, from.y + 10);
  await page.mouse.down();
  await page.mouse.move(drop.x, drop.y, { steps: 12 });
  await expect(page.getByTestId('note-ghost')).toBeVisible();
  await page.mouse.up();

  const editor = page.getByLabel('便條內容');
  await expect(editor).toBeFocused();
  await editor.fill('短');
  await page.keyboard.press('Control+Enter');
  const note = page.locator('[data-note="n1"]');
  const box = (await note.boundingBox())!;
  // 放在游標附近（左上角離放開的點不到 2 格）。
  expect(Math.abs(box.x - drop.x)).toBeLessThan(40);
  expect(Math.abs(box.y - drop.y)).toBeLessThan(40);
  const narrow = box.width;

  await note.dblclick();
  await page.getByLabel('便條內容').fill('這是一段比較長的說明文字，會讓便條變寬，超過最寬的寬度就換行繼續寫下去');
  await page.keyboard.press('Control+Enter');
  const wide = (await note.boundingBox())!;
  expect(wide.width).toBeGreaterThan(narrow * 2);
  expect(wide.height).toBeGreaterThan(box.height); // 超過最寬就換行
});

test('便條指向孔位：選「孔位…」輸入 F12，畫線指到那個孔，重新整理後還在', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.keyboard.press('n');
  await page.getByLabel('便條內容').fill('這裡接 VCC');
  await page.keyboard.press('Control+Enter');
  await page.locator('[data-note="n1"]').click();
  await page.getByRole('tab', { name: '屬性' }).click();
  await page.getByLabel('便條指向').selectOption('__hole__');
  await page.getByLabel('指向的孔位').fill('Z99');
  await page.getByLabel('指向的孔位').press('Enter');
  await expect(page.getByText('孔位 Z99 不存在')).toBeVisible();
  await page.getByLabel('指向的孔位').fill('F12');
  await page.getByLabel('指向的孔位').press('Enter');
  await expect(page.locator('[data-note-arrow="n1"]')).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('breadboard-lab:autosave') ?? 'null')?.circuit?.notes?.[0]?.targetHole ?? null))
    .not.toBeNull();
  await page.reload();
  await expect(page.locator('[data-note-arrow="n1"]')).toHaveCount(1);
});

test('邏輯圖的便條：點元件庫的便條、打字、指向元件、拖曳、刪除與復原、重新整理後還在', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: '多數決電路（圖 2-5）' }).click();
  await expect(page.locator('[data-logic-node]')).toHaveCount(8);

  await page.locator('[data-logic-part="NOTE"]').click();
  const editor = page.getByLabel('便條內容');
  await expect(editor).toBeFocused();
  await editor.fill('三個輸入有兩個以上是 1');
  await page.keyboard.press('Control+Enter');
  const note = page.locator('[data-logic-note="n1"]');
  await expect(note).toContainText('三個輸入有兩個以上是 1');

  // 選取後在屬性面板指向輸出端 X。
  await note.click();
  await page.getByRole('tab', { name: '屬性' }).click();
  await page.getByLabel('便條指向').selectOption('o1');
  await expect(page.locator('[data-logic-note-arrow="n1"]')).toHaveCount(1);

  // 拖曳移動。
  const before = (await note.boundingBox())!;
  await page.mouse.move(before.x + 20, before.y + 10);
  await page.mouse.down();
  await page.mouse.move(before.x + 140, before.y + 80, { steps: 8 });
  await page.mouse.up();
  const after = (await note.boundingBox())!;
  expect(after.x - before.x).toBeGreaterThan(60);

  // Delete 刪除、Ctrl+Z 復原。
  await note.click();
  await page.keyboard.press('Delete');
  await expect(note).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(note).toHaveCount(1);

  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('breadboard-lab:autosave') ?? 'null')?.logic?.notes?.[0]?.target ?? null))
    .toBe('o1');
  await page.reload();
  await page.getByTestId('view-switch').getByRole('button', { name: '邏輯圖' }).click();
  await expect(page.locator('[data-logic-note="n1"]')).toContainText('三個輸入有兩個以上是 1');
});
