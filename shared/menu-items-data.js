import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase.js';
import { COL } from './schema.js';

/**
 * Menu items visible in the web portal (personal account).
 * @returns {Promise<Array<import('./schema.js').MenuItemDoc & { id: string }>>}
 */
export async function fetchWebMenuItems() {
  const snap = await getDocs(query(
    collection(db, COL.ITEMS),
    where('visibleInWeb', '==', true),
    where('isAvailable', '==', true),
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
