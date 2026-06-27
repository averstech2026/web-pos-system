import { defineConfig } from 'vite';
import { resolve } from 'path';
import { devServer, productsStaticPlugin } from '../vite.shared.js';

export default defineConfig({
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
