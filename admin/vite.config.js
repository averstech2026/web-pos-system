import { defineConfig } from 'vite';
import { devServer, pagesBase } from '../vite.shared.js';

export default defineConfig({
  base: pagesBase('admin'),
  cacheDir: '../node_modules/.vite/admin',
  server: devServer,
});
