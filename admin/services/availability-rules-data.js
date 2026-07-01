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
  buildAvailabilityRulePayload,
  filterActiveRules,
  filterEnabledRules,
  normalizeAvailabilityRuleDoc,
  rulesToMap,
} from '../../shared/availability-rules.js';

export { rulesToMap };

/** @returns {Promise<import('../../shared/availability-rules.js').AvailabilityRuleDoc[]>} */
export async function fetchAllAvailabilityRules() {
  const snap = await getDocs(collection(db, COL.AVAILABILITY_RULES));
  return snap.docs
    .map(d => normalizeAvailabilityRuleDoc({ id: d.id, ...d.data() }, d.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/** Active templates only — for selects and kiosk. */
export async function fetchActiveAvailabilityRules() {
  const all = await fetchAllAvailabilityRules();
  return filterEnabledRules(all);
}

/**
 * @param {Partial<import('../../shared/availability-rules.js').AvailabilityRuleDoc>} rule
 * @param {string} [existingId]
 */
export async function saveAvailabilityRule(rule, existingId = '') {
  const payload = buildAvailabilityRulePayload(rule);
  const id = String(existingId || rule.id || '').trim();

  if (id) {
    await setDoc(doc(db, COL.AVAILABILITY_RULES, id), payload, { merge: true });
    return normalizeAvailabilityRuleDoc({ id, ...payload }, id);
  }

  const ref = await addDoc(collection(db, COL.AVAILABILITY_RULES), payload);
  return normalizeAvailabilityRuleDoc({ id: ref.id, ...payload }, ref.id);
}

/** @param {string} id */
export async function archiveAvailabilityRule(id) {
  await setDoc(doc(db, COL.AVAILABILITY_RULES, id), { status: 'archived' }, { merge: true });
}

/** @param {string} id */
export async function deleteAvailabilityRule(id) {
  await deleteDoc(doc(db, COL.AVAILABILITY_RULES, id));
}
