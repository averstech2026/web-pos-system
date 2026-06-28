import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import { COL } from '../../shared/schema.js';
import { DEFAULT_ALLERGENS, mergeAllergens, mergeCategories } from '../../shared/menu-catalog.js';

const MENU_SETTINGS_ID = 'menu';

/**
 * @returns {Promise<{ categories: string[], allergens: Array<{ id: string, name: string }> }>}
 */
export async function fetchMenuSettings(itemCategories = []) {
  const snap = await getDoc(doc(db, COL.SETTINGS, MENU_SETTINGS_ID));
  const data = snap.exists() ? snap.data() : {};

  return {
    categories: mergeCategories(data.categories, itemCategories),
    allergens: mergeAllergens(data.allergens),
  };
}

/** @param {string[]} categories */
export async function saveCategories(categories) {
  await setDoc(
    doc(db, COL.SETTINGS, MENU_SETTINGS_ID),
    { categories },
    { merge: true },
  );
}

/** @param {Array<{ id: string, name: string }>} allergens */
export async function saveAllergens(allergens) {
  await setDoc(
    doc(db, COL.SETTINGS, MENU_SETTINGS_ID),
    { allergens },
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

/** @param {string} category */
export async function countItemsInCategory(category) {
  const snap = await getDocs(collection(db, COL.ITEMS));
  return snap.docs.filter(d => d.data().category === category).length;
}
