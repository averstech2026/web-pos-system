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
  normalizeWalletAllowedCategories,
} from '../../shared/schema.js';

const FALLBACK_WALLETS = [
  {
    id: 'personal',
    name: DEFAULT_WALLET_DEFS.personal.name,
    description: 'Личные средства клиента',
    allowedCategories: [],
    allowedUserGroups: [],
  },
  {
    id: 'dotation',
    name: DEFAULT_WALLET_DEFS.dotation.name,
    description: 'Корпоративная дотация',
    allowedCategories: [],
    allowedUserGroups: [],
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
    allowedCategories: normalizeWalletAllowedCategories(raw),
    allowedUserGroups: Array.isArray(raw.allowedUserGroups) ? raw.allowedUserGroups : [],
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

export function walletMeta(wallet) {
  const parts = [];
  const catCount = wallet.allowedCategories?.length || 0;
  const groupCount = wallet.allowedUserGroups?.length || 0;

  if (catCount) parts.push(`${catCount} кат.`);
  if (groupCount) parts.push(`${groupCount} ${clientGroupsCountLabel(groupCount)}`);
  if (!parts.length) return 'Все категории и группы';
  return parts.join(' · ');
}

/** @param {number} count */
function clientGroupsCountLabel(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'группа клиентов';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'группы клиентов';
  return 'групп клиентов';
}

export async function ensureDefaultWallets() {
  for (const wallet of FALLBACK_WALLETS) {
    const ref = doc(db, COL.WALLETS, wallet.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        name: wallet.name,
        description: wallet.description || '',
        allowedCategories: wallet.allowedCategories,
        allowedUserGroups: wallet.allowedUserGroups,
      });
    }
  }
}
