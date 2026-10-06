import { resolve } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';

export interface Pt {
  x: number;
  y: number;
}

/** 主畫面的麵包板（比較模式下是第一塊）。 */
export function board(page: Page): Locator {
  return page.getByTestId('board-svg').first();
}

export async function holeCenter(page: Page, name: string): Promise<Pt> {
  const box = await board(page).locator(`[data-layer="board"] [data-hole="${name}"]`).boundingBox();
  if (!box) throw new Error(`hole ${name} is not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export function midpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** 相鄰兩孔在螢幕上的距離（像素）。 */
export async function cellSize(page: Page): Promise<number> {
  const a = await holeCenter(page, 'A1');
  const b = await holeCenter(page, 'A2');
  return b.x - a.x;
}

/** 打開編輯器，等到第一次「符合畫面」完成、孔的位置不再變動。 */
export async function openEditor(page: Page, url = '/'): Promise<void> {
  await page.goto(url);
  await expect(board(page)).toBeVisible();
  await expect
    .poll(async () => {
      const a = await holeCenter(page, 'A1');
      await page.waitForTimeout(100);
      const b = await holeCenter(page, 'A1');
      return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    })
    .toBeLessThan(0.5);
}

/** 從元件庫把元件拖到板子上；to 是元件範圍中心要落下的位置。 */
export async function dragPart(page: Page, key: string, to: Pt): Promise<void> {
  const tile = page.locator(`[data-part="${key}"]`);
  await tile.scrollIntoViewIfNeeded();
  const box = await tile.boundingBox();
  if (!box) throw new Error(`part ${key} is not visible`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

/** 用滑鼠從一個孔拉線到另一個孔：先往水平方向動，產生「先水平再垂直」的 L 形。 */
export async function drawWire(page: Page, from: string, to: string): Promise<void> {
  const a = await holeCenter(page, from);
  const b = await holeCenter(page, to);
  const cell = await cellSize(page);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  if (Math.abs(b.x - a.x) >= 1) await page.mouse.move(a.x + Math.sign(b.x - a.x) * cell * 0.8, a.y, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
}

/** 檔案 → 匯入 JSON，選 e2e/fixtures 裡的檔案。 */
export async function importFixture(page: Page, file: string): Promise<void> {
  await page.getByRole('button', { name: '檔案' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: '匯入 JSON' }).click();
  await (await chooser).setFiles(resolve(process.cwd(), 'e2e/fixtures', file));
}

export function wires(page: Page, prefix = ''): Locator {
  return board(page).locator(prefix ? `[data-layer="wires"] [data-wire-id^="${prefix}"]` : '[data-layer="wires"] [data-wire-id]');
}

export function components(page: Page): Locator {
  return board(page).locator('[data-layer="components"] [data-component-id]');
}
