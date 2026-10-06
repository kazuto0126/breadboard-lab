import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), tailwindcss(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist', emptyOutDir: true },
  test: { exclude: [...configDefaults.exclude, 'e2e/**'] },
}));
