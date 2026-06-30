#!/usr/bin/env node
/**
 * Скачивает картинки товаров и иконки групп из kioskprototype → products/
 *
 *   npm run sync:kiosk-assets
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { get as httpsGet } from 'node:https';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KIOSK_CATALOG } from '../shared/kiosk-catalog-data.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const productsDir = join(__dirname, '../products');
const RAW_BASE = 'https://raw.githubusercontent.com/averstech2026/kioskprototype/main';

mkdirSync(productsDir, { recursive: true });

/** @param {string} file */
function kioskSourcePaths(file) {
  return [
    `assets/products/${file}`,
    `assets/${file}`,
  ];
}

/** @param {string} url */
function downloadUrl(url) {
  return new Promise((resolve, reject) => {
    httpsGet(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (!loc) return reject(new Error(`redirect without location: ${url}`));
        downloadUrl(loc).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

/** @param {string} file */
async function downloadFile(file) {
  const dest = join(productsDir, file);
  if (existsSync(dest)) return { file, skipped: true };

  for (const kioskPath of kioskSourcePaths(file)) {
    const url = `${RAW_BASE}/${kioskPath}`;
    try {
      const buf = await downloadUrl(url);
      writeFileSync(dest, buf);
      return { file, skipped: false, from: kioskPath };
    } catch {
      // try next path
    }
  }

  throw new Error(`не найден на GitHub (${kioskSourcePaths(file).join(', ')})`);
}

function collectFiles(catalog) {
  const files = new Set();
  for (const row of [...(catalog.categories || []), ...(catalog.products || [])]) {
    const raw = String(row.imageUrl || '').trim();
    if (!raw) continue;
    const file = raw.startsWith('/products/')
      ? basename(raw)
      : raw.startsWith('assets/')
        ? basename(raw)
        : null;
    if (file) files.add(file);
  }
  return [...files];
}

async function main() {
  const files = collectFiles(KIOSK_CATALOG);
  console.log(`[sync-kiosk-assets] ${files.length} файлов…`);

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    try {
      const r = await downloadFile(file);
      if (r.skipped) {
        skipped += 1;
        console.log(`  = ${r.file}`);
      } else {
        downloaded += 1;
        console.log(`  + ${r.file} ← ${r.from}`);
      }
    } catch (err) {
      failed += 1;
      console.error(`  ! ${file}: ${err.message}`);
    }
  }

  console.log(`Готово: +${downloaded}, уже есть ${skipped}, ошибок ${failed}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
