import { readFileSync } from 'fs';
import { extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const productsDir = resolve(fileURLToPath(new URL('.', import.meta.url)), 'products');

/** Serve /products/* from the repo-root products folder (dev + preview). */
export function productsStaticPlugin() {
  return {
    name: 'serve-products',
    configureServer(server) {
      serveProducts(server.middlewares);
    },
    configurePreviewServer(server) {
      serveProducts(server.middlewares);
    },
  };
}

function serveProducts(middlewares) {
  middlewares.use((req, res, next) => {
    const url = req.url?.split('?')[0] ?? '';
    if (!url.startsWith('/products/')) return next();

    const rel = decodeURIComponent(url.slice('/products/'.length));
    if (!rel || rel.includes('..') || rel.includes('/')) return next();

    try {
      const filePath = join(productsDir, rel);
      const data = readFileSync(filePath);
      res.setHeader('Content-Type', MIME[extname(rel).toLowerCase()] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.end(data);
    } catch {
      next();
    }
  });
}

/** Shared Vite dev-server options — expose on LAN for mobile testing */
export const devServer = {
  host: true,
};

/** GitHub Pages base path; `/` locally, `/repo/app/` in CI (GITHUB_REPOSITORY). */
export function pagesBase(appSlug) {
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
  if (repo) return `/${repo}/${appSlug}/`;
  return '/';
}
