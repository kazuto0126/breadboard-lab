import { defineConfig } from 'vitest/config';

/** 子專案 36：「轉成麵包板」的量測（npm run bench:convert），比較慢，不在一般的 npm test 與 CI 跑。 */
export default defineConfig({
  test: { include: ['tests/bench/**/*.test.ts'], testTimeout: 120_000, fileParallelism: false },
});
