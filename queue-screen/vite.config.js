import { defineConfig } from 'vite';
import { devServer, pagesBase } from '../vite.shared.js';

export default defineConfig({
  base: pagesBase('queue-screen'),
  cacheDir: '../node_modules/.vite/queue-screen',
  server: { ...devServer, port: 3005 },
});
