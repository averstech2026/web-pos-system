import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDocs,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import { COL, createItemDoc } from '../../shared/schema.js';
import { getItemImageUrl } from '../../shared/item-images.js';
import { mergeCategories, normalizeModifierGroupIds } from '../../shared/menu-catalog.js';
import { normalizeCatalogItem } from '../../shared/composite-meals.js';

export { DEFAULT_CATEGORIES } from '../../shared/menu-catalog.js';
export { fetchWebMenuItems } from '../../shared/menu-items-data.js';

export async function fetchAllItems() {
  const snap = await getDocs(collection(db, COL.ITEMS));
  return snap.docs
    .map(d => normalizeCatalogItem({ id: d.id, ...d.data() }))
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

/** @typedef {'everywhere'|'web'|'kiosk'|'hidden'} ItemChannelMode */

export const ITEM_CHANNEL_MODES = [
  { id: 'everywhere', label: 'Везде', desc: 'Личный кабинет и киоск' },
  { id: 'web', label: 'Только Веб', desc: 'Личный кабинет' },
  { id: 'kiosk', label: 'Только Киоск', desc: 'Самообслуживание на киоске' },
  { id: 'hidden', label: 'Скрыт', desc: 'Не отображается ни в одном канале' },
];

/** @param {boolean} visibleInWeb @param {boolean} visibleInKiosk @returns {ItemChannelMode} */
export function resolveChannelMode(visibleInWeb, visibleInKiosk) {
  const web = visibleInWeb !== false;
  const kiosk = visibleInKiosk === true;
  if (web && kiosk) return 'everywhere';
  if (web) return 'web';
  if (kiosk) return 'kiosk';
  return 'hidden';
}

/** @param {ItemChannelMode|string} mode */
export function channelFlagsFromMode(mode) {
  switch (mode) {
    case 'everywhere':
      return { visibleInWeb: true, visibleInKiosk: true, isAvailable: true };
    case 'web':
      return { visibleInWeb: true, visibleInKiosk: false, isAvailable: true };
    case 'kiosk':
      return { visibleInWeb: false, visibleInKiosk: true, isAvailable: true };
    case 'hidden':
      return { visibleInWeb: false, visibleInKiosk: false, isAvailable: false };
    default:
      return { visibleInWeb: true, visibleInKiosk: false, isAvailable: true };
  }
}

/** @param {object} item */
export function isItemVisibleInWeb(item) {
  return item?.visibleInWeb !== false;
}

/** @param {object} item */
export function isItemVisibleInKiosk(item) {
  return item?.visibleInKiosk === true;
}

/** @param {object} item */
export function isItemVisibleSomewhere(item) {
  return isItemVisibleInWeb(item) || isItemVisibleInKiosk(item);
}

/**
 * @param {Array<object>} items
 * @param {{ categories?: string[], allergens?: string[], search?: string, channel?: string }} filters
 */
export function filterItems(items, {
  categories = [],
  allergens = [],
  search = '',
  channel = 'all',
} = {}) {
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

  if (channel && channel !== 'all') {
    result = result.filter(i => resolveChannelMode(i.visibleInWeb, i.visibleInKiosk) === channel);
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
  const modifierGroupIds = normalizeModifierGroupIds(data.modifierGroupIds);
  const nutrition = parseNutrition(data);
  const availabilityRuleId = data.availabilityRuleId || null;

  const payload = createItemDoc({
    name,
    description,
    price,
    category,
    isAvailable,
    availabilityRuleId,
    imageUrl: data.imageUrl || getItemImageUrl(name) || null,
    nutrition: nutrition || undefined,
    allergens,
    visibleInWeb: data.visibleInWeb,
    visibleInKiosk: data.visibleInKiosk,
    isComposite: false,
  });

  if (modifierGroupIds.length) payload.modifierGroupIds = modifierGroupIds;

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

  if (!normalizeModifierGroupIds(merged.modifierGroupIds).length) {
    update.modifierGroupIds = deleteField();
  }

  if (!merged.availabilityRuleId) {
    update.availabilityRuleId = deleteField();
    update.availability = deleteField();
  } else {
    update.availability = deleteField();
  }

  update.isComposite = false;
  if (existing.isComposite || existing.lunchSteps?.length) {
    update.lunchSteps = deleteField();
    update.allowedPaymentMethods = deleteField();
  }

  await updateDoc(doc(db, COL.ITEMS, id), update);
  return { id, ...update };
}

/** @param {string} id */
export async function archiveItem(id) {
  await updateDoc(doc(db, COL.ITEMS, id), {
    isArchived: true,
    isAvailable: false,
  });
}

/** @param {string} id */
export async function unarchiveItem(id) {
  await updateDoc(doc(db, COL.ITEMS, id), { isArchived: false });
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

/** @param {string[]} itemIds @param {ItemChannelMode|string} mode */
export async function bulkSetChannelVisibility(itemIds, mode) {
  const flags = channelFlagsFromMode(mode);
  const updates = itemIds.map(id => ({ id, data: flags }));
  await commitItemUpdates(updates);
  return itemIds.length;
}

/** @param {string[]} itemIds @param {string|null} ruleId */
export async function bulkSetAvailabilityRule(itemIds, ruleId) {
  const updates = itemIds.map(id => ({
    id,
    data: ruleId
      ? { availabilityRuleId: ruleId, availability: deleteField() }
      : { availabilityRuleId: deleteField(), availability: deleteField() },
  }));
  await commitItemUpdates(updates);
  return itemIds.length;
}

/** @param {string[]} itemIds */
export async function bulkArchiveItems(itemIds) {
  const updates = itemIds.map(id => ({
    id,
    data: { isArchived: true, isAvailable: false },
  }));
  await commitItemUpdates(updates);
  return itemIds.length;
}

/** @param {string[]} itemIds */
export async function bulkUnarchiveItems(itemIds) {
  const updates = itemIds.map(id => ({ id, data: { isArchived: false } }));
  await commitItemUpdates(updates);
  return itemIds.length;
}
