import { expect, test } from '@playwright/test';
import { importFixture, openEditor } from './helpers';

test('存到瀏覽器、重新整理後自動還原、開啟清單、匯出三種檔案', async ({ page }) => {
  await openEditor(page);
  await importFixture(page, 'acceptance.breadboard.json');
  await expect(page.getByText('已匯入「驗收電路」')).toBeVisible();
  await expect(page.getByText('導線 7', { exact: true })).toBeVisible();

  await page.keyboard.press('Control+s');
  await page.getByLabel('名稱').fill('第一次實驗');
  await page.getByRole('button', { name: '確定' }).click();
  await expect(page.getByText('已儲存「第一次實驗」')).toBeVisible();

  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('breadboard-lab:autosave')?.includes('第一次實驗') ?? false))
    .toBe(true);
  await page.reload();
  await expect(page.getByText('導線 7', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '檔案' }).click();
  await page.getByRole('menuitem', { name: '開啟' }).click();
  await expect(page.getByRole('button', { name: '開啟「第一次實驗」' })).toBeVisible();
  await expect(page.getByText('學校電腦可能會清除瀏覽器資料，重要的電路請匯出 JSON')).toBeVisible();
  await page.getByRole('button', { name: '關閉' }).click();

  const exports: Array<[string, string]> = [
    ['匯出 JSON', '第一次實驗.breadboard.json'],
    ['匯出 SVG', '第一次實驗.svg'],
    ['匯出 PNG', '第一次實驗.png'],
  ];
  for (const [item, filename] of exports) {
    await page.getByRole('button', { name: '檔案' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: item }).click();
    expect((await download).suggestedFilename()).toBe(filename);
  }
});
