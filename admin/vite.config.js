import { defineConfig } from 'vite';
import { resolve } from 'path';
import { devServer, pagesBase, productsStaticPlugin } from '../vite.shared.js';

export default defineConfig({
  base: pagesBase('admin'),
  plugins: [productsStaticPlugin()],
  cacheDir: '../node_modules/.vite/admin',
  server: {
    ...devServer,
    port: 3002,
    strictPort: true,
    fs: { allow: ['..'] },
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../shared'),
    },
  },
});
