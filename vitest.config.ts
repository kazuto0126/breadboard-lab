import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  // 佈線與找 IC 位置的測試在全部並行時會比單獨跑慢好幾倍，預設 5 秒不夠。
  // tests/bench 是比較慢的量測（npm run bench:convert），不在一般的測試裡跑。
  test: { include: ['tests/**/*.test.ts'], exclude: [...configDefaults.exclude, 'tests/bench/**'], testTimeout: 30_000 },
});
