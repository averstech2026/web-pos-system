import { normalizeCatalogItem, normalizeCompositeLunch } from './composite-meals.js';
import {
  filterPosVisibleCategoryGroups,
  mergeCategoryGroups,
  normalizeCategoryGroup,
  sortCategoryGroupsByChannel,
} from './menu-catalog.js';
import { resolveSalesChannelMode } from './sales-channel-modes.js';

/**
 * POS visibility for a menu item.
 * Regular items: explicit visibleInPos=false hides.
 * Composite (ланчи): respect item channel mode (everywhere/pos) before group inheritance.
 *
 * @param {object} item
 * @param {Map<string, import('./menu-catalog.js').CategoryGroup>} [groupsByName]
 */
export function isItemVisibleOnPos(item, groupsByName = new Map()) {
  const group = groupsByName.get(item?.category);
  const groupPosVisible = group ? group.visibleInPos !== false : true;

  if (item?.isComposite === true) {
    const mode = resolveSalesChannelMode(item.visibleInWeb, item.visibleInKiosk, item.visibleInPos);
    if (mode === 'hidden') return false;
    if (mode === 'everywhere' || mode === 'pos') return true;
    if (item.visibleInPos === true) return true;
    if (item.visibleInPos === false) return groupPosVisible;
    return groupPosVisible;
  }

  if (item?.visibleInPos === false) return false;
  if (item?.visibleInPos === true) return true;
  return groupPosVisible;
}

/**
 * @param {object[]} rawItems
 * @param {import('./menu-catalog.js').CategoryGroup[]} storedGroups
 */
export function buildPosCatalog(rawItems, storedGroups = []) {
  const allItems = rawItems.map(item => (
    item?.isComposite === true
      ? normalizeCompositeLunch(item)
      : normalizeCatalogItem(item)
  ));

  const seedGroupNames = allItems.map(i => i.category).filter(Boolean);
  const preliminaryGroups = mergeCategoryGroups(storedGroups, seedGroupNames);
  const groupsByName = new Map(
    preliminaryGroups.map(g => [g.name, normalizeCategoryGroup(g)]),
  );

  const items = allItems.filter(item => isItemVisibleOnPos(item, groupsByName));

  const itemCategoryNames = items.map(i => i.category).filter(Boolean);
  const storedPosGroupNames = storedGroups
    .map(g => normalizeCategoryGroup(g))
    .filter(g => g.visibleInPos !== false)
    .map(g => g.name)
    .filter(Boolean);

  const posVisibleCategoryNames = new Set([
    ...itemCategoryNames,
    ...items.filter(i => i.isComposite === true).map(i => i.category).filter(Boolean),
  ]);

  const mergedGroups = mergeCategoryGroups(storedGroups, [...posVisibleCategoryNames, ...storedPosGroupNames])
    .map(g => {
      const group = normalizeCategoryGroup(g);
      if (!posVisibleCategoryNames.has(group.name)) return group;
      if (items.some(i => i.category === group.name && i.isComposite === true)) {
        return { ...group, visibleInPos: true };
      }
      return group;
    });

  const categoryGroups = sortCategoryGroupsByChannel(
    filterPosVisibleCategoryGroups(mergedGroups),
    'pos',
  );

  return { items, categoryGroups };
}
