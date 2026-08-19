import { defineConfig } from 'vite';
import { devServer, firebaseAppDefine, pagesBase } from '../vite.shared.js';

export default defineConfig({
  base: pagesBase('kitchen-terminal'),
  define: firebaseAppDefine('kitchen'),
  cacheDir: '../node_modules/.vite/kitchen-terminal',
  server: { ...devServer, port: 3003 },
});
