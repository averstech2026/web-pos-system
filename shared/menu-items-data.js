import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase.js';
import { COL } from './schema.js';
import { normalizeCatalogItem } from './composite-meals.js';
import { buildPosCatalog } from './pos-catalog.js';

/**
 * Menu items visible in the web portal (personal account).
 * Treats missing visibleInWeb as visible (same as admin / menu-catalog defaults).
 * @returns {Promise<Array<import('./schema.js').MenuItemDoc & { id: string }>>}
 */
export async function fetchWebMenuItems() {
  const snap = await getDocs(query(
    collection(db, COL.ITEMS),
    where('isAvailable', '==', true),
  ));
  return snap.docs
    .map(d => normalizeCatalogItem({ id: d.id, ...d.data() }))
    .filter(item => item.visibleInWeb !== false);
}

/**
 * Menu items visible on the self-service kiosk.
 * @returns {Promise<Array<import('./schema.js').MenuItemDoc & { id: string }>>}
 */
export async function fetchKioskMenuItems() {
  const snap = await getDocs(query(
    collection(db, COL.ITEMS),
    where('visibleInKiosk', '==', true),
    where('isAvailable', '==', true),
  ));
  return snap.docs.map(d => normalizeCatalogItem({ id: d.id, ...d.data() }));
}

/**
 * Menu items visible on the cashier POS terminal.
 * @returns {Promise<Array<import('./schema.js').MenuItemDoc & { id: string }>>}
 */
export async function fetchPosMenuItems() {
  const [itemsSnap, menuSnap] = await Promise.all([
    getDocs(query(
      collection(db, COL.ITEMS),
      where('isAvailable', '==', true),
    )),
    getDoc(doc(db, COL.SETTINGS, 'menu')),
  ]);

  const menuData = menuSnap.exists() ? menuSnap.data() : {};
  const rawItems = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  return buildPosCatalog(rawItems, menuData.categoryGroups || []).items;
}
