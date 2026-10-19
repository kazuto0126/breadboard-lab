import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';

/**
 * 子專案 33（規格 2026-10-19 mcp-other-tools 第 5 節）：`npm run build:mcp` 把 MCP 伺服器（scripts/mcp-server.ts）
 * 和它用到的所有東西（MCP SDK、zod、核心引擎、元件定義）打包成一個檔案 dist-mcp/breadboard-lab-mcp.mjs，
 * 只要 Node.js 20 以上就能執行，不用原始碼、不用 npm install。版本號是建置的日期。
 */
const now = new Date();
const version = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
let commit = 'unknown';
try {
  commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  // 不在 git repo 裡建置時寫 unknown。
}

export default defineConfig({
  publicDir: false,
  define: { 'process.env.BREADBOARD_LAB_MCP_VERSION': JSON.stringify(version) },
  ssr: { noExternal: true, target: 'node' },
  build: {
    ssr: 'scripts/mcp-server.ts',
    outDir: 'dist-mcp',
    emptyOutDir: true,
    target: 'node20',
    rolldownOptions: {
      output: {
        format: 'es',
        entryFileNames: 'breadboard-lab-mcp.mjs',
        codeSplitting: false,
        banner: `// Breadboard Lab MCP 伺服器 ${version}（commit ${commit}）— 設定說明：https://kazuto0126.github.io/breadboard-lab-site/mcp/`,
      },
    },
  },
});
