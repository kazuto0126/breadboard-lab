import { expect, test, type Page } from '@playwright/test';

/** 子專案 8：74LS00 放在最右邊（F45），電阻與 LED 在最左邊；「AI 佈線（可移動 IC）」會把它搬近。 */
const at = (x: number, y: number) => ({ boardId: 'b1', x, y });
const straight = (id: string, a: [number, number], b: [number, number]) => ({
  id,
  color: '#888888',
  source: 'manual',
  straight: true,
  start: at(...a),
  end: at(...b),
  path: [at(...a), at(...b)],
});
const part = (id: string, defId: string, x: number, y: number) => ({ id, defId, boardId: 'b1', anchor: { x, y }, rotation: 0, props: {} });
const farCircuit = {
  version: 1,
  boards: [{ id: 'b1', layoutId: 'MB102', x: 0, y: 0, groupId: null }],
  components: [part('V1', 'vcc', 3, 2), part('G1', 'gnd', 3, 18), part('U1', '74LS00', 45, 11), part('R1', 'resistor', 5, 12), part('D1', 'led', 15, 12)],
  wires: [
    straight('w1', [45, 2], [45, 4]),
    straight('w2', [51, 18], [51, 15]),
    straight('w3', [45, 15], [45, 18]),
    straight('w4', [46, 15], [46, 18]),
    straight('w5', [47, 15], [5, 15]),
    straight('w6', [9, 15], [15, 15]),
    straight('w7', [16, 15], [16, 18]),
  ],
};

async function savedCircuit(page: Page) {
  // 自動儲存有 400 ms 的延遲。
  await page.waitForTimeout(600);
  return page.evaluate(() => JSON.parse(localStorage.getItem('breadboard-lab:autosave') ?? 'null')?.circuit);
}

test('AI 佈線（可移動 IC）：IC 搬近 LED、線都是直的，Undo 回到原位', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('button', { name: '⚡ 可移動 IC' })).toBeVisible();

  await page.getByRole('button', { name: '檔案', exact: true }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: '匯入 JSON… Import' }).click()]);
  await chooser.setFiles({ name: 'far.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(farCircuit)) });
  await expect(page.getByTestId('wire-count')).toHaveText('7');

  await page.getByRole('button', { name: '自動佈線', exact: true }).click();
  await page.getByRole('menuitem', { name: 'AI 佈線（可移動 IC）Auto Place & Route' }).click();
  const card = page.getByTestId('routing-result');
  await expect(card).toContainText('Standard Routing Complete', { timeout: 30_000 });
  await expect(page.getByTestId('ic-moves')).toContainText('U1：F45 →');
  await expect(page.getByTestId('mode')).toHaveText('AUTO ROUTE');

  const routed = await savedCircuit(page);
  expect(routed.components.find((c: { id: string }) => c.id === 'U1').anchor).not.toEqual({ x: 45, y: 11 });
  for (const w of routed.wires) {
    expect(w.straight).toBe(true);
    expect(w.start.x === w.end.x || w.start.y === w.end.y).toBe(true);
  }

  // 接線清單最上面先提醒把 IC 插到新位置。
  await page.getByRole('tab', { name: /接線清單/ }).click();
  await expect(page.getByTestId('checklist-moves')).toContainText('U1：F45 →');

  await card.getByRole('button', { name: '復原 Undo' }).click();
  const restored = await savedCircuit(page);
  expect(restored.components.find((c: { id: string }) => c.id === 'U1').anchor).toEqual({ x: 45, y: 11 });
  expect(restored.wires).toHaveLength(7);
});
