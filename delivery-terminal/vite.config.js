import { defineConfig } from 'vite';
import { devServer, firebaseAppDefine, pagesBase } from '../vite.shared.js';

export default defineConfig({
  base: pagesBase('delivery-terminal'),
  define: firebaseAppDefine('delivery'),
  cacheDir: '../node_modules/.vite/delivery-terminal',
  server: { ...devServer, port: 3004, strictPort: true },
});
