#!/usr/bin/env node
/**
 * Разовая миграция справочника из кода киоска → Firestore.
 *
 * Данные берутся из shared/kiosk-catalog-data.js (скопируйте массив из другого проекта).
 *
 *   npm run migrate:kiosk
 *   npm run migrate:kiosk -- --dry-run
 *   node scripts/migrate-kiosk-catalog.js --credentials=./service-account.json
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { COL } from '../shared/schema.js';
import { normalizeCategoryGroup, slugFromCategoryName } from '../shared/menu-catalog.js';
import { KIOSK_CATALOG } from '../shared/kiosk-catalog-data.js';
import {
  kioskCategoryName,
  kioskCategorySlug,
  kioskProductArticle,
  kioskProductBarcode,
  kioskProductCategoryRef,
  kioskProductName,
  parseKioskCatalogSource,
  KIOSK_MIGRATION_BATCH_LIMIT,
} from '../shared/kiosk-catalog-migration.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MENU_SETTINGS_ID = 'menu';
const BATCH_LIMIT = KIOSK_MIGRATION_BATCH_LIMIT;

const dryRun = process.argv.includes('--dry-run');
const credentialsArg = process.argv.find(a => a.startsWith('--credentials='))?.split('=').slice(1).join('=');

function log(msg) {
  console.log(`[migrate-kiosk] ${msg}`);
}

function warn(msg) {
  console.warn(`[migrate-kiosk] WARN: ${msg}`);
}

function normStr(value) {
  if (value == null) return '';
  return String(value).trim();
}

function initFirebase() {
  if (getApps().length) return getFirestore();

  const credPath = credentialsArg
    || process.env.GOOGLE_APPLICATION_CREDENTIALS
    || join(__dirname, 'service-account.json');

  if (!existsSync(credPath)) {
    throw new Error(
      'Нужен service account: положите scripts/service-account.json '
      + 'или укажите --credentials=path.json',
    );
  }

  const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'));
  initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
  log(`Firebase Admin: ${serviceAccount.project_id}`);
  return getFirestore();
}

class BatchWriter {
  constructor(db) {
    this.db = db;
    this.batch = db.batch();
    this.pending = 0;
    this.batches = 0;
    this.totalOps = 0;
  }

  set(ref, data) {
    this.batch.set(ref, data);
    return this.#tick();
  }

  update(ref, data) {
    this.batch.update(ref, data);
    return this.#tick();
  }

  #tick() {
    this.pending += 1;
    this.totalOps += 1;
    if (this.pending >= BATCH_LIMIT) return this.flush();
    return Promise.resolve();
  }

  async flush() {
    if (!this.pending) return;
    if (!dryRun) await this.batch.commit();
    this.batches += 1;
    log(`Пачка #${this.batches}: ${this.pending} операций${dryRun ? ' (dry-run)' : ''}`);
    this.batch = this.db.batch();
    this.pending = 0;
  }
}

async function importCategories(db, kioskCategories) {
  const menuRef = db.collection(COL.SETTINGS).doc(MENU_SETTINGS_ID);
  const menuSnap = await menuRef.get();
  const menuData = menuSnap.exists ? menuSnap.data() : {};

  const byId = new Map();
  const byName = new Map();
  const existingGroups = menuData.categoryGroups?.length
    ? menuData.categoryGroups
    : menuData.categories;

  for (const raw of existingGroups || []) {
    const g = normalizeCategoryGroup(raw);
    if (!g.name) continue;
    byId.set(g.id, { ...g });
    byName.set(g.name.toLowerCase(), { ...g });
  }

  const categoryIdMap = new Map();
  const stats = { created: 0, updated: 0, skipped: 0 };

  for (const row of kioskCategories) {
    const name = kioskCategoryName(row);
    if (!name) {
      warn('Пропущена категория без name');
      stats.skipped += 1;
      continue;
    }

    const slug = kioskCategorySlug(row) || slugFromCategoryName(name);
    const oldRef = normStr(row.id ?? row.slug ?? slug);
    const existing = byId.get(slug) || byName.get(name.toLowerCase());

    if (existing) {
      const merged = normalizeCategoryGroup({ ...existing, visibleInKiosk: true });
      byId.set(merged.id, merged);
      byName.set(merged.name.toLowerCase(), merged);
      if (oldRef) categoryIdMap.set(oldRef, merged.id);
      categoryIdMap.set(slug, merged.id);
      categoryIdMap.set(name, merged.id);
      stats.updated += 1;
      log(`↻ категория «${name}»`);
    } else {
      const created = normalizeCategoryGroup({
        id: slug,
        name,
        imageUrl: row.imageUrl || row.image_url || row.icon || null,
        visibleInKiosk: true,
        visibleInWeb: false,
      });
      byId.set(created.id, created);
      byName.set(created.name.toLowerCase(), created);
      if (oldRef) categoryIdMap.set(oldRef, created.id);
      categoryIdMap.set(slug, created.id);
      categoryIdMap.set(name, created.id);
      stats.created += 1;
      log(`+ категория «${name}»`);
    }
  }

  const categoryGroups = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  if (!dryRun) {
    await menuRef.set({
      categoryGroups,
      categories: categoryGroups.map(g => g.name),
    }, { merge: true });
  }

  return { categoryIdMap, categoryGroups, stats };
}

function resolveCategory(ref, categoryIdMap, categoryGroups) {
  const groupsById = new Map(categoryGroups.map(g => [g.id, g]));
  const groupsByName = new Map(categoryGroups.map(g => [g.name.toLowerCase(), g]));
  const mappedId = categoryIdMap.get(ref) || ref;
  const byId = groupsById.get(mappedId);
  if (byId) return { categoryId: byId.id, category: byId.name };
  const byName = groupsByName.get(ref.toLowerCase());
  if (byName) return { categoryId: byName.id, category: byName.name };
  const fallbackName = ref || 'Прочее';
  return { categoryId: slugFromCategoryName(fallbackName), category: fallbackName };
}

function buildNewItemDoc(row, cat) {
  const name = kioskProductName(row);
  const price = Number(row.price ?? row.cost ?? 0);
  const article = kioskProductArticle(row);
  const doc = {
    name,
    description: normStr(row.description ?? row.desc ?? row.composition),
    price: Number.isFinite(price) ? price : 0,
    category: cat.category,
    categoryId: cat.categoryId,
    isAvailable: row.isAvailable !== false,
    visibleInKiosk: true,
    visibleInWeb: false,
    migratedFromKiosk: true,
    migratedAt: FieldValue.serverTimestamp(),
  };
  if (article) doc.article = article;
  const barcode = kioskProductBarcode(row);
  if (barcode) doc.barcode = barcode;
  const imageUrl = normStr(row.imageUrl ?? row.image_url ?? row.image);
  if (imageUrl) doc.imageUrl = imageUrl;
  if (row.nutrition && typeof row.nutrition === 'object') doc.nutrition = row.nutrition;
  if (Array.isArray(row.allergens)?.length) doc.allergens = row.allergens.filter(Boolean);
  return doc;
}

async function importProducts(db, kioskProducts, categoryIdMap, categoryGroups) {
  const snap = await db.collection(COL.ITEMS).get();
  const byArticle = new Map();
  const byName = new Map();

  for (const d of snap.docs) {
    const data = d.data();
    const entry = { id: d.id, data };
    const article = normStr(data.article ?? data.sku);
    const name = normStr(data.name).toLowerCase();
    if (article) byArticle.set(article, entry);
    if (name) byName.set(name, entry);
  }

  const writer = new BatchWriter(db);
  const stats = { created: 0, updated: 0, skipped: 0 };

  for (const row of kioskProducts) {
    const name = kioskProductName(row);
    if (!name) {
      stats.skipped += 1;
      continue;
    }

    const article = kioskProductArticle(row);
    const existing = (article && byArticle.get(article)) || byName.get(name.toLowerCase());
    const cat = resolveCategory(kioskProductCategoryRef(row), categoryIdMap, categoryGroups);

    if (existing) {
      await writer.update(db.collection(COL.ITEMS).doc(existing.id), { visibleInKiosk: true });
      stats.updated += 1;
      log(`↻ товар «${name}»`);
    } else {
      const newRef = db.collection(COL.ITEMS).doc();
      const newDoc = buildNewItemDoc(row, cat);
      await writer.set(newRef, newDoc);
      const entry = { id: newRef.id, data: newDoc };
      if (article) byArticle.set(article, entry);
      byName.set(name.toLowerCase(), entry);
      stats.created += 1;
      log(`+ товар «${name}»`);
    }
  }

  await writer.flush();
  return { stats, batchOps: writer.totalOps, batches: writer.batches };
}

async function main() {
  log(dryRun ? 'DRY-RUN' : 'Старт миграции');
  const { categories, products } = parseKioskCatalogSource(KIOSK_CATALOG);

  if (!categories.length && !products.length) {
    throw new Error('shared/kiosk-catalog-data.js пуст — вставьте данные из проекта киоска');
  }

  log(`Категорий: ${categories.length}, товаров: ${products.length}`);
  const db = initFirebase();

  const { categoryIdMap, categoryGroups, stats: catStats } =
    await importCategories(db, categories);
  const { stats: prodStats, batchOps, batches } =
    await importProducts(db, products, categoryIdMap, categoryGroups);

  log('── Итог ──');
  log(`Категории: +${catStats.created} / ~${catStats.updated} / пропущено ${catStats.skipped}`);
  log(`Товары: +${prodStats.created} / ~${prodStats.updated} / пропущено ${prodStats.skipped}`);
  log(`Batch-операций: ${batchOps} (${batches} пачек)`);
}

main().catch(err => {
  console.error('[migrate-kiosk] Ошибка:', err.message || err);
  process.exit(1);
});
