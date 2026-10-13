import { expect, test } from '@playwright/test';

test('圖 2-5 轉成麵包板：產生 IC、開關、LED，佈線後真值表全部一致，模擬時撥開關 LED 會亮', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: '多數決電路（圖 2-5）' }).click();
  await expect(page.locator('[data-logic-node]')).toHaveCount(8);

  await page.getByRole('button', { name: '轉成麵包板…' }).click();
  const dialog = page.getByRole('dialog', { name: '轉成麵包板' });
  await expect(dialog.getByTestId('convert-preview')).toContainText('74LS08 × 1、74LS32 × 1、4 位元指撥開關 × 1、電阻 × 4、LED × 1');
  await dialog.getByRole('button', { name: '轉換' }).click();

  for (const id of ['U1', 'U2', 'SW1', 'D1']) await expect(page.locator(`g[data-component-id="${id}"]`)).toHaveCount(1);
  // 等 AI 佈線（可移動 IC）結束。
  await expect(page.getByTestId('status')).not.toContainText('Routing', { timeout: 60_000 });
  await page.getByRole('tab', { name: /檢查/ }).click();
  await expect(page.getByTestId('conversion-check')).toContainText('8 種輸入組合，麵包板的模擬結果和真值表全部一致', { timeout: 60_000 });

  await page.getByRole('button', { name: '▶ 模擬', exact: true }).click();
  await expect(page.getByTestId('simulation-bar')).toContainText('模擬中');
  const lit = () => page.locator('g[data-component-id="D1"][data-lit]').count();
  await expect.poll(lit).toBe(0);
  // A、B 撥 ON（開關接 +5 V：ON = 1）→ X = 1。
  for (const k of [0, 1]) await page.locator(`g[data-component-id="SW1"] [data-switch="${k}"]`).click();
  await expect.poll(lit).toBe(1);
});

test('只用 NAND 轉換：只有 74LS00、比對一致、板上標出 A、B、C、X，可以在屬性裡改名', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: '多數決電路（圖 2-5）' }).click();
  await page.getByRole('button', { name: '轉成麵包板…' }).click();
  const dialog = page.getByRole('dialog', { name: '轉成麵包板' });
  await dialog.getByLabel(/只用 NAND/).check();
  await expect(dialog.getByTestId('convert-preview')).toContainText('74LS00 ×');
  await dialog.getByRole('button', { name: '轉換' }).click();

  // MB-102 排不完時會自動改用 EIC-1106 再轉一次；等到比對卡出現且佈線結束。
  await page.getByRole('tab', { name: /檢查/ }).click();
  await expect(page.getByTestId('conversion-check')).toContainText('全部一致', { timeout: 120_000 });
  await expect(page.getByTestId('status')).not.toContainText('Routing', { timeout: 120_000 });
  const ics = await page.locator('g[data-component-id^="U"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-component-id')));
  expect(ics.length).toBeGreaterThan(0);
  for (const id of ics) await expect(page.locator(`g[data-component-id="${id}"]`)).toContainText('74LS00');
  for (const name of ['A', 'B', 'C', 'X']) await expect(page.locator(`[data-label="${name}"]`)).toHaveCount(1);

  await page.getByRole('tab', { name: '屬性' }).click();
  await page.locator('g[data-component-id="SW1"]').click();
  const first = page.getByLabel('開關 1 名稱');
  await first.fill('IN1');
  await first.press('Enter');
  await expect(page.locator('[data-label="IN1"]')).toHaveCount(1);
  await expect(page.locator('[data-label="A"]')).toHaveCount(0);
});
