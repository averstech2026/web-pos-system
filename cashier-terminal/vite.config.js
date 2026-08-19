import { defineConfig } from 'vite';
import { resolve } from 'path';
import { devServer, firebaseAppDefine, pagesBase, productsStaticPlugin } from '../vite.shared.js';

export default defineConfig({
  root: resolve(__dirname),
  base: pagesBase('cashier-terminal'),
  define: firebaseAppDefine('cashier'),
  cacheDir: '../node_modules/.vite/cashier-terminal',
  plugins: [productsStaticPlugin()],
  server: {
    ...devServer,
    port: 3008,
    strictPort: true,
    open: '/',
    fs: { allow: ['..'] },
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../shared'),
    },
  },
});
