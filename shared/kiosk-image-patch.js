/**
 * Патч imageUrl для категорий и товаров из KIOSK_CATALOG.
 */

import { doc, getDoc, getDocs, collection, setDoc, writeBatch } from 'firebase/firestore';
import { COL } from './schema.js';
import { normalizeCategoryGroup } from './menu-catalog.js';
import { normStr, kioskProductArticle, kioskProductName } from './kiosk-catalog-migration.js';

const MENU_SETTINGS_ID = 'menu';
export const KIOSK_IMAGE_BATCH_LIMIT = 500;

/**
 * @param {{ categories: object[], products: object[] }} catalog
 */
export function buildKioskImagePatchPlan(catalog, { menuCategoryGroups = [], items = [] } = {}) {
  /** @type {Map<string, string>} name → imageUrl */
  const catByName = new Map();
  /** @type {Map<string, string>} slug → imageUrl */
  const catBySlug = new Map();
  for (const c of catalog.categories || []) {
    const url = normStr(c.imageUrl);
    if (!url) continue;
    const name = normStr(c.name ?? c.label).toLowerCase();
    const slug = normStr(c.slug ?? c.id);
    if (name) catByName.set(name, url);
    if (slug) catBySlug.set(slug, url);
  }

  /** @type {Array<{ id: string, imageUrl: string, label: string }>} */
  const categoryUpdates = [];
  for (const raw of menuCategoryGroups) {
    const g = normalizeCategoryGroup(raw);
    const url = catBySlug.get(g.id) || catByName.get(g.name.toLowerCase());
    if (!url || g.imageUrl === url) continue;
    categoryUpdates.push({ id: g.id, imageUrl: url, label: g.name });
  }

  /** @type {Map<string, string>} */
  const productUrlBySku = new Map();
  /** @type {Map<string, string>} */
  const productUrlByName = new Map();
  for (const p of catalog.products || []) {
    const url = normStr(p.imageUrl);
    if (!url) continue;
    const sku = kioskProductArticle(p);
    const name = kioskProductName(p).toLowerCase();
    if (sku) productUrlBySku.set(sku, url);
    if (name) productUrlByName.set(name, url);
  }

  /** @type {Array<{ id: string, imageUrl: string, label: string }>} */
  const itemUpdates = [];
  for (const item of items) {
    const sku = normStr(item.article ?? item.sku ?? item.id);
    const name = normStr(item.name).toLowerCase();
    const url = (sku && productUrlBySku.get(sku)) || productUrlByName.get(name);
    if (!url || item.imageUrl === url) continue;
    itemUpdates.push({ id: item.id, imageUrl: url, label: item.name || sku || item.id });
  }

  return { categoryUpdates, itemUpdates };
}

/**
 * @param {import('firebase/firestore').Firestore} db
 * @param {{ categories: object[], products: object[] }} catalog
 * @param {object} [options]
 * @param {boolean} [options.dryRun]
 * @param {(msg: string) => void} [options.onLog]
 */
export async function patchKioskImages({
  db,
  catalog,
  dryRun = false,
  onLog = () => {},
}) {
  const log = onLog;

  const menuSnap = await getDoc(doc(db, COL.SETTINGS, MENU_SETTINGS_ID));
  const menuData = menuSnap.exists() ? menuSnap.data() : {};
  const categoryGroups = menuData.categoryGroups || [];

  const itemsSnap = await getDocs(collection(db, COL.ITEMS));
  const items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const { categoryUpdates, itemUpdates } = buildKioskImagePatchPlan(catalog, {
    menuCategoryGroups: categoryGroups,
    items,
  });

  log(`К обновлению: ${categoryUpdates.length} групп, ${itemUpdates.length} товаров`);
  if (dryRun) log('Режим просмотра — записи не выполняются');

  if (categoryUpdates.length) {
    const byId = new Map(categoryGroups.map(g => [normalizeCategoryGroup(g).id, normalizeCategoryGroup(g)]));
    for (const u of categoryUpdates) {
      const prev = byId.get(u.id);
      if (!prev) continue;
      byId.set(u.id, { ...prev, imageUrl: u.imageUrl });
      log(`↻ группа «${u.label}» → ${u.imageUrl}`);
    }
    if (!dryRun) {
      const groups = [...byId.values()];
      await setDoc(doc(db, COL.SETTINGS, MENU_SETTINGS_ID), {
        categoryGroups: groups,
        categories: groups.map(g => g.name),
      }, { merge: true });
    }
  }

  let batch = writeBatch(db);
  let pending = 0;
  let batches = 0;

  async function flush() {
    if (!pending) return;
    if (!dryRun) await batch.commit();
    batches += 1;
    log(`Пачка #${batches}: ${pending} товаров`);
    batch = writeBatch(db);
    pending = 0;
  }

  for (const u of itemUpdates) {
    log(`↻ товар «${u.label}» → ${u.imageUrl}`);
    batch.update(doc(db, COL.ITEMS, u.id), { imageUrl: u.imageUrl });
    pending += 1;
    if (pending >= KIOSK_IMAGE_BATCH_LIMIT) await flush();
  }
  await flush();

  log('── Итог ──');
  log(`Группы: ${categoryUpdates.length}, товары: ${itemUpdates.length}, пачек: ${batches}`);

  return {
    categories: categoryUpdates.length,
    items: itemUpdates.length,
    batches,
    dryRun,
  };
}
