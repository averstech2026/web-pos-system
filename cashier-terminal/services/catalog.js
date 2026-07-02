import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import { COL } from '../../shared/schema.js';
import { fetchPosMenuItems } from '../../shared/menu-items-data.js';
import {
  filterPosVisibleCategoryGroups,
  mergeCategoryGroups,
  sortCategoryGroupsByChannel,
} from '../../shared/menu-catalog.js';
import { resolveCategoryColor } from '../../shared/pos-channel.js';

/** @returns {Promise<{ items: object[], categoryGroups: object[] }>} */
export async function loadPosCatalog() {
  const [items, menuSnap] = await Promise.all([
    fetchPosMenuItems(),
    getDoc(doc(db, COL.SETTINGS, 'menu')),
  ]);

  const menuData = menuSnap.exists() ? menuSnap.data() : {};
  const categoryNames = items.map(i => i.category).filter(Boolean);
  const categoryGroups = sortCategoryGroupsByChannel(
    filterPosVisibleCategoryGroups(
      mergeCategoryGroups(menuData.categoryGroups, categoryNames),
    ),
    'pos',
  );

  const colorByCategory = new Map(
    categoryGroups.map(g => [g.name, g.color || resolveCategoryColor(g.name)]),
  );

  const enrichedItems = items.map(item => ({
    ...item,
    tileColor: colorByCategory.get(item.category) || resolveCategoryColor(item.category),
  }));

  return { items: enrichedItems, categoryGroups };
}
