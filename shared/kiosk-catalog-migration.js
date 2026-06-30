/**
 * Логика миграции каталога киоска → текущая Firestore.
 * Используется из админ-страницы импорта и Node-скрипта.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { COL } from './schema.js';
import { normalizeCategoryGroup, slugFromCategoryName } from './menu-catalog.js';

const MENU_SETTINGS_ID = 'menu';
export const KIOSK_MIGRATION_BATCH_LIMIT = 500;

/** @param {unknown} value */
export function normStr(value) {
  if (value == null) return '';
  return String(value).trim();
}

/** @param {unknown} raw */
export function parseJsonArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  throw new Error('Ожидался JSON-массив или объект с полем items/data');
}

/**
 * Нормализует экспорт из кода киоска в { categories, products }.
 * @param {unknown} source
 * @returns {{ categories: object[], products: object[] }}
 */
export function parseKioskCatalogSource(source) {
  if (Array.isArray(source)) {
    const categories = [];
    const products = [];
    for (const row of source) {
      if (!row || typeof row !== 'object') continue;
      const type = normStr(row.type).toLowerCase();
      if (type === 'category' || type === 'group') {
        categories.push(row);
      } else if (type === 'product' || type === 'item') {
        products.push(row);
      } else if (kioskProductArticle(row) || row.price != null || row.cost != null) {
        products.push(row);
      } else {
        categories.push(row);
      }
    }
    return { categories, products };
  }

  if (source && typeof source === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (source);
    if (Array.isArray(obj.categories) || Array.isArray(obj.products)) {
      return {
        categories: Array.isArray(obj.categories) ? obj.categories : [],
        products: Array.isArray(obj.products) ? obj.products : [],
      };
    }
  }

  throw new Error('KIOSK_CATALOG: ожидался { categories, products } или массив записей');
}

/** @param {object} row */
export function kioskCategorySlug(row) {
  return normStr(row.slug || row.id || slugFromCategoryName(row.name));
}

/** @param {object} row */
export function kioskCategoryName(row) {
  return normStr(row.name ?? row.label);
}

/** @param {object} row */
export function kioskProductArticle(row) {
  return normStr(row.article ?? row.sku ?? row.code);
}

/** @param {object} row */
export function kioskProductBarcode(row) {
  return normStr(row.barcode ?? row.ean);
}

/** @param {object} row */
export function kioskProductName(row) {
  return normStr(row.name ?? row.title);
}

/** @param {object} row */
export function kioskProductCategoryRef(row) {
  return normStr(
    row.categoryId
    ?? row.category_id
    ?? row.categorySlug
    ?? row.category_slug
    ?? row.category,
  );
}

/** @param {object} row */
export function kioskProductDescription(row) {
  return normStr(row.description ?? row.desc ?? row.composition);
}

/** @param {object} row */
export function kioskProductImageUrl(row) {
  return normStr(row.imageUrl ?? row.image_url ?? row.image);
}

/** @param {object} row */
export function kioskCategoryImageUrl(row) {
  return kioskProductImageUrl(row);
}

/**
 * @param {import('firebase/firestore').Firestore} targetDb
 * @param {object[]} kioskCategories
 * @param {object[]} kioskProducts
 * @param {boolean} [dryRun]
 * @param {(msg: string) => void} [onLog]
 * @param {number} [batchLimit]
 */
