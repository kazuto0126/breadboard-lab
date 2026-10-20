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
  await expect(dialog.getByTestId('convert-preview')).toContainText('74LS08 × 1、74LS32 × 1、4 位元指撥開關 × 1、電阻 × 1、LED × 1');
  await dialog.getByRole('button', { name: '轉換' }).click();

  // 子專案 36：轉換在背景試好幾種擺法，算完才放上麵包板。
  for (const id of ['U1', 'U2', 'SW1', 'D1']) await expect(page.locator(`g[data-component-id="${id}"]`)).toHaveCount(1, { timeout: 90_000 });
  // 等 AI 佈線（可移動 IC）結束。
  await expect(page.getByTestId('status')).not.toContainText('Routing…', { timeout: 60_000 });
  await page.getByRole('tab', { name: /檢查/ }).click();
  await expect(page.getByTestId('diagram-check')).toContainText('8 種輸入組合，麵包板的模擬結果和真值表全部一致', { timeout: 60_000 });

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
  await expect(page.getByTestId('diagram-check')).toContainText('全部一致', { timeout: 120_000 });
  await expect(page.getByTestId('status')).not.toContainText('Routing…', { timeout: 120_000 });
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

test('預設不加上 / 下拉電阻，勾選後零件清單多出輸入電阻', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: '多數決電路（圖 2-5）' }).click();
  await page.getByRole('button', { name: '轉成麵包板…' }).click();
  const dialog = page.getByRole('dialog', { name: '轉成麵包板' });
  const preview = dialog.getByTestId('convert-preview');
  await expect(preview).toContainText('電阻 × 1');
  await dialog.getByLabel(/加上 \/ 下拉電阻/).check();
  await expect(preview).toContainText('電阻 × 4');
});

test('轉成麵包板時輸入用按鈕：每個輸入一顆、名稱在板上，依名稱比對全部一致（子專案 30）', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: '多數決電路（圖 2-5）' }).click();
  await page.getByRole('button', { name: '轉成麵包板…' }).click();
  const dialog = page.getByRole('dialog', { name: '轉成麵包板' });
  await dialog.getByText('按鈕', { exact: true }).click();
  await expect(dialog.getByTestId('convert-preview')).toContainText('按鈕 × 3');
  await dialog.getByRole('button', { name: '轉換' }).click();

  for (const id of ['BTN1', 'BTN2', 'BTN3']) await expect(page.locator(`g[data-component-id="${id}"]`)).toHaveCount(1, { timeout: 90_000 });
  for (const name of ['A', 'B', 'C']) await expect(page.locator(`[data-label="${name}"]`)).toHaveCount(1);
  await expect(page.getByTestId('status')).not.toContainText('Routing…', { timeout: 60_000 });
  await page.getByRole('tab', { name: /檢查/ }).click();
  await expect(page.getByTestId('diagram-check')).toContainText('8 種輸入組合，麵包板的模擬結果和真值表全部一致', { timeout: 60_000 });
  await expect(page.getByTestId('diagram-check')).toContainText('A → BTN1（按下 = 1）');
});

test('轉成麵包板：電源接最近的軌，軌和軌之間不拉線（子專案 34）', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // BCD 範例轉成 EIC-1106 時，AI 佈線會把 IC 轉 180° 或換插孔區：電源還是要接搬好之後最近的軌。
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: 'BCD 顯示（7 段顯示器）' }).click();
  await page.getByRole('button', { name: '轉成麵包板…' }).click();
  await page.getByRole('dialog', { name: '轉成麵包板' }).getByRole('button', { name: '轉換' }).click();
  await expect(page.getByTestId('status')).not.toContainText('Routing…', { timeout: 120_000 });
  await page.getByRole('tab', { name: /接線清單/ }).click();

  const labels = await page.locator('[data-checklist-row] input[type="checkbox"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  expect(labels.length).toBeGreaterThan(0);
  const rail = /^P(\d)([+-])\d+$/;
  const hole = /^(\d)-([A-J])\d+$/;
  for (const label of labels) {
    const [from, to] = label.replace(' 已插好', '').split(' → ');
    const ends = [from, to].map((s) => rail.exec(s));
    expect(ends.every(Boolean), `${label} 兩端都在電源軌`).toBe(false);
    const r = ends[0] ?? ends[1];
    if (!r) continue;
    const h = hole.exec(ends[0] ? to : from);
    if (!h) continue;
    // 第 k 區上半部（A–E）最近的軌是 P(k+1)，下半部（F–J）是 P(k+2)。
    const nearest = Number(h[1]) + (h[2] <= 'E' ? 1 : 2);
    expect(Number(r[1]), `${label} 不是最近的軌`).toBe(nearest);
  }
});

