import { expect, test } from '@playwright/test';

const at = (x: number, y: number) => ({ boardId: 'b1', x, y });
const auto = (id: string, a: [number, number], b: [number, number]) => ({ id, color: '#1565c0', source: 'auto', straight: true, start: at(...a), end: at(...b), path: [at(...a), at(...b)] });
/** R1 第 2 腳在 A14、R2 第 1 腳在 H20；w1 B14 → B20、w2 E20 → G20（經過第 20 欄上半的轉接排）。 */
const circuit = {
  version: 1,
  boards: [{ id: 'b1', layoutId: 'MB102', x: 0, y: 0, groupId: null }],
  components: [
    { id: 'R1', defId: 'resistor', boardId: 'b1', anchor: { x: 10, y: 4 }, rotation: 0, props: {} },
    { id: 'R2', defId: 'resistor', boardId: 'b1', anchor: { x: 20, y: 13 }, rotation: 0, props: {} },
  ],
  wires: [auto('w1', [14, 5], [20, 5]), auto('w2', [20, 8], [20, 12])],
};
const KEY = 'breadboard-lab:gemini-api-key';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const sse = (text: string) => `data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text }] }, index: 0 }] })}\r\n\r\n`;

test('點一條 AI 佈好的線：看到這條線在做什麼，孔位可以點，問 AI 會帶上導線說明與佈線規則', async ({ page }) => {
  await page.goto('/');
  await page.evaluate((k) => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem(k, 'test-key-123');
  }, KEY);
  await page.reload();
  const sent: string[] = [];
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    sent.push(JSON.stringify(route.request().postDataJSON().contents));
    await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: sse('因為兩端不在同一列。') });
  });

  await page.getByRole('button', { name: '檔案', exact: true }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: '匯入 JSON… Import' }).click()]);
  await chooser.setFiles({ name: 'wire.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(circuit)) });
  await page.locator('g[data-wire-id="w2"]').click();

  const card = page.getByTestId('wire-explanation');
  await expect(card).toContainText('這條線在做什麼');
  await expect(card).toContainText('這段連線共 2 條線');
  await expect(card).toContainText('（本條）');
  await expect(card).toContainText('兩端不在同一列、也不在同一欄');
  await card.locator('[data-ai-link]', { hasText: 'B14' }).first().click();
  await expect(page.getByTestId('flash-ring')).toHaveCount(1);
  await expect(card).toBeVisible();

  await card.getByRole('button', { name: '為什麼這樣走？' }).click();
  await expect(card.locator('[data-ai-message="model"]')).toHaveText('Gemini：因為兩端不在同一列。');
  expect(sent[0]).toContain('【學生正在看的導線】');
  expect(sent[0]).toContain('【AI 標準佈線的規則】');
});