export async function migrateKioskCatalog({
  targetDb,
  kioskCategories,
  kioskProducts,
  dryRun = false,
  onLog = () => {},
  batchLimit = KIOSK_MIGRATION_BATCH_LIMIT,
}) {
  const log = msg => onLog(msg);
  const warn = msg => onLog(`⚠ ${msg}`);

  log(`Категории: ${kioskCategories.length} записей`);
  log(`Товары: ${kioskProducts.length} записей`);
  if (dryRun) log('Режим просмотра — в базу ничего не пишем');

  const menuRef = doc(targetDb, COL.SETTINGS, MENU_SETTINGS_ID);
  const menuSnap = await getDoc(menuRef);
  const menuData = menuSnap.exists() ? menuSnap.data() : {};

  /** @type {Map<string, object>} */
  const byId = new Map();
  /** @type {Map<string, object>} */
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

  /** @type {Map<string, string>} */
  const categoryIdMap = new Map();

  /** @type {{ created: number, updated: number, skipped: number }} */
  const catStats = { created: 0, updated: 0, skipped: 0 };

  for (const row of kioskCategories) {
    const name = kioskCategoryName(row);
    if (!name) {
      warn('Пропущена категория без name');
      catStats.skipped += 1;
      continue;
    }

    const slug = kioskCategorySlug(row) || slugFromCategoryName(name);
    const oldRef = normStr(row.id ?? row.slug ?? slug);

    const existing = byId.get(slug) || byName.get(name.toLowerCase());

    if (existing) {
      const merged = normalizeCategoryGroup({
        ...existing,
        name: existing.name || name,
        imageUrl: kioskCategoryImageUrl(row) || existing.imageUrl || null,
        visibleInKiosk: true,
      });
      byId.set(merged.id, merged);
      byName.set(merged.name.toLowerCase(), merged);
      if (oldRef) categoryIdMap.set(oldRef, merged.id);
      categoryIdMap.set(slug, merged.id);
      categoryIdMap.set(name, merged.id);
      catStats.updated += 1;
      log(`↻ категория «${name}» → visibleInKiosk=true`);
    } else {
      const createdGroup = normalizeCategoryGroup({
        id: slug,
        name,
        imageUrl: kioskCategoryImageUrl(row),
        availabilityRuleId: row.availabilityRuleId || row.availability_rule_id || null,
        visibleInKiosk: true,
        visibleInWeb: false,
      });
      byId.set(createdGroup.id, createdGroup);
      byName.set(createdGroup.name.toLowerCase(), createdGroup);
      if (oldRef) categoryIdMap.set(oldRef, createdGroup.id);
      categoryIdMap.set(slug, createdGroup.id);
      categoryIdMap.set(name, createdGroup.id);
      catStats.created += 1;
      log(`+ категория «${name}» → visibleInKiosk=true, visibleInWeb=false`);
    }
  }

  const categoryGroups = [...byId.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'ru'),
  );

  const menuPayload = {
    categoryGroups,
    categories: categoryGroups.map(g => g.name),
  };

  if (!dryRun) {
    await setDoc(menuRef, menuPayload, { merge: true });
    log(`settings/menu сохранён`);
  }

  log('Загрузка существующих товаров…');
  const itemsSnap = await getDocs(collection(targetDb, COL.ITEMS));

  /** @type {Map<string, { id: string, data: object }>} */
  const byArticle = new Map();
  /** @type {Map<string, { id: string, data: object }>} */
  const byNameIndex = new Map();

  for (const itemDoc of itemsSnap.docs) {
    const data = itemDoc.data();
    const entry = { id: itemDoc.id, data };
    const article = normStr(data.article ?? data.sku);
    const itemName = normStr(data.name).toLowerCase();
    if (article) byArticle.set(article, entry);
    if (itemName) byNameIndex.set(itemName, entry);
  }

  log(`В базе ${itemsSnap.size} товаров`);

  let batch = writeBatch(targetDb);
  let pending = 0;
  let batches = 0;
  let batchOps = 0;

  /** @type {{ created: number, updated: number, skipped: number }} */
  const prodStats = { created: 0, updated: 0, skipped: 0 };

  async function flushBatch() {
    if (!pending) return;
    if (!dryRun) await batch.commit();
    batches += 1;
    log(`Пачка #${batches}: ${pending} операций`);
    batch = writeBatch(targetDb);
    pending = 0;
  }

  async function enqueue(op) {
    op(batch);
    pending += 1;
    batchOps += 1;
    if (pending >= batchLimit) await flushBatch();
  }

  for (const row of kioskProducts) {
    const name = kioskProductName(row);
    if (!name) {
      warn('Пропущен товар без name');
      prodStats.skipped += 1;
      continue;
    }

    const article = kioskProductArticle(row);
    const nameKey = name.toLowerCase();

    const existing = (article && byArticle.get(article))
      || byNameIndex.get(nameKey);

    const catRef = kioskProductCategoryRef(row);
    const cat = resolveCategory(catRef, categoryIdMap, categoryGroups);

    if (existing) {
      await enqueue(b => b.update(doc(targetDb, COL.ITEMS, existing.id), {
        visibleInKiosk: true,
      }));
      prodStats.updated += 1;
      log(`↻ товар «${name}» (id=${existing.id}) → visibleInKiosk=true`);
    } else {
      const newDoc = buildNewItemDoc(row, cat);
      const newRef = doc(collection(targetDb, COL.ITEMS));
      await enqueue(b => b.set(newRef, newDoc));

      const entry = { id: newRef.id, data: newDoc };
      if (article) byArticle.set(article, entry);
      byNameIndex.set(nameKey, entry);

      prodStats.created += 1;
      log(`+ товар «${name}» (categoryId=${cat.categoryId})`);
    }
  }

  await flushBatch();

  log('── Итог ──');
  log(`Категории: +${catStats.created} / ~${catStats.updated} / пропущено ${catStats.skipped}`);
  log(`Товары: +${prodStats.created} / ~${prodStats.updated} / пропущено ${prodStats.skipped}`);
  log(`Batch-операций: ${batchOps} (${batches} пачек)`);

  return {
    categories: catStats,
    products: prodStats,
    batchOps,
    batches,
    dryRun,
  };
}

/**
 * @param {string} ref
 * @param {Map<string, string>} categoryIdMap
 * @param {object[]} categoryGroups
 */
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

/** @param {object} row @param {{ categoryId: string, category: string }} cat */
function buildNewItemDoc(row, cat) {
  const name = kioskProductName(row);
  const description = kioskProductDescription(row);
  const price = Number(row.price ?? row.cost ?? 0);
  const article = kioskProductArticle(row);
  const barcode = kioskProductBarcode(row);

  /** @type {Record<string, unknown>} */
  const item = {
    name,
    description,
    price: Number.isFinite(price) ? price : 0,
    category: cat.category,
    categoryId: cat.categoryId,
    isAvailable: row.isAvailable !== false && row.is_available !== false,
    visibleInKiosk: true,
    visibleInWeb: false,
    migratedFromKiosk: true,
    migratedAt: serverTimestamp(),
  };

  if (article) item.article = article;
  if (barcode) item.barcode = barcode;

  const imageUrl = kioskProductImageUrl(row);
  if (imageUrl) item.imageUrl = imageUrl;

  if (row.nutrition && typeof row.nutrition === 'object') {
    item.nutrition = row.nutrition;
  }

  if (Array.isArray(row.allergens) && row.allergens.length) {
    item.allergens = row.allergens.filter(Boolean);
  }

  return item;
}
