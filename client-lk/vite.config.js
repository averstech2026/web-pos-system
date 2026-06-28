import { defineConfig } from 'vite';
import { resolve } from 'path';
import { devServer, pagesBase, productsStaticPlugin } from '../vite.shared.js';

export default defineConfig({
  base: pagesBase('client-lk'),
  plugins: [productsStaticPlugin()],
  server: {
    ...devServer,
    port: 3001,
    open: true,
    fs: {
      // Allow Vite to serve files from the project root (one level up from client-lk)
      allow: ['..'],
    },
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../shared'),
    },
  },
});
