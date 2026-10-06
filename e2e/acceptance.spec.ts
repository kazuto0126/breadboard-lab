import { expect, test, type Page } from '@playwright/test';

/**
 * 需求文件第三十四章「最重要的驗收標準」：打開網站 → 放 74LS00、LED、電阻、VCC、GND →
 * 手動接線 → Check Circuit → AI Standard Route → 只走水平垂直、不重疊、少交叉 → 顯示 Routing Score
 * 與前後差異 → 可以 Undo。全部用真實的滑鼠拖曳操作完成。
 */

async function centerOf(page: Page, selector: string) {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`${selector} is not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const hole = (page: Page, name: string) => centerOf(page, `[data-hole="${name}"]`);
const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

async function dragFromLibrary(page: Page, key: string, target: { x: number; y: number }) {
  const from = await centerOf(page, `[data-library-item="${key}"]`);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y, { steps: 3 });
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await page.mouse.up();
}

async function drawWire(page: Page, from: string, to: string) {
  const a = await hole(page, from);
  const b = await hole(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + (b.x - a.x) * 0.3, a.y + (b.y - a.y) * 0.3, { steps: 3 });
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

async function savedCircuit(page: Page) {
  // 自動儲存有 400 ms 的延遲。
  await page.waitForTimeout(600);
  return page.evaluate(() => JSON.parse(localStorage.getItem('breadboard-lab:autosave') ?? 'null')?.circuit);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('[data-hole]')).toHaveCount(830);
});

test('第三十四章驗收流程：放置、接線、檢查、AI 標準佈線、比較、Undo', async ({ page }) => {
  await page.getByRole('button', { name: '關閉' }).first().click();

  // 3–6. 放入 74LS00（跨在凹槽上）、LED、電阻、VCC、GND。
  await dragFromLibrary(page, '74LS00', mid(await hole(page, 'E13'), await hole(page, 'F13')));
  await dragFromLibrary(page, 'led-red', mid(await hole(page, 'G40'), await hole(page, 'G41')));
  await dragFromLibrary(page, 'resistor-220', await hole(page, 'G32'));
  await dragFromLibrary(page, 'vcc', await hole(page, 'T+5'));
  await dragFromLibrary(page, 'gnd', await hole(page, 'B-5'));
  let circuit = await savedCircuit(page);
  expect(circuit.components.map((c: { id: string; anchor: { x: number; y: number } }) => [c.id, c.anchor.x, c.anchor.y])).toEqual([
    ['U1', 10, 11],
    ['D1', 40, 12],
    ['R1', 30, 12],
    ['V1', 5, 2],
    ['G1', 5, 18],
  ]);

  // 7. 手動接線。
  await drawWire(page, 'T+6', 'A10'); // VCC → U1 第 14 腳
  await drawWire(page, 'B-15', 'J16'); // GND → U1 第 7 腳
  await drawWire(page, 'J10', 'B-10'); // 第 1 腳接地
  await drawWire(page, 'J11', 'B-11'); // 第 2 腳接地
  await drawWire(page, 'H12', 'H30'); // 1Y → 電阻
  await drawWire(page, 'J34', 'J40'); // 電阻 → LED 陽極
  await drawWire(page, 'J41', 'B-41'); // LED 陰極 → GND
  await expect(page.getByTestId('wire-count')).toHaveText('7');
  circuit = await savedCircuit(page);
  for (const w of circuit.wires as Array<{ path: Array<{ x: number; y: number }> }>) {
    for (let i = 1; i < w.path.length; i++) {
      expect(Math.abs(w.path[i].x - w.path[i - 1].x) + Math.abs(w.path[i].y - w.path[i - 1].y)).toBe(1);
    }
  }

  // 8–9. Check Circuit：沒有錯誤（未使用的閘輸入懸空只是警告）。
  await page.getByRole('button', { name: '✓ Check Circuit' }).click();
  await expect(page.getByTestId('check-badge')).toContainText('0 個錯誤');

  // 10–18. AI 標準佈線。
  await page.getByRole('button', { name: '⚡ AI 標準佈線' }).click();
  const card = page.getByTestId('routing-result');
  await expect(card).toContainText('Standard Routing Complete', { timeout: 20_000 });
  await expect(card.locator('[data-metric="crossings"]')).toHaveText('0');
  await expect(card.locator('[data-metric="overlaps"]')).toHaveText('0');
  expect(Number(await card.locator('[data-metric="score"]').textContent())).toBeGreaterThanOrEqual(90);
  await expect(page.getByTestId('mode')).toHaveText('AUTO ROUTE');
  circuit = await savedCircuit(page);
  expect(circuit.wires.every((w: { source: string }) => w.source === 'auto')).toBe(true);

  // 19. 最佳化前後差異。
  await card.getByRole('button', { name: '比較 Compare' }).click();
  await expect(page.getByTestId('compare-view')).toContainText('User Routing');
  await expect(page.getByTestId('compare-view')).toContainText('AI Standard Routing');
  await page.getByRole('button', { name: '返回編輯' }).click();

  // 20. 可以 Undo，回到手動接線；Redo 再回到 AI 佈線。
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('mode')).toHaveText('MANUAL');
  circuit = await savedCircuit(page);
  expect(circuit.wires.every((w: { source: string }) => w.source === 'manual')).toBe(true);
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByTestId('mode')).toHaveText('AUTO ROUTE');
});

test('沒有合法路徑時回報 "No valid routing solution."，電路不變', async ({ page }) => {
  // 需求文件第三十三章 Test 6：第 20 欄上半的 5 個孔全被元件腳佔滿，沒有空孔可以接線。
  const circuit = {
    version: 1,
    boards: [{ id: 'b1', layoutId: 'MB102', x: 0, y: 0, groupId: null }],
    components: [
      { id: 'R1', defId: 'resistor', boardId: 'b1', anchor: { x: 20, y: 4 }, rotation: 90, span: 1, props: {} },
      { id: 'R2', defId: 'resistor', boardId: 'b1', anchor: { x: 20, y: 6 }, rotation: 90, span: 1, props: {} },
      { id: 'D1', defId: 'led', boardId: 'b1', anchor: { x: 20, y: 8 }, rotation: 0, props: {} },
      { id: 'D2', defId: 'led', boardId: 'b1', anchor: { x: 40, y: 6 }, rotation: 0, props: {} },
    ],
    wires: [
      {
        id: 'u1',
        color: '#1565c0',
        source: 'manual',
        start: { boardId: 'b1', x: 20, y: 4 },
        end: { boardId: 'b1', x: 40, y: 4 },
        path: Array.from({ length: 21 }, (_, i) => ({ boardId: 'b1', x: 20 + i, y: 4 })),
      },
    ],
  };
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: '匯入 JSON… Import' }).click()]);
  await chooser.setFiles({ name: 'test6.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(circuit)) });
  await expect(page.getByTestId('wire-count')).toHaveText('1');

  await page.getByRole('button', { name: '⚡ AI 標準佈線' }).click();
  const card = page.getByTestId('routing-result');
  await expect(card).toContainText('No valid routing solution.', { timeout: 20_000 });
  await expect(card).toContainText('沒有空孔可以接線');
  await expect(page.getByTestId('wire-count')).toHaveText('1');
  await expect(page.getByTestId('mode')).toHaveText('MANUAL');
});

test('Undo / Redo 放置、旋轉、刪除，且電路會自動儲存', async ({ page }) => {
  await dragFromLibrary(page, '74LS04', mid(await hole(page, 'E23'), await hole(page, 'F23')));
  let circuit = await savedCircuit(page);
  expect(circuit.components).toHaveLength(1);
  expect(circuit.components[0]).toMatchObject({ id: 'U1', defId: '74LS04', anchor: { x: 20, y: 11 }, rotation: 0 });

  // 選取後按 R：DIP 轉 90° 插不進去，直接翻轉 180°（同一組孔）。
  const body = await centerOf(page, 'g[data-component-id="U1"]');
  await page.mouse.click(body.x, body.y);
  await page.keyboard.press('r');
  circuit = await savedCircuit(page);
  expect(circuit.components[0]).toMatchObject({ rotation: 180, anchor: { x: 26, y: 8 } });

  await page.keyboard.press('Delete');
  circuit = await savedCircuit(page);
  expect(circuit.components).toHaveLength(0);

  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  circuit = await savedCircuit(page);
  expect(circuit.components[0]).toMatchObject({ rotation: 0, anchor: { x: 20, y: 11 } });

  // 重新整理後自動還原。
  await page.reload();
  await expect(page.locator('g[data-component-id="U1"]')).toHaveCount(1);
});
