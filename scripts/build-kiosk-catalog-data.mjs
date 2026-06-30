import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcPath = process.argv[2] || join(__dirname, '../.tmp-catalog.js');
const outPath = join(__dirname, '../shared/kiosk-catalog-data.js');

/** @param {string|null|undefined} kioskPath */
function toProductUrl(kioskPath) {
  if (!kioskPath) return null;
  const file = basename(String(kioskPath).trim());
  return file ? `/products/${file}` : null;
}

const src = readFileSync(srcPath, 'utf8');
const catMatch = src.match(/const CATEGORIES = \[([\s\S]*?)\];/);
const prodMatch = src.match(/const PRODUCTS = \[([\s\S]*?)\];/);
if (!catMatch || !prodMatch) throw new Error('Не найдены CATEGORIES / PRODUCTS');

const categories = eval(`[${catMatch[1]}]`);
const products = eval(`[${prodMatch[1]}]`);

const out = {
  categories: categories.map(c => ({
    slug: c.id,
    name: c.label,
    imageUrl: toProductUrl(c.icon),
  })),
  products: products.map(p => ({
    sku: p.id,
    name: p.name,
    price: p.price,
    categorySlug: p.category,
    description: p.composition || '',
    imageUrl: toProductUrl(p.image),
  })),
};

const body = `/**
 * Справочник из kioskprototype (src/data/catalog.js)
 * https://github.com/averstech2026/kioskprototype
 *
 * Пересобрать после обновления каталога в киоске:
 *   node scripts/build-kiosk-catalog-data.mjs path/to/catalog.js
 */

export const KIOSK_CATALOG = ${JSON.stringify(out, null, 2)};
`;

writeFileSync(outPath, body);
console.log(`OK: ${out.categories.length} категорий, ${out.products.length} товаров → ${outPath}`);
