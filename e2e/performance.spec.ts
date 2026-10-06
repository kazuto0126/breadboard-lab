import { expect, test } from '@playwright/test';
import { board, components, importFixture, openEditor } from './helpers';

test('效能參考：50 個元件、100 條導線時拖曳元件', async ({ page }) => {
  await openEditor(page);
  await importFixture(page, 'dense.breadboard.json');
  await expect(page.getByText('導線 100', { exact: true })).toBeVisible();

  const box = await board(page).locator('[data-component-id="RA0"]').boundingBox();
  if (!box) throw new Error('RA0 is not visible');
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const times: number[] = [];
  for (let i = 1; i <= 40; i++) {
    const t0 = performance.now();
    await page.mouse.move(start.x + i * 3, start.y);
    times.push(performance.now() - t0);
  }
  await page.mouse.up();

  const average = times.reduce((sum, t) => sum + t, 0) / times.length;
  const note = `指標移動處理時間：平均 ${average.toFixed(1)} ms，最長 ${Math.max(...times).toFixed(1)} ms（目標 < 16 ms，僅供參考）`;
  test.info().annotations.push({ type: 'performance', description: note });
  console.log(note);
  await expect(components(page)).toHaveCount(50);
});
