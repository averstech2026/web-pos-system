import { defineConfig } from 'vite';
import { devServer, pagesBase } from '../vite.shared.js';

export default defineConfig({
  base: pagesBase('validator-terminal'),
  cacheDir: '../node_modules/.vite/validator-terminal',
  server: { ...devServer, port: 3007, strictPort: true },
});
