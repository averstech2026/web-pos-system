import { defineConfig } from 'vite';
import { devServer, pagesBase } from '../vite.shared.js';

export default defineConfig({
  base: pagesBase('kitchen-terminal'),
  cacheDir: '../node_modules/.vite/kitchen-terminal',
  server: { ...devServer, port: 3003 },
});
