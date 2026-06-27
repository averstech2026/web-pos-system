import { defineConfig } from 'vite';
import { devServer } from '../vite.shared.js';

export default defineConfig({
  cacheDir: '../node_modules/.vite/queue-screen',
  server: devServer,
});
