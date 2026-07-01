import { defineConfig } from 'vite';
import { devServer, pagesBase } from '../vite.shared.js';

export default defineConfig({
  base: pagesBase('delivery-terminal'),
  cacheDir: '../node_modules/.vite/delivery-terminal',
  server: { ...devServer, port: 3004, strictPort: true },
});
