import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const ALLOWED_UPLOAD_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const productsDir = resolve(fileURLToPath(new URL('.', import.meta.url)), 'products');

/** Serve /products/* from the repo-root products folder (dev + preview). */
export function productsStaticPlugin() {
  return {
    name: 'serve-products',
    configureServer(server) {
      serveProducts(server.middlewares);
      serveProductUpload(server.middlewares);
    },
    configurePreviewServer(server) {
      serveProducts(server.middlewares);
      serveProductUpload(server.middlewares);
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

function serveProductUpload(middlewares) {
  middlewares.use(async (req, res, next) => {
    const url = req.url?.split('?')[0] ?? '';
    if (url !== '/api/products/upload' || req.method !== 'POST') return next();

    try {
      const body = await readJsonBody(req);
      const filename = sanitizeUploadFilename(body?.filename);
      const ext = extname(filename).toLowerCase();
      if (!ALLOWED_UPLOAD_EXT.has(ext)) {
        sendJson(res, 400, { error: 'Допустимы только JPG, PNG, WebP и GIF' });
        return;
      }

      const data = String(body?.data || '');
      if (!data) {
        sendJson(res, 400, { error: 'Пустое тело файла' });
        return;
      }

      const buffer = Buffer.from(data, 'base64');
      if (!buffer.length) {
        sendJson(res, 400, { error: 'Не удалось декодировать изображение' });
        return;
      }
      if (buffer.length > MAX_UPLOAD_BYTES) {
        sendJson(res, 400, { error: 'Файл слишком большой (макс. 8 МБ)' });
        return;
      }

      mkdirSync(productsDir, { recursive: true });
      writeFileSync(join(productsDir, filename), buffer);
      sendJson(res, 200, { path: `/products/${filename}` });
    } catch (err) {
      sendJson(res, 500, { error: err?.message || 'Ошибка загрузки' });
    }
  });
}

/** @param {import('http').IncomingMessage} req */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/** @param {string} name */
function sanitizeUploadFilename(name) {
  const base = String(name || 'image.jpg')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);
  if (!base || base === '.' || base === '..' || base.includes('/')) {
    return `image-${Date.now()}.jpg`;
  }
  return base;
}

/** @param {import('http').ServerResponse} res @param {number} status @param {object} payload */
function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

/** Shared Vite dev-server options — expose on LAN for mobile testing */
export const devServer = {
  host: '0.0.0.0',
  // Vite 6+ host check; true allows LAN access by IP or local hostname
  allowedHosts: true,
};

/** GitHub Pages base path; `/` locally, `/repo/app/` in CI (GITHUB_REPOSITORY). */
export function pagesBase(appSlug) {
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
  if (repo) return `/${repo}/${appSlug}/`;
  return '/';
}
