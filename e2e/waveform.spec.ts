import { expect, test } from '@playwright/test';

/** 子專案 50（規格 2026-10-25 waveform）：時序表切換成波形，指著某一格看值。 */
test('漣波計數器：時序表切到波形，指著第 5 格寫出 Q0 = 1、Q1 = 0、Q2 = 1，切回表格', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: '3 位元漣波計數器（74LS76 JK 正反器）' }).click();
  await page.getByRole('tab', { name: '時序表' }).click();
  await page.getByRole('button', { name: '波形', exact: true }).click();

  const wave = page.getByTestId('waveform');
  await expect(wave.locator('[data-lane]')).toHaveCount(4);
  await expect(page.getByTestId('waveform-readout')).toContainText('把滑鼠移到圖上');
  const box = (await wave.boundingBox())!;
  const scale = box.width / Number(await wave.getAttribute('width'));
  // 左邊名稱 52、每格 20：第 5 格的中間。
  await page.mouse.move(box.x + (52 + 5 * 20 + 10) * scale, box.y + 20);
  await expect(page.getByTestId('waveform-readout')).toHaveText('第 5 次脈衝後：Q0 = 1、Q1 = 0、Q2 = 1');
  await wave.screenshot({ path: 'test-results/waveform.png' });

  await page.getByRole('button', { name: '表格', exact: true }).click();
  await expect(page.getByTestId('sequence-table').locator('tr[data-pulse]')).toHaveCount(17);
});
