import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 佈線與找 IC 位置的測試在全部並行時會比單獨跑慢好幾倍，預設 5 秒不夠。
  test: { include: ['tests/**/*.test.ts'], testTimeout: 30_000 },
});
