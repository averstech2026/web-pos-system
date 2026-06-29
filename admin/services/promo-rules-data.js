import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
} from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import { COL } from '../../shared/schema.js';
import {
  buildPromoRulePayload,
  normalizePromoRuleDoc,
} from '../../shared/promo-rules.js';

/** @returns {Promise<import('../../shared/promo-rules.js').PromoRuleDoc[]>} */
export async function fetchAllPromoRules() {
  const snap = await getDocs(collection(db, COL.PROMO_RULES));
  return snap.docs
    .map(d => normalizePromoRuleDoc({ id: d.id, ...d.data() }, d.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/** @returns {Promise<import('../../shared/promo-rules.js').PromoRuleDoc[]>} */
export async function fetchActivePromoRules() {
  const all = await fetchAllPromoRules();
  return all.filter(p => p.isActive);
}

/**
 * @param {Partial<import('../../shared/promo-rules.js').PromoRuleDoc>} rule
 * @param {string} [existingId]
 */
export async function savePromoRule(rule, existingId = '') {
  const payload = buildPromoRulePayload(rule);
  const id = String(existingId || rule.id || '').trim();

  if (id) {
    await setDoc(doc(db, COL.PROMO_RULES, id), payload, { merge: true });
    return normalizePromoRuleDoc({ id, ...payload }, id);
  }

  const ref = await addDoc(collection(db, COL.PROMO_RULES), payload);
  return normalizePromoRuleDoc({ id: ref.id, ...payload }, ref.id);
}

/** @param {string} id */
export async function deletePromoRule(id) {
  await deleteDoc(doc(db, COL.PROMO_RULES, id));
}
