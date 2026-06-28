import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import { COL, createItemDoc } from '../../shared/schema.js';
import { getItemImageUrl } from '../../shared/item-images.js';
import { buildAvailabilityFromForm, normalizeItemAvailability } from '../../shared/item-availability.js';
import { mergeCategories } from '../../shared/menu-catalog.js';

export { DEFAULT_CATEGORIES } from '../../shared/menu-catalog.js';

export async function fetchAllItems() {
  const snap = await getDocs(collection(db, COL.ITEMS));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const cat = (a.category || '').localeCompare(b.category || '', 'ru');
      if (cat !== 0) return cat;
      return (a.name || '').localeCompare(b.name || '', 'ru');
    });
}

/**
 * @param {string[]} catalogCategories
 * @param {Array<{ category?: string }>} items
 */
export function collectCategories(catalogCategories, items) {
  const fromItems = items.map(i => i.category).filter(Boolean);
  return mergeCategories(catalogCategories, fromItems);
}

/**
 * @param {Array<object>} items
 * @param {{ categories?: string[], allergens?: string[], search?: string, availability?: string }} filters
 */
export function filterItems(items, { categories = [], allergens = [], search = '', availability = 'all' } = {}) {
  let result = items;

  if (categories?.length) {
    const set = new Set(categories);
    result = result.filter(i => set.has(i.category));
  }

  if (allergens?.length) {
    const set = new Set(allergens);
    result = result.filter(i => Array.isArray(i.allergens) && i.allergens.some(id => set.has(id)));
  }

  const q = search.trim().toLowerCase();
  if (q) {
    result = result.filter(i =>
      i.name?.toLowerCase().includes(q)
      || i.description?.toLowerCase().includes(q)
      || i.category?.toLowerCase().includes(q),
    );
  }

  if (availability === 'available') {
    result = result.filter(i => i.isAvailable !== false);
  } else if (availability === 'hidden') {
    result = result.filter(i => i.isAvailable === false);
  }

  return result;
}

/** @param {object} data */
function parseNutrition(data) {
  const nutrition = {};
  let hasAny = false;

  for (const key of ['protein', 'fat', 'carbs', 'kcal']) {
    const raw = data[key];
    if (raw === '' || raw == null) continue;
    const num = Number(raw);
    if (Number.isFinite(num)) {
      nutrition[key] = num;
      hasAny = true;
    }
  }

  return hasAny ? nutrition : null;
}

/**
 * @param {object} data
 */
export function buildItemPayload(data) {
  const name = String(data.name || '').trim();
  const description = String(data.description || '').trim();
  const category = String(data.category || '').trim();
  const price = Number(data.price);
  const isAvailable = data.isAvailable !== false;
  const allergens = Array.isArray(data.allergens) ? data.allergens.filter(Boolean) : [];
  const nutrition = parseNutrition(data);
  const availability = data.availability != null
    ? normalizeItemAvailability(data.availability)
    : normalizeItemAvailability(null);

  const payload = createItemDoc({
    name,
    description,
    price,
    category,
    isAvailable,
    availability,
    imageUrl: data.imageUrl || getItemImageUrl(name) || null,
    nutrition: nutrition || undefined,
    allergens,
  });

  return payload;
}

/** @param {object} data */
export async function createItem(data) {
  const payload = buildItemPayload(data);
  const ref = await addDoc(collection(db, COL.ITEMS), payload);
  return { id: ref.id, ...payload };
}

/** @param {string} id @param {object} data @param {object} [existing] */
export async function updateItem(id, data, existing = {}) {
  const merged = { ...existing, ...data };
  const payload = buildItemPayload(merged);
  delete payload.nutrition;

  const update = { ...payload };
  const nutrition = parseNutrition(merged);

  if (nutrition) {
    update.nutrition = nutrition;
  } else if (existing.nutrition) {
    update.nutrition = deleteField();
  }

  if (!merged.allergens?.length) {
    update.allergens = deleteField();
  }

  if (!merged.availability?.restricted) {
    update.availability = deleteField();
  }

  await updateDoc(doc(db, COL.ITEMS, id), update);
  return { id, ...update };
}

/** @param {string} id */
export async function deleteItem(id) {
  await deleteDoc(doc(db, COL.ITEMS, id));
}

/** @param {string} id @param {boolean} isAvailable */
export async function setItemAvailability(id, isAvailable) {
  await updateDoc(doc(db, COL.ITEMS, id), { isAvailable });
}

/** @param {Array<{ id: string, category: string }>} updates */
export async function batchSetItemCategories(updates) {
  if (!updates.length) return 0;
  await commitItemUpdates(updates.map(({ id, category }) => ({ id, data: { category } })));
  return updates.length;
}

const BATCH_LIMIT = 500;

/** @param {Array<{ id: string, data: object }>} updates */
async function commitItemUpdates(updates) {
  if (!updates.length) return;

  for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const { id, data } of updates.slice(i, i + BATCH_LIMIT)) {
      batch.update(doc(db, COL.ITEMS, id), data);
    }
    await batch.commit();
  }
}

/** @param {string[]} itemIds @param {string} category */
export async function bulkSetCategory(itemIds, category) {
  const updates = itemIds.map(id => ({ id, data: { category } }));
  await commitItemUpdates(updates);
  return itemIds.length;
}

/**
 * @param {Array<{ id: string, allergens?: string[] }>} items
 * @param {string[]} allergenIds
 * @param {'union'|'overwrite'} mode
 */
export async function bulkSetAllergens(items, allergenIds, mode) {
  const updates = items.map(item => {
    const merged = mode === 'union'
      ? [...new Set([...(item.allergens || []), ...allergenIds])]
      : [...allergenIds];

    return {
      id: item.id,
      data: merged.length ? { allergens: merged } : { allergens: deleteField() },
    };
  });

  await commitItemUpdates(updates);
  return items.length;
}

/** @param {string[]} itemIds @param {boolean} isAvailable */
export async function bulkSetAvailability(itemIds, isAvailable) {
  const updates = itemIds.map(id => ({ id, data: { isAvailable } }));
  await commitItemUpdates(updates);
  return itemIds.length;
}
