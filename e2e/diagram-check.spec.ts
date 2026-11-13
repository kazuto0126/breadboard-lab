import { expect, test } from '@playwright/test';

test('依名稱對照邏輯圖：改名稱會找不到、改邏輯圖會列出不一致，點一列就撥好開關開始模擬', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: '多數決電路（圖 2-5）' }).click();
  await page.getByRole('button', { name: '轉成麵包板…' }).click();
  await page.getByRole('dialog', { name: '轉成麵包板' }).getByRole('button', { name: '轉換' }).click();
  await expect(page.getByTestId('status')).not.toContainText('Routing…', { timeout: 120_000 });

  const card = page.getByTestId('diagram-check');
  await page.getByRole('tab', { name: /檢查/ }).click();
  await expect(card).toContainText('8 種輸入組合，麵包板的模擬結果和真值表全部一致');
  await expect(card).toContainText('X → D1');

  // LED 改名 → 找不到 X；改回來 → 一致。LED 在電阻旁邊、靠右上角，先關掉蓋在上面的佈線結果卡。
  await page.getByTestId('routing-result').getByLabel('關閉').click();
  await expect(page.getByTestId('routing-result')).toHaveCount(0);
  const rename = async (name: string) => {
    // LED 正中間可能是兩隻腳的點擊區：點燈罩上離兩隻腳都遠的地方（垂直於兩腳連線的方向）才會選到 LED。
    // 子專案 60 起 LED 可能直立（一腳插進電源軌），所以照腳的位置算，不寫死方向。
    const dome = (await page.locator('g[data-component-id="D1"] path').first().boundingBox())!;
    const pinsAt = await page.locator('circle[data-component-id="D1"][data-pin]').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }),
    );
    const [a, b] = pinsAt;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const reach = Math.min(dome.width, dome.height) * 0.35;
    await page.mouse.click(dome.x + dome.width / 2 - ((b.y - a.y) / len) * reach, dome.y + dome.height / 2 + ((b.x - a.x) / len) * reach);
    await page.getByRole('tab', { name: '屬性' }).click();
    const input = page.getByLabel('LED 名稱');
    await input.fill(name);
    await input.press('Enter');
    await page.getByRole('tab', { name: /檢查/ }).click();
  };
  await rename('Y');
  await expect(card).toContainText('還不能和邏輯圖比對');
  await expect(card).toContainText('輸出 X：找不到名稱是 X 的 LED');
  await rename('X');
  await expect(card).toContainText('全部一致');

  // 邏輯圖的 OR 換成 AND（X = ABC）：麵包板還是多數決，011、101、110 三列不一致。
  await page.getByTestId('view-switch').getByRole('button', { name: '邏輯圖' }).click();
  await page.locator('[data-logic-node="g4"]').click();
  await page.getByRole('button', { name: 'AND', exact: true }).click();
  await page.getByTestId('view-switch').getByRole('button', { name: '麵包板' }).click();
  await page.getByRole('tab', { name: /檢查/ }).click();
  await expect(card).toContainText('有 3 列不一致');
  await expect(card.locator('[data-mismatch-row]')).toHaveCount(3);
  await expect(card.locator('[data-mismatch-row="011"]')).toContainText('A B C = 0 1 1：應該 X = 0，麵包板 X = 1');

  // 點一列：撥好開關、開始模擬，板上的 LED 是麵包板的結果（亮）。
  await card.locator('[data-mismatch-row="011"]').click();
  await expect(page.getByTestId('simulation-bar')).toContainText('模擬中');
  await expect(page.locator('g[data-component-id="D1"][data-lit]')).toHaveCount(1);
});
