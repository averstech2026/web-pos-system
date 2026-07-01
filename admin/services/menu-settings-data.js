import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import { COL } from '../../shared/schema.js';
import {
  DEFAULT_ALLERGENS,
  categoryGroupsToNames,
  mergeAllergens,
  mergeModifierGroups,
  mergeCategoryGroups,
  normalizeCategoryGroup,
  normalizeModifierGroup,
} from '../../shared/menu-catalog.js';

const MENU_SETTINGS_ID = 'menu';

/**
 * @param {object} data
 * @param {string[]} itemCategories
 */
function resolveCategoryGroups(data, itemCategories) {
  if (data.categoryGroups?.length) {
    return mergeCategoryGroups(data.categoryGroups, itemCategories);
  }
  return mergeCategoryGroups(data.categories, itemCategories);
}

/**
 * @returns {Promise<{
 *   categories: string[],
 *   categoryGroups: import('../../shared/menu-catalog.js').CategoryGroup[],
 *   allergens: Array<{ id: string, name: string }>,
 *   modifierGroups: import('../../shared/menu-catalog.js').ModifierGroup[],
 * }>}
 */
export async function fetchMenuSettings(itemCategories = []) {
  const snap = await getDoc(doc(db, COL.SETTINGS, MENU_SETTINGS_ID));
  const data = snap.exists() ? snap.data() : {};
  const categoryGroups = resolveCategoryGroups(data, itemCategories);

  return {
    categoryGroups,
    categories: categoryGroupsToNames(categoryGroups),
    allergens: mergeAllergens(data.allergens),
    modifierGroups: mergeModifierGroups(data.modifierGroups),
  };
}

/** @param {import('../../shared/menu-catalog.js').CategoryGroup[]} categoryGroups */
export async function saveCategoryGroups(categoryGroups) {
  const groups = categoryGroups.map(g => normalizeCategoryGroup(g)).filter(g => g.name);
  await setDoc(
    doc(db, COL.SETTINGS, MENU_SETTINGS_ID),
    {
      categoryGroups: groups,
      categories: categoryGroupsToNames(groups),
    },
    { merge: true },
  );
}

/** @param {string[]} categories @deprecated use saveCategoryGroups */
export async function saveCategories(categories) {
  await saveCategoryGroups(categories.map(name => normalizeCategoryGroup(name)));
}

/** @param {Array<{ id: string, name: string }>} allergens */
export async function saveAllergens(allergens) {
  await setDoc(
    doc(db, COL.SETTINGS, MENU_SETTINGS_ID),
    { allergens },
    { merge: true },
  );
}

/** @param {import('../../shared/menu-catalog.js').ModifierGroup[]} modifierGroups */
export async function saveModifierGroups(modifierGroups) {
  const groups = modifierGroups.map(g => normalizeModifierGroup(g)).filter(g => g.id && g.name);
  await setDoc(
    doc(db, COL.SETTINGS, MENU_SETTINGS_ID),
    { modifierGroups: groups },
    { merge: true },
  );
}

/**
 * @param {string} oldName
 * @param {string} newName
 */
export async function renameCategoryOnItems(oldName, newName) {
  const snap = await getDocs(collection(db, COL.ITEMS));
  const batch = writeBatch(db);
  let count = 0;

  for (const d of snap.docs) {
    if (d.data().category === oldName) {
      batch.update(d.ref, { category: newName });
      count += 1;
    }
  }

  if (count) await batch.commit();
  return count;
}

/**
 * @param {string} name
 * @param {string} [moveTo]
 */
export async function deleteCategoryOnItems(name, moveTo = 'Прочее') {
  const snap = await getDocs(collection(db, COL.ITEMS));
  const batch = writeBatch(db);
  let count = 0;

  for (const d of snap.docs) {
    if (d.data().category === name) {
      batch.update(d.ref, { category: moveTo });
      count += 1;
    }
  }

  if (count) await batch.commit();
  return count;
}

/**
 * @param {import('../../shared/menu-catalog.js').CategoryGroup[]} groups
 * @param {Record<string, Set<string>|string[]>} memberIdsByGroupId
 */
export async function syncCategoryMembership(groups, memberIdsByGroupId) {
  const snap = await getDocs(collection(db, COL.ITEMS));
  const batch = writeBatch(db);
  let count = 0;

  for (const group of groups) {
    const raw = memberIdsByGroupId[group.id];
    const ids = new Set(Array.isArray(raw) ? raw : [...(raw || [])]);

    for (const d of snap.docs) {
      const category = d.data().category;
      if (ids.has(d.id) && category !== group.name) {
        batch.update(d.ref, { category: group.name });
        count += 1;
      } else if (!ids.has(d.id) && category === group.name) {
        batch.update(d.ref, { category: 'Прочее' });
        count += 1;
      }
    }
  }

  if (count) await batch.commit();
  return count;
}

/** @param {string} category */
export async function countItemsInCategory(category) {
  const snap = await getDocs(collection(db, COL.ITEMS));
  return snap.docs.filter(d => d.data().category === category).length;
}

export { DEFAULT_ALLERGENS };
