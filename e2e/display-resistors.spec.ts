import { expect, test } from '@playwright/test';

/** 子專案 44（規格 2026-10-24 display-resistors）：兩個 7 段顯示器時預設共用一顆電阻；子專案 49：選每段一顆時預覽說要兩塊 EIC-1106。 */
test('兩個 7 段顯示器：對話框預設共用一顆電阻，選每段一顆時說要兩塊板，轉換後比對一致', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const logic = {
    version: 1,
    nodes: [
      ...names.map((name, k) => ({ id: `i${k + 1}`, kind: 'INPUT', x: 4, y: 3 + k * 2, name, value: 0 })),
      { id: 'd1', kind: 'DISPLAY', x: 16, y: 2, name: 'S1' },
      { id: 'd2', kind: 'DISPLAY', x: 16, y: 12, name: 'S2' },
    ],
    wires: [0, 1].flatMap((k) => [0, 1, 2, 3].map((p) => ({ id: `w${k}${p}`, from: `i${k * 4 + p + 1}`, to: { node: `d${k + 1}`, pin: p } }))),
  };
  const file = { format: 'breadboard-lab/circuit', version: 1, name: '兩個顯示器', circuit: { version: 1, boards: [{ id: 'b1', layoutId: 'MB102', x: 0, y: 0, groupId: null }], components: [], wires: [] }, logic };
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: '匯入 JSON… Import' }).click()]);
  await chooser.setFiles({ name: 'two.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await page.getByTestId('view-switch').getByRole('button', { name: '邏輯圖' }).click();
  await expect(page.locator('[data-logic-node]')).toHaveCount(10);

  await page.getByRole('button', { name: '轉成麵包板…' }).click();
  const dialog = page.getByRole('dialog', { name: '轉成麵包板' });
  await expect(dialog.getByLabel(/共用一顆電阻/)).toBeChecked();
  await expect(dialog.getByTestId('convert-preview')).toContainText('電阻 × 10');
  await dialog.getByLabel(/每段一顆電阻/).check();
  await expect(dialog.getByTestId('convert-preview')).toContainText('電阻 × 22');
  await expect(dialog.getByTestId('convert-preview')).toContainText('放在兩塊 EIC-1106');
  // 指定一塊 EIC-1106 時不能轉，說明要選自動。
  await dialog.getByLabel('EIC-1106', { exact: true }).check();
  await expect(dialog.getByTestId('convert-preview')).toContainText('要用兩塊 EIC-1106，請把麵包板選「自動」');
  await expect(dialog.getByRole('button', { name: '轉換' })).toBeDisabled();
  await dialog.getByLabel('自動', { exact: true }).check();
  await dialog.getByLabel(/共用一顆電阻/).check();
  await dialog.getByRole('button', { name: '轉換' }).click();

  await expect(page.locator('g[data-component-id="DS2"]')).toHaveCount(1, { timeout: 120_000 });
  await expect(page.getByTestId('status')).not.toContainText('Routing…', { timeout: 120_000 });
  await page.getByRole('tab', { name: /檢查/ }).click();
  await expect(page.getByTestId('diagram-check')).toContainText('256 種輸入組合，麵包板的模擬結果和真值表全部一致', { timeout: 60_000 });
});
