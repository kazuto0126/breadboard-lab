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
  // 手動接線是兩孔之間的直線（子專案 6）。
  for (const w of circuit.wires as Array<{ straight?: boolean; path: unknown[] }>) {
    expect(w.straight).toBe(true);
    expect(w.path).toHaveLength(2);
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
  // 子專案 7：每條線都是水平或垂直的直線，每個孔只插一條線。
  type Saved = { straight?: boolean; start: { x: number; y: number }; end: { x: number; y: number } };
  for (const w of circuit.wires as Saved[]) {
    expect(w.straight).toBe(true);
    expect(w.start.x === w.end.x || w.start.y === w.end.y).toBe(true);
  }
  const ends = (circuit.wires as Saved[]).flatMap((w) => [`${w.start.x},${w.start.y}`, `${w.end.x},${w.end.y}`]);
  expect(new Set(ends).size).toBe(ends.length);

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

  // 重新整理後自動還原；沒有存檔過，所以仍算未儲存，開新電路前會先確認。
  await page.reload();
  await expect(page.locator('g[data-component-id="U1"]')).toHaveCount(1);
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: '新電路 New Circuit' }).click();
  await expect(page.getByRole('dialog', { name: '建立新電路？' })).toBeVisible();
});

test('邏輯模擬：在板上撥指撥開關、按按鈕，LED 即時反應', async ({ page }) => {
  const openExample = async (name: string) => {
    await page.getByRole('button', { name: '檔案', exact: true }).click();
    await page.getByRole('menuitem', { name, exact: true }).click();
  };
  const litLeds = async (ids: string[]) => {
    const states = await Promise.all(ids.map((id) => page.locator(`g[data-component-id="${id}"][data-lit]`).count()));
    return states.join('');
  };

  // 74LS283：全部 OFF 時 A = B = 15、C0 = 0 → 30 = 1 1110。
  await openExample('74LS283 4 位元加法器');
  await page.getByRole('button', { name: '▶ 模擬', exact: true }).click();
  await expect(page.getByTestId('simulation-bar')).toContainText('模擬中');
  await expect.poll(() => litLeds(['D1', 'D2', 'D3', 'D4', 'D5'])).toBe('01111');

  // A = 3（SW1 開關 3、4 ON）、B = 5（SW2 開關 2、4 ON）→ 8 = 0 1000。
  for (const k of [2, 3]) await page.locator(`g[data-component-id="SW1"] [data-switch="${k}"]`).click();
  for (const k of [1, 3]) await page.locator(`g[data-component-id="SW2"] [data-switch="${k}"]`).click();
  await expect.poll(() => litLeds(['D1', 'D2', 'D3', 'D4', 'D5'])).toBe('00010');

  // 模擬中不能移動元件。
  const ic = page.locator('g[data-component-id="U1"]');
  const before = await ic.getAttribute('transform');
  const box = (await ic.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(ic).toHaveAttribute('transform', before!);
  await page.getByRole('button', { name: '■ 停止模擬', exact: true }).click();

  // 74LS93：每按一次按鈕加 1，3 次後 QA、QB 亮。
  await openExample('74LS93 計數器');
  await page.getByRole('button', { name: '▶ 模擬', exact: true }).click();
  const button = page.locator('g[data-component-id="SW1"] [data-button]');
  for (let i = 0; i < 3; i++) {
    const b = (await button.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.up();
  }
  await expect.poll(() => litLeds(['D1', 'D2', 'D3', 'D4'])).toBe('1100');
});

test('第三十八章：新增麵包板、拖曳吸附成群組、整組移動、跨板接線', async ({ page }) => {
  await page.getByRole('button', { name: '關閉' }).first().click();
  const holeOf = (board: string, name: string) => centerOf(page, `[data-board="${board}"] [data-hole="${name}"]`);
  const dragBy = async (from: { x: number; y: number }, dx: number, dy: number, during?: () => Promise<void>) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + dx * 0.5, from.y + dy * 0.5, { steps: 4 });
    await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 });
    if (during) await during();
    await page.mouse.up();
  };

  // 測試 1：新增第二塊板（放在第一塊下方、隔 4 格）。
  await page.getByRole('button', { name: '＋ 新增麵包板' }).click();
  await expect(page.locator('[data-hole]')).toHaveCount(1660);
  let circuit = await savedCircuit(page);
  expect(circuit.boards.map((b: { id: string; y: number; groupId: string | null }) => [b.id, Math.round(b.y / 2.54), b.groupId])).toEqual([
    ['b1', 0, null],
    ['b2', 24, null],
  ]);

  // 1 格在螢幕上的像素（Fit to Screen 之後的縮放）。
  const pitch = (await holeOf('b1', 'A2')).x - (await holeOf('b1', 'A1')).x;

  // 測試 2、3：拖曳 b2 的凹槽往上靠近 b1，出現 SNAP 預覽，放開後貼齊並成為同一個 Board Group。
  const b2Channel = mid(await holeOf('b2', 'E32'), await holeOf('b2', 'F32'));
  await dragBy(b2Channel, 1.3 * pitch, -3.6 * pitch, async () => {
    await expect(page.locator('[data-ui="snap-preview"]')).toContainText('SNAP');
  });
  await expect(page.locator('[data-board-group]')).toContainText('Board Group 1 · 2 Boards');
  circuit = await savedCircuit(page);
  expect(circuit.boards.map((b: { x: number; y: number; groupId: string | null }) => [Math.round(b.x / 2.54), Math.round(b.y / 2.54), b.groupId])).toEqual([
    [0, 0, 'g-b1'],
    [0, 20, 'g-b1'],
  ]);

  // 測試 4：拖曳 b1，b1 + b2 一起移動。
  const b1Channel = mid(await holeOf('b1', 'E32'), await holeOf('b1', 'F32'));
  await dragBy(b1Channel, 6 * pitch, 2 * pitch);
  circuit = await savedCircuit(page);
  expect(circuit.boards.map((b: { x: number; y: number }) => [Math.round(b.x / 2.54), Math.round(b.y / 2.54)])).toEqual([
    [6, 2],
    [6, 22],
  ]);

  // 測試 8：從 b1 的空孔拉一條導線到 b2，導線經過兩板之間的接縫。
  const from = await holeOf('b1', 'J12');
  const to = await holeOf('b2', 'A12');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + (to.y - from.y) * 0.3, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('wire-count')).toHaveText('1');
  circuit = await savedCircuit(page);
  expect(new Set(circuit.wires[0].path.map((p: { boardId: string }) => p.boardId))).toEqual(new Set(['b1', 'b2']));
  await page.getByRole('button', { name: '✓ Check Circuit' }).click();
  await expect(page.getByTestId('check-badge')).toContainText('Circuit Valid');

  // 有跨板導線時，Alt + 拖曳只移動 b2 會被擋下並回到原位。
  const b2Again = mid(await holeOf('b2', 'E40'), await holeOf('b2', 'F40'));
  await page.keyboard.down('Shift');
  await dragBy(b2Again, 0, 6 * pitch);
  await page.keyboard.up('Shift');
  await expect(page.locator('[data-toast="warning"]').last()).toContainText('不能把這塊板拆開');
  circuit = await savedCircuit(page);
  expect(circuit.boards.map((b: { y: number; groupId: string | null }) => [Math.round(b.y / 2.54), b.groupId])).toEqual([
    [2, 'g-b1'],
    [22, 'g-b1'],
  ]);
});

