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
  DEFAULT_WALLET_DEFS,
  createWalletDoc,
} from '../../shared/schema.js';

const FALLBACK_WALLETS = [
  {
    id: 'personal',
    name: DEFAULT_WALLET_DEFS.personal.name,
    description: 'Личные средства клиента',
    restrictions: [],
  },
  {
    id: 'dotation',
    name: DEFAULT_WALLET_DEFS.dotation.name,
    description: 'Корпоративная дотация',
    restrictions: [],
  },
];

/** @returns {Promise<Array<object>>} */
export async function fetchWallets() {
  const snap = await getDocs(collection(db, COL.WALLETS));
  if (snap.empty) return [...FALLBACK_WALLETS];
  return snap.docs
    .map(d => normalizeWallet({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
}

/** @param {object} raw */
export function normalizeWallet(raw) {
  return {
    id: raw.id,
    name: raw.name || raw.id,
    description: raw.description || '',
    restrictions: Array.isArray(raw.restrictions) ? raw.restrictions : [],
  };
}

/** @param {object} data */
export async function saveWallet(data) {
  const id = data.id || doc(collection(db, COL.WALLETS)).id;
  const payload = createWalletDoc({ ...data, id });
  await setDoc(doc(db, COL.WALLETS, id), payload, { merge: true });
  return payload;
}

/** @param {string} id */
export async function deleteWallet(id) {
  await deleteDoc(doc(db, COL.WALLETS, id));
}

/** @param {string} id @returns {Promise<object|null>} */
export async function fetchWalletById(id) {
  const snap = await getDoc(doc(db, COL.WALLETS, id));
  if (!snap.exists()) return null;
  return normalizeWallet({ id: snap.id, ...snap.data() });
}

export async function ensureDefaultWallets() {
  for (const wallet of FALLBACK_WALLETS) {
    const ref = doc(db, COL.WALLETS, wallet.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        name: wallet.name,
        description: wallet.description || '',
        restrictions: wallet.restrictions,
      });
    }
  }
}
