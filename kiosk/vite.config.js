import { defineConfig } from 'vite';
import { resolve } from 'path';
import { devServer, pagesBase, productsStaticPlugin } from '../vite.shared.js';

export default defineConfig({
  root: resolve(__dirname),
  base: pagesBase('kiosk'),
  plugins: [productsStaticPlugin()],
  cacheDir: '../node_modules/.vite/kiosk',
  server: {
    ...devServer,
    port: 3006,
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
