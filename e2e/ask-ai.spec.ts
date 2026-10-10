import { expect, test, type Page } from '@playwright/test';

/** 和 explain.spec.ts 同一個電路：74LS00 第 14 腳（VCC）還沒接。 */
const circuit = {
  version: 1,
  boards: [{ id: 'b1', layoutId: 'MB102', x: 0, y: 0, groupId: null }],
  components: [
    { id: 'U1', defId: '74LS00', boardId: 'b1', anchor: { x: 10, y: 11 }, rotation: 0, props: {} },
    { id: 'V1', defId: 'vcc', boardId: 'b1', anchor: { x: 3, y: 2 }, rotation: 0, props: {} },
    { id: 'G1', defId: 'gnd', boardId: 'b1', anchor: { x: 3, y: 18 }, rotation: 0, props: {} },
  ],
  wires: [
    {
      id: 'g1', color: '#212121', source: 'manual',
      start: { boardId: 'b1', x: 16, y: 15 }, end: { boardId: 'b1', x: 16, y: 18 },
      path: [15, 16, 17, 18].map((y) => ({ boardId: 'b1', x: 16, y })),
    },
  ],
};

const KEY = 'breadboard-lab:gemini-api-key';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const sse = (...texts: string[]) =>
  texts.map((text) => `data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text }] }, index: 0 }] })}\r\n\r\n`).join('');

interface Sent {
  url: string;
  key: string | undefined;
  contents: Array<{ role: string; parts: Array<{ text?: string }> }>;
}

/** 攔截送往 Gemini 的請求，回傳假的回答；不會真的連到 Google、不需要真的金鑰。 */
async function fakeGemini(page: Page, reply: (n: number) => { status: number; type: string; body: string }) {
  const sent: Sent[] = [];
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const headers = await request.allHeaders();
    sent.push({ url: request.url(), key: headers['x-goog-api-key'], contents: request.postDataJSON().contents });
    const r = reply(sent.length);
    await route.fulfill({ status: r.status, headers: { ...CORS, 'content-type': r.type }, body: r.body });
  });
  return sent;
}

async function openVccIssue(page: Page) {
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: '匯入 JSON… Import' }).click()]);
  await chooser.setFiles({ name: 'ask.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(circuit)) });
  await expect(page.locator('g[data-component-id="U1"]')).toHaveCount(1);
  await page.getByRole('button', { name: '電路', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Check Circuit 檢查電路' }).click();
  await page.getByRole('button', { name: /第 14 腳 VCC 未連接/ }).click();
  return page.getByTestId('ask-ai');
}

/** 套件把串流的每一段各記成一筆 model 內容；比較時把連續同一方的內容接起來。 */
function turns(call: { contents: Array<{ role: string; parts: Array<{ text?: string }> }> }): string[] {
  const out: Array<{ role: string; text: string }> = [];
  for (const c of call.contents) {
    const text = c.parts.map((p) => p.text ?? '').join('');
    const prev = out.at(-1);
    if (prev && prev.role === c.role) prev.text += text;
    else out.push({ role: c.role, text });
  }
  return out.map((t) => `${t.role}:${t.text}`);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await expect(page.locator('[data-hole]')).toHaveCount(830);
});

test('設定金鑰後按建議問題、接著打字追問；追問時帶著前一輪的問答', async ({ page }) => {
  const sent = await fakeGemini(page, (n) => ({ status: 200, type: 'text/event-stream', body: n === 1 ? sse('因為 VCC 腳', '沒有接到 +5 V。') : sse('也可以接 B+ 軌。') }));
  const ask = await openVccIssue(page);

  await ask.getByRole('button', { name: '設定 Gemini API 金鑰' }).click();
  const dialog = page.getByRole('dialog', { name: 'Gemini API 金鑰' });
  await expect(dialog.getByRole('link', { name: 'Google AI Studio' })).toHaveAttribute('href', 'https://aistudio.google.com/apikey');
  await dialog.getByLabel('API 金鑰').fill('test-key-123');
  await dialog.getByRole('button', { name: '儲存' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate((k) => [sessionStorage.getItem(k), localStorage.getItem(k)], KEY)).toEqual(['test-key-123', null]);

  await ask.getByRole('button', { name: '為什麼會這樣？' }).click();
  await expect(ask.locator('[data-ai-message="model"]')).toHaveText('Gemini：因為 VCC 腳沒有接到 +5 V。');
  expect(sent[0].url).toContain('models/gemini-3.5-flash:streamGenerateContent');
  expect(sent[0].key).toBe('test-key-123');
  expect(turns(sent[0])).toHaveLength(1);
  expect(turns(sent[0])[0]).toContain('【電路摘要】');
  expect(turns(sent[0])[0]).toContain('第 14 腳 VCC @ E10');
  expect(turns(sent[0])[0]).toMatch(/【學生的問題】\n為什麼會這樣？$/);
  await expect(ask.getByRole('button', { name: '為什麼會這樣？' })).toHaveCount(0);

  const box = ask.getByLabel('問 AI 的問題');
  await box.fill('不想接 T+ 軌可以嗎？');
  await box.press('Enter');
  await expect(ask.locator('[data-ai-message="model"]').nth(1)).toHaveText('Gemini：也可以接 B+ 軌。');
  expect(turns(sent[1]).slice(1)).toEqual(['model:因為 VCC 腳沒有接到 +5 V。', 'user:不想接 T+ 軌可以嗎？']);
  await expect(box).toHaveValue('');
  await expect(ask).toContainText('AI 的回答可能有錯');
});

test('記住金鑰、金鑰錯誤時顯示原因，可以從選單重新設定或清除', async ({ page }) => {
  await fakeGemini(page, () => ({
    status: 400,
    type: 'application/json',
    body: JSON.stringify({ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }),
  }));
  await page.getByRole('button', { name: '說明', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Gemini API 金鑰設定…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Gemini API 金鑰' });
  await expect(dialog.getByTestId('ai-key-status')).toHaveText('目前沒有金鑰。');
  await dialog.getByLabel('API 金鑰').fill('wrong-key');
  await dialog.getByLabel('在這台電腦記住（關掉分頁後仍保留）').check();
  await dialog.getByRole('button', { name: '儲存' }).click();
  expect(await page.evaluate((k) => [sessionStorage.getItem(k), localStorage.getItem(k)], KEY)).toEqual([null, 'wrong-key']);

  const ask = await openVccIssue(page);
  await ask.getByRole('button', { name: '有沒有別的改法？' }).click();
  await expect(ask.getByTestId('ai-error')).toContainText('金鑰不正確或沒有權限，請重新設定。');
  await ask.getByRole('button', { name: '重新設定金鑰' }).click();
  await expect(dialog.getByTestId('ai-key-status')).toHaveText('已設定，記在這台電腦。');
  await dialog.getByRole('button', { name: '清除金鑰' }).click();
  await expect(dialog.getByTestId('ai-key-status')).toHaveText('目前沒有金鑰。');
  expect(await page.evaluate((k) => [sessionStorage.getItem(k), localStorage.getItem(k)], KEY)).toEqual([null, null]);
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(ask.getByRole('button', { name: '設定 Gemini API 金鑰' })).toBeVisible();
});