test('轉成麵包板：在背景試好幾種擺法，下拉電阻直立插進電源軌，兩步 Undo（子專案 36）', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: '多數決電路（圖 2-5）' }).click();
  await page.getByRole('button', { name: '轉成麵包板…' }).click();
  const dialog = page.getByRole('dialog', { name: '轉成麵包板' });
  await dialog.getByText('加上 / 下拉電阻（實際接線建議勾）').click();
  await dialog.getByRole('button', { name: '轉換' }).click();

  // 算的時候顯示在試擺法；算完放上麵包板並佈好線。
  await expect(page.getByText('轉成麵包板：試好幾種擺法…')).toBeVisible();
  await expect(page.locator('g[data-component-id="U1"]')).toHaveCount(1, { timeout: 90_000 });
  await expect(page.getByTestId('status')).not.toContainText('Routing…', { timeout: 90_000 });
  await page.getByRole('tab', { name: /檢查/ }).click();
  await expect(page.getByTestId('diagram-check')).toContainText('全部一致', { timeout: 60_000 });

  // 下拉電阻直立：接線清單裡沒有接到下拉電阻那一排 J 列的電源線（電阻直接插進電源軌）。
  const wires = Number(await page.getByTestId('wire-count').textContent());
  expect(wires).toBeLessThanOrEqual(30);

  // 兩步 Undo：先回到還沒佈線的轉換結果，再回到轉換前（空的麵包板）。
  await page.locator('[data-testid="status"]').click();
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('wire-count')).not.toHaveText(String(wires));
  await page.keyboard.press('Control+z');
  await expect(page.locator('g[data-component-id="U1"]')).toHaveCount(0);
});

test('低態致動的輸出端：屬性面板切換後燈號 0 時亮，轉成麵包板後比對全部一致、LED 在 0 時亮（子專案 37）', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: '多數決電路（圖 2-5）' }).click();
  const lamp = page.locator('[data-logic-lamp="o1"]');
  await expect(lamp).toHaveText('0');
  await expect(lamp).toHaveAttribute('data-lit', 'off');

  // 選取輸出端 X，在屬性面板改成 0 時亮：燈號仍然寫 0，但亮了；輸入那一側多一個小圓圈。
  await page.locator('[data-logic-node="o1"]').click();
  const low = page.getByRole('button', { name: '0 時亮（低態致動）' });
  await low.click();
  await expect(low).toHaveAttribute('aria-pressed', 'true');
  await expect(lamp).toHaveText('0');
  await expect(lamp).toHaveAttribute('data-lit', 'on');
  await expect(page.locator('[data-active-low="o1"]')).toHaveCount(1);
  // 可以 Undo（Undo 會取消選取，再選一次）。
  await page.keyboard.press('Control+z');
  await expect(lamp).toHaveAttribute('data-lit', 'off');
  await expect(page.locator('[data-active-low="o1"]')).toHaveCount(0);
  await page.locator('[data-logic-node="o1"]').click();
  await low.click();
  await expect(lamp).toHaveAttribute('data-lit', 'on');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: '轉成麵包板…' }).click();
  await page.getByRole('dialog', { name: '轉成麵包板' }).getByRole('button', { name: '轉換' }).click();
  await expect(page.locator('g[data-component-id="D1"]')).toHaveCount(1, { timeout: 90_000 });
  await expect(page.getByTestId('status')).not.toContainText('Routing…', { timeout: 90_000 });
  await page.getByRole('tab', { name: /檢查/ }).click();
  await expect(page.getByTestId('diagram-check')).toContainText('8 種輸入組合，麵包板的模擬結果和真值表全部一致', { timeout: 60_000 });

  // 模擬：開關都 OFF 時 X = 0，LED 亮；A、B 撥 ON（X = 1）後熄滅。
  await page.getByRole('button', { name: '▶ 模擬', exact: true }).click();
  await expect(page.getByTestId('simulation-bar')).toContainText('模擬中');
  const lit = () => page.locator('g[data-component-id="D1"][data-lit]').count();
  await expect.poll(lit).toBe(1);
  for (const k of [0, 1]) await page.locator(`g[data-component-id="SW1"] [data-switch="${k}"]`).click();
  await expect.poll(lit).toBe(0);
});

