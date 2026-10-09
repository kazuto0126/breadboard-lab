import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** 網頁圖示直接內嵌成 data URI（index.html 的 %FAVICON%），單一 HTML 版不會多出一個圖示檔。 */
function inlineFavicon(): Plugin {
  const svg = readFileSync(new URL('./src/assets/logo.svg', import.meta.url), 'utf8');
  const href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  return { name: 'inline-favicon', transformIndexHtml: { order: 'pre', handler: (html) => html.replace('%FAVICON%', href) } };
}

/**
 * `vite build`：網站版，輸出 dist/。
 * `vite build --mode single`：單一 HTML 離線版，所有 JS、CSS、圖示與佈線 Worker 都內嵌，輸出 dist-single/。
 * base 用相對路徑，放在任何子目錄（例如 GitHub Pages）或直接用 file:// 開啟都能運作。
 */
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), tailwindcss(), inlineFavicon(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist', emptyOutDir: true },
}));
