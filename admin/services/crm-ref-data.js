import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import {
  COL,
  createLoyaltyCategoryDoc,
  createUserGroupDoc,
} from '../../shared/schema.js';
import { normalizeGroupAllowedWalletIds } from '../../shared/group-wallets.js';
import { syncGroupWalletsToMembers } from './users-data.js';

const FALLBACK_USER_GROUPS = [
  { id: 'office_romashka', name: 'Офис Ромашка', description: 'Офисные сотрудники', allowedWalletIds: ['personal', 'dotation'] },
  { id: 'production', name: 'Производство', description: 'Производственный персонал', allowedWalletIds: ['personal', 'dotation'] },
  { id: 'askona', name: 'Завод Аскона', description: 'Корпоративное питание', allowedWalletIds: ['personal', 'dotation'] },
];

const FALLBACK_LOYALTY_CATEGORIES = [
  { id: 'bronze', name: 'Бронза', discountPercent: 0, cashbackPercent: 3 },
  { id: 'silver', name: 'Серебро', discountPercent: 5, cashbackPercent: 5 },
  { id: 'gold', name: 'Золото', discountPercent: 10, cashbackPercent: 7 },
];

/** @param {object} raw */
export function normalizeUserGroup(raw) {
  return {
    ...raw,
    allowedWalletIds: normalizeGroupAllowedWalletIds(raw),
  };
}

/** @returns {Promise<Array<object>>} */
export async function fetchUserGroups() {
  const snap = await getDocs(collection(db, COL.USER_GROUPS));
  if (snap.empty) return FALLBACK_USER_GROUPS.map(normalizeUserGroup);
  return snap.docs
    .map(d => normalizeUserGroup({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
}

/** @returns {Promise<Array<object>>} */
export async function fetchLoyaltyCategories() {
  const snap = await getDocs(collection(db, COL.LOYALTY_CATEGORIES));
  if (snap.empty) return [...FALLBACK_LOYALTY_CATEGORIES];
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
}

/** @param {object} data @returns {Promise<{ payload: object, syncedUsers: number }>} */
export async function saveUserGroup(data) {
  const id = data.id || doc(collection(db, COL.USER_GROUPS)).id;
  const payload = createUserGroupDoc({ ...data, id });
  await setDoc(doc(db, COL.USER_GROUPS, id), payload, { merge: true });
  const syncedUsers = await syncGroupWalletsToMembers(id, payload.allowedWalletIds);
  return { payload, syncedUsers };
}

/** @param {string} id */
export async function deleteUserGroup(id) {
  await deleteDoc(doc(db, COL.USER_GROUPS, id));
}

/** @param {object} data */
export async function saveLoyaltyCategory(data) {
  const id = data.id || doc(collection(db, COL.LOYALTY_CATEGORIES)).id;
  const payload = createLoyaltyCategoryDoc({ ...data, id });
  await setDoc(doc(db, COL.LOYALTY_CATEGORIES, id), payload, { merge: true });
  return payload;
}

/** @param {string} id */
export async function deleteLoyaltyCategory(id) {
  await deleteDoc(doc(db, COL.LOYALTY_CATEGORIES, id));
}

export async function ensureDefaultCrmRefs() {
  for (const group of FALLBACK_USER_GROUPS) {
    const ref = doc(db, COL.USER_GROUPS, group.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        name: group.name,
        description: group.description || '',
        allowedWalletIds: group.allowedWalletIds || ['personal', 'dotation'],
      });
    }
  }
  for (const cat of FALLBACK_LOYALTY_CATEGORIES) {
    const ref = doc(db, COL.LOYALTY_CATEGORIES, cat.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        name: cat.name,
        discountPercent: cat.discountPercent,
        cashbackPercent: cat.cashbackPercent,
      });
    }
  }
}
