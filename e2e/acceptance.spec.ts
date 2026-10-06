import { expect, test, type Locator } from '@playwright/test';
import { board, components, dragPart, drawWire, holeCenter, midpoint, openEditor, wires } from './helpers';

/** 板子外框整個落在畫布裡（比較模式左右兩塊都要看得到整塊板子）。 */
async function wholeBoardVisible(svg: Locator): Promise<boolean> {
  const canvas = await svg.boundingBox();
  const outline = await svg.locator('[data-layer="board"] rect').first().boundingBox();
  if (!canvas || !outline) return false;
  return (
    outline.x >= canvas.x - 0.5 &&
    outline.y >= canvas.y - 0.5 &&
    outline.x + outline.width <= canvas.x + canvas.width + 0.5 &&
    outline.y + outline.height <= canvas.y + canvas.height + 0.5
  );
}

/**
 * 與子專案 1 的 acceptanceCircuit 相同的接線：VCC、GND、74LS00 第 1 閘 → 電阻 → LED → GND。
 * 平貼跳線蓋住的孔不能再插線（按下去會選到那條線），所以先接 J12、J11 出發的線，再接會蓋過它們的 J10 → I16。
 */
const MANUAL_WIRES: Array<[string, string]> = [
  ['T+6', 'A10'],
  ['B-6', 'J16'],
  ['J12', 'J30'],
  ['J11', 'H16'],
  ['J10', 'I16'],
  ['J34', 'J40'],
  ['J41', 'B-41'],
];

test('需求文件第三十四章的驗收流程', async ({ page }) => {
  // 1–2：開啟網站，看見 MB-102 麵包板（830 孔）
  await openEditor(page);
  await expect(board(page).locator('[data-layer="board"] [data-hole]')).toHaveCount(830);

  // 3–6：從元件庫拖入 74LS00、LED、電阻、VCC、GND
  await dragPart(page, '74LS00', await holeCenter(page, 'E13'));
  await dragPart(page, 'led-red', midpoint(await holeCenter(page, 'G40'), await holeCenter(page, 'G41')));
  await dragPart(page, 'resistor-220', await holeCenter(page, 'G32'));
  await dragPart(page, 'vcc', await holeCenter(page, 'T+5'));
  await dragPart(page, 'gnd', await holeCenter(page, 'B-5'));
  await expect(components(page)).toHaveCount(5);

  // 7：手動接線
  for (const [from, to] of MANUAL_WIRES) await drawWire(page, from, to);
  await expect(wires(page, 'm')).toHaveCount(7);
  await expect(page.getByText('導線 7', { exact: true })).toBeVisible();

  // 8–9：電路檢查，看到檢查結果
  await page.getByRole('button', { name: '電路檢查 Check Circuit' }).click();
  await expect(page.getByRole('tab', { name: '檢查結果' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).not.toBeEmpty();

  // 10–12：AI 標準佈線，依 Net 重新計算所有導線
  await page.getByRole('button', { name: 'AI 標準佈線' }).click();
  const card = page.getByRole('status').filter({ hasText: 'Standard Routing Complete' });
  await expect(card).toBeVisible();
  await expect(wires(page, 'm')).toHaveCount(0);
  await expect(wires(page, 'w_').first()).toBeAttached();

  // 13–17：新導線只有水平垂直、沒有重疊，統計卡顯示 Crossings、Total Length、Bends
  const paths = await wires(page, 'w_').evaluateAll((els) => els.map((el) => el.querySelector('path')?.getAttribute('d') ?? ''));
  expect(paths.length).toBeGreaterThan(0);
  for (const d of paths) {
    const points = [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(points.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < points.length; i++) {
      expect(points[i][0] === points[i - 1][0] || points[i][1] === points[i - 1][1]).toBe(true);
    }
  }
  for (const label of ['Wire Count', 'Total Length', 'Bends', 'Crossings', 'Overlaps']) {
    await expect(card.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(card.locator('dt', { hasText: 'Overlaps' }).locator('xpath=following-sibling::dd[1]')).toHaveText('0');

  // 18：顯示 Routing Score（統計卡與狀態列）
  await expect(card.getByText('Routing Score', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Routing Score \d+(\.\d+)?$/)).toBeVisible();

  // 19：比較模式（1440 px 寬，左右並排）
  await page.getByRole('button', { name: '比較' }).click();
  await expect(page.getByTestId('board-svg')).toHaveCount(2);
  for (const svg of await page.getByTestId('board-svg').all()) {
    await expect.poll(() => wholeBoardVisible(svg)).toBe(true);
  }
  await expect(page.getByText(/^你的接線（Routing Score/)).toBeVisible();
  await expect(page.getByText(/^AI 標準佈線（Routing Score/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('board-svg')).toHaveCount(1);

  // 20：Ctrl+Z 回到佈線前的接線
  await page.keyboard.press('Control+z');
  await expect(wires(page, 'm')).toHaveCount(7);
  await expect(wires(page, 'w_')).toHaveCount(0);
  await expect(page.getByText('導線 7', { exact: true })).toBeVisible();
});
