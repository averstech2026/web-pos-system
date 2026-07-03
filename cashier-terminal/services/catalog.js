import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import { COL } from '../../shared/schema.js';
import { buildPosCatalog } from '../../shared/pos-catalog.js';
import { resolveCategoryColor } from '../../shared/pos-channel.js';

function isPosCatalogItemAvailable(item) {
  if (item?.isArchived === true) return false;
  return item?.isAvailable !== false;
}

/** @param {object[]} rawItems */
export function buildPosCatalogLookup(rawItems = []) {
  return new Map(
    rawItems
      .filter(item => item?.id && item.isComposite !== true)
      .map(item => [item.id, item]),
  );
}

/** @returns {Promise<{ items: object[], categoryGroups: object[], catalogById: Map<string, object> }>} */
export async function loadPosCatalog() {
  const [itemsSnap, menuSnap] = await Promise.all([
    getDocs(collection(db, COL.ITEMS)),
    getDoc(doc(db, COL.SETTINGS, 'menu')),
  ]);

  const menuData = menuSnap.exists() ? menuSnap.data() : {};
  const storedGroups = menuData.categoryGroups || [];
  const rawItems = itemsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(isPosCatalogItemAvailable);

  const { items, categoryGroups } = buildPosCatalog(rawItems, storedGroups);

  const colorByCategory = new Map(
    categoryGroups.map(g => [g.name, g.color || resolveCategoryColor(g.name)]),
  );

  const enrichedItems = items.map(item => ({
    ...item,
    tileColor: colorByCategory.get(item.category) || resolveCategoryColor(item.category),
  }));

  return { items: enrichedItems, categoryGroups, catalogById: buildPosCatalogLookup(rawItems) };
}
