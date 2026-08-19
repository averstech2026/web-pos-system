import { defineConfig } from 'vite';
import { devServer, firebaseAppDefine, pagesBase } from '../vite.shared.js';

export default defineConfig({
  base: pagesBase('validator-terminal'),
  define: firebaseAppDefine('validator'),
  cacheDir: '../node_modules/.vite/validator-terminal',
  server: { ...devServer, port: 3007, strictPort: true },
});
