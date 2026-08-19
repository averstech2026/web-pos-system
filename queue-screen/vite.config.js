import { defineConfig } from 'vite';
import { devServer, firebaseAppDefine, pagesBase } from '../vite.shared.js';

export default defineConfig({
  base: pagesBase('queue-screen'),
  define: firebaseAppDefine('queue'),
  cacheDir: '../node_modules/.vite/queue-screen',
  server: { ...devServer, port: 3005 },
});