test('接線清單：照著 AI 標準佈線插線、打勾，重新整理後進度仍在', async ({ page }) => {
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: '74LS00 + LED（驗收電路）' }).click();
  await page.getByRole('button', { name: '⚡ AI 標準佈線' }).click();
  await expect(page.getByTestId('routing-result')).toContainText('Standard Routing Complete', { timeout: 20_000 });

  await page.getByRole('tab', { name: /接線清單/ }).click();
  const progress = page.getByTestId('checklist-progress');
  await expect(progress).toHaveText(/已完成 0 \/ \d+/);
  const total = Number(/\/ (\d+)/.exec((await progress.textContent()) ?? '')![1]);
  const rows = page.locator('[data-checklist-row]');
  await expect(rows).toHaveCount(total);

  // 插好第一條（電源線）就打勾。
  await rows.first().getByRole('checkbox').check();
  await expect(progress).toHaveText(`已完成 1 / ${total}`);

  // 點第二列：選取那條線，其他導線變淡，分頁不變。
  await rows.nth(1).getByRole('button').click();
  const focused = await rows.nth(1).getAttribute('data-checklist-row');
  await expect(page.locator(`g[data-wire-id="${focused}"]`)).toHaveAttribute('opacity', '1');
  await expect(page.locator(`g[data-wire-id]:not([data-wire-id="${focused}"])`).first()).toHaveAttribute('opacity', '0.3');
  await expect(page.getByRole('tab', { name: /接線清單/ })).toHaveAttribute('aria-selected', 'true');

  // 重新整理後勾選進度仍在（跟著自動儲存）。
  await page.waitForTimeout(600);
  await page.reload();
  await page.getByRole('tab', { name: /接線清單/ }).click();
  await expect(page.getByTestId('checklist-progress')).toHaveText(`已完成 1 / ${total}`);
  await page.getByRole('button', { name: '全部清除' }).click();
  await expect(page.getByTestId('checklist-progress')).toHaveText(`已完成 0 / ${total}`);
});
