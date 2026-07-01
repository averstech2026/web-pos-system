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
  RECEIPT_TYPE,
  PAYMENT_CURRENCY,
  createPaymentMethodDoc,
} from '../../shared/schema.js';

const FALLBACK_PAYMENT_METHODS = [
  {
    id: 'cash',
    name: 'Наличные',
    currency: PAYMENT_CURRENCY.RUB,
    receiptType: RECEIPT_TYPE.FISCAL,
    allowedCategories: [],
    allowedUserGroups: [],
  },
  {
    id: 'card',
    name: 'Банковские карты',
    currency: PAYMENT_CURRENCY.RUB,
    receiptType: RECEIPT_TYPE.FISCAL,
    allowedCategories: [],
    allowedUserGroups: [],
  },
  {
    id: 'internal',
    name: 'Внутренний платеж',
    currency: PAYMENT_CURRENCY.RUB,
    receiptType: RECEIPT_TYPE.NON_FISCAL,
    allowedCategories: [],
    allowedUserGroups: [],
  },
];

/** @param {object} raw */
export function normalizePaymentMethod(raw) {
  return {
    id: raw.id,
    name: raw.name || raw.id,
    currency: raw.currency || PAYMENT_CURRENCY.RUB,
    receiptType: raw.receiptType === RECEIPT_TYPE.NON_FISCAL
      ? RECEIPT_TYPE.NON_FISCAL
      : RECEIPT_TYPE.FISCAL,
    allowedCategories: Array.isArray(raw.allowedCategories) ? raw.allowedCategories : [],
    allowedUserGroups: Array.isArray(raw.allowedUserGroups) ? raw.allowedUserGroups : [],
  };
}

/** @returns {Promise<Array<object>>} */
export async function fetchPaymentMethods() {
  const snap = await getDocs(collection(db, COL.PAYMENT_METHODS));
  if (snap.empty) return [...FALLBACK_PAYMENT_METHODS];
  return snap.docs
    .map(d => normalizePaymentMethod({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
}

/** @param {object} data */
export async function savePaymentMethod(data) {
  const id = data.id || doc(collection(db, COL.PAYMENT_METHODS)).id;
  const payload = createPaymentMethodDoc({ ...data, id });
  await setDoc(doc(db, COL.PAYMENT_METHODS, id), payload, { merge: true });
  return payload;
}

/** @param {string} id */
export async function deletePaymentMethod(id) {
  await deleteDoc(doc(db, COL.PAYMENT_METHODS, id));
}

export async function ensureDefaultPaymentMethods() {
  for (const method of FALLBACK_PAYMENT_METHODS) {
    const ref = doc(db, COL.PAYMENT_METHODS, method.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        name: method.name,
        currency: method.currency,
        receiptType: method.receiptType,
        allowedCategories: method.allowedCategories,
        allowedUserGroups: method.allowedUserGroups,
      });
    }
  }
}

export function paymentMethodMeta(method) {
  const receiptLabel = method.receiptType === RECEIPT_TYPE.NON_FISCAL
    ? 'Не фискальный'
    : 'Фискальный';
  const parts = [receiptLabel];
  const catCount = method.allowedCategories?.length || 0;
  const groupCount = method.allowedUserGroups?.length || 0;

  if (catCount) parts.push(`${catCount} кат.`);
  if (groupCount) parts.push(`${groupCount} ${clientGroupsCountLabel(groupCount)}`);

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
