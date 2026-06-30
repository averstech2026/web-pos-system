import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '@shared/firebase.js';
import { COL } from '@shared/schema.js';
import { fetchKioskMenuItems } from '@shared/menu-items-data.js';
import {
  filterKioskVisibleCategoryGroups,
  mergeCategoryGroups,
  slugFromCategoryName,
} from '@shared/menu-catalog.js';
import {
  filterActiveRules,
  isMenuItemAvailableAt,
  normalizeAvailabilityRuleDoc,
} from '@shared/availability-rules.js';
import { getItemImageUrl, resolveProductImageUrl } from '@shared/item-images.js';
import { loadKioskMarketingBanners } from './marketing-banners.js';

/** @typedef {{ id: string, label: string, icon: string, sortOrder: number }} KioskCategory */
/** @typedef {{ id: string, category: string, name: string, price: number, image: string, composition: string, sortOrder: number }} KioskProduct */

/** @type {KioskCategory[]} */
export let CATEGORIES = [];
/** @type {KioskProduct[]} */
export let PRODUCTS = [];

let loadError = null;

function resolveImage(url, name) {
  return resolveProductImageUrl(url) || getItemImageUrl(name) || '';
}

function currentSlot() {
  const now = new Date();
  return {
    date: now.toISOString().slice(0, 10),
    time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
  };
}

/**
 * Загружает меню киоска из Firestore (items + settings/menu).
 * @returns {Promise<void>}
 */
export async function loadKioskCatalog() {
  loadError = null;
  const slot = currentSlot();

  const [rawItems, menuSnap, rulesSnap] = await Promise.all([
    fetchKioskMenuItems(),
    getDoc(doc(db, COL.SETTINGS, 'menu')),
    getDocs(collection(db, COL.AVAILABILITY_RULES)),
  ]);

  const rules = filterActiveRules(
    rulesSnap.docs.map(d => normalizeAvailabilityRuleDoc({ id: d.id, ...d.data() }, d.id)),
  );
  const groupsByName = new Map();

  const menuData = menuSnap.exists() ? menuSnap.data() : {};
  const allGroups = mergeCategoryGroups(menuData.categoryGroups || []);
  const kioskGroups = filterKioskVisibleCategoryGroups(allGroups);

  for (const g of kioskGroups) {
    groupsByName.set(g.name, g);
  }

  const availableItems = rawItems.filter(item =>
    isMenuItemAvailableAt(item, groupsByName, rules, { date: slot.date, time: slot.time }),
  );

  CATEGORIES = kioskGroups.map((g, index) => ({
    id: g.id,
    label: g.name,
    icon: resolveImage(g.imageUrl, g.name),
    sortOrder: Number(g.kioskOrder) || Number(g.sortOrder) || index,
  })).sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'ru'));

  const categoryIds = new Set(CATEGORIES.map(c => c.id));
  const categoryNames = new Map(CATEGORIES.map(c => [c.label, c.id]));

  PRODUCTS = availableItems
    .map(item => {
      const categoryId = item.categoryId
        || categoryNames.get(item.category)
        || slugFromCategoryName(item.category || '');
      return {
        id: item.id,
        category: categoryId,
        name: item.name,
        price: Number(item.price) || 0,
        image: resolveImage(item.imageUrl, item.name),
        composition: item.description || '',
        sortOrder: Number(item.sortOrder) || 0,
      };
    })
    .filter(p => categoryIds.has(p.category) || CATEGORIES.length === 0)
    .sort((a, b) => {
      const catOrder = (CATEGORIES.find(c => c.id === a.category)?.sortOrder ?? 0)
        - (CATEGORIES.find(c => c.id === b.category)?.sortOrder ?? 0);
      if (catOrder !== 0) return catOrder;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name, 'ru');
    });

  if (!CATEGORIES.length && PRODUCTS.length) {
    const fromProducts = [...new Set(PRODUCTS.map(p => p.category))];
    CATEGORIES = fromProducts.map((id, index) => ({
      id,
      label: id,
      icon: '',
      sortOrder: index,
    }));
  }

  await loadKioskMarketingBanners(rules, slot);
}

export function getCatalogError() {
  return loadError;
}

export function findProduct(productId) {
  return PRODUCTS.find(p => p.id === productId) || null;
}