test('8 對 3 編碼器（實習七 C）：共用 OR 只用 2 片 74LS32，加上下拉電阻時用兩個 4 位元開關，比對全部一致（子專案 38）', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // 使用者的實習七 C 邏輯圖：X = E + F + G + H、Y = C + D + G + H、Z = B + D + F + H（4 輸入 OR，A 沒有用到）。
  // 7 個輸入超過題目的上限（6 個），所以用匯入 JSON。
  const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const feed: Record<string, string[]> = { g1: ['E', 'F', 'G', 'H'], g2: ['C', 'D', 'G', 'H'], g3: ['B', 'D', 'F', 'H'] };
  const logic = {
    version: 1,
    nodes: [
      ...names.map((name, k) => ({ id: `i${k + 1}`, kind: 'INPUT', x: 9, y: 9 + k, name, value: 0 })),
      { id: 'g1', kind: 'OR', x: 20, y: 5, inputs: 4 },
      { id: 'g2', kind: 'OR', x: 20, y: 11, inputs: 4 },
      { id: 'g3', kind: 'OR', x: 21, y: 18, inputs: 4 },
      { id: 'o1', kind: 'OUTPUT', x: 26, y: 7, name: 'X' },
      { id: 'o2', kind: 'OUTPUT', x: 27, y: 13, name: 'Y' },
      { id: 'o3', kind: 'OUTPUT', x: 27, y: 20, name: 'Z' },
    ],
    wires: [
      ...Object.entries(feed).flatMap(([g, ins]) => ins.map((n, pin) => ({ id: `${g}-${pin}`, from: `i${names.indexOf(n) + 1}`, to: { node: g, pin } }))),
      ...[1, 2, 3].map((k) => ({ id: `out${k}`, from: `g${k}`, to: { node: `o${k}`, pin: 0 } })),
    ],
  };
  const file = { format: 'breadboard-lab/circuit', version: 1, name: '實習七C', circuit: { version: 1, boards: [{ id: 'b1', layoutId: 'MB102', x: 0, y: 0, groupId: null }], components: [], wires: [] }, logic };
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: '匯入 JSON… Import' }).click()]);
  await chooser.setFiles({ name: '實習七C.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await page.getByTestId('view-switch').getByRole('button', { name: '邏輯圖' }).click();
  await expect(page.locator('[data-logic-node]')).toHaveCount(14);

  await page.getByRole('button', { name: '轉成麵包板…' }).click();
  const dialog = page.getByRole('dialog', { name: '轉成麵包板' });
  await dialog.getByText('加上 / 下拉電阻（實際接線建議勾）').click();
  // 4 輸入的 OR 拆開時共用 G + H：8 個 2 輸入 OR，2 片 74LS32（以前 3 片）。
  await expect(dialog.getByTestId('convert-preview')).toContainText('74LS32 × 2');
  await expect(dialog.getByTestId('convert-preview')).toContainText('8 位元指撥開關 × 1（可能改用 4 位元 × 2');
  // 自動選板：預覽不說一定放在 MB-102（這個電路最後是 EIC-1106）。
  await expect(dialog.getByTestId('convert-preview')).toContainText('先試 MB-102，排不完時改用 EIC-1106');
  await dialog.getByRole('button', { name: '轉換' }).click();

  await expect(page.locator('g[data-component-id="U2"]')).toHaveCount(1, { timeout: 90_000 });
  await expect(page.getByTestId('status')).not.toContainText('Routing…', { timeout: 90_000 });
  await expect(page.locator('g[data-component-id="U3"]')).toHaveCount(0);
  // 加上下拉電阻時開關拆成兩個 4 位元，電阻都直接插進電源軌。
  await expect(page.locator('g[data-component-id="SW2"]')).toHaveCount(1);
  expect(Number(await page.getByTestId('wire-count').textContent())).toBeLessThanOrEqual(62);
  await page.getByRole('tab', { name: /檢查/ }).click();
  await expect(page.getByTestId('diagram-check')).toContainText('256 種輸入組合，麵包板的模擬結果和真值表全部一致', { timeout: 60_000 });
});
