import { expect, test } from '@playwright/test';

/** 子專案 41（規格 2026-10-24 faster-conversion）：轉成麵包板同時用好幾個 Worker，取消時全部停下來。 */
test('轉成麵包板：同時用好幾個 Worker，按取消後全部停下來、板子不變', async ({ page }) => {
  test.setTimeout(120_000);
  // 記下每個 Worker 有沒有被停掉。
  await page.addInitScript(() => {
    const Original = window.Worker;
    const live = new Set<Worker>();
    let peak = 0;
    class Counted extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        live.add(this);
        peak = Math.max(peak, live.size);
      }
      terminate() {
        live.delete(this);
        super.terminate();
      }
    }
    window.Worker = Counted;
    (window as unknown as { __workers: () => { live: number; peak: number } }).__workers = () => ({ live: live.size, peak });
  });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const workers = () => page.evaluate(() => (window as unknown as { __workers: () => { live: number; peak: number } }).__workers());
  const cores = await page.evaluate(() => navigator.hardwareConcurrency || 2);

  await page.getByRole('button', { name: '檔案', exact: true }).click();
  await page.getByRole('menuitem', { name: '多數決電路（圖 2-5）' }).click();
  await expect(page.locator('[data-logic-node]')).toHaveCount(8);
  await page.getByRole('button', { name: '轉成麵包板…' }).click();
  const dialog = page.getByRole('dialog', { name: '轉成麵包板' });
  // 只用 NAND：比較慢（MB-102 排不完再換 EIC-1106），按取消時一定還在算。
  await dialog.getByLabel(/只用 NAND/).check();
  await dialog.getByText('加上 / 下拉電阻（實際接線建議勾）').click();
  await dialog.getByRole('button', { name: '轉換' }).click();

  await expect(page.getByText('轉成麵包板：試好幾種擺法…')).toBeVisible();
  const lanes = Math.max(1, Math.min(4, cores - 1));
  // 同一時間最多 lanes 個（快速試很快的那幾種會先結束，所以看最多同時幾個，不看某一刻）。
  await expect.poll(async () => (await workers()).peak).toBe(lanes);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByText('已取消轉成麵包板')).toBeVisible();
  await expect.poll(async () => (await workers()).live).toBe(0);
  expect((await workers()).peak).toBe(lanes);
  await expect(page.locator('g[data-component-id="U1"]')).toHaveCount(0);
});
