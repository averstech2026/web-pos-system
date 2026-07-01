import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  deleteField,
} from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import { COL } from '../../shared/schema.js';
import {
  buildValidationRulePayload,
  normalizeValidationRuleDoc,
} from '../../shared/validation-rules.js';

/** @returns {Promise<import('../../shared/validation-rules.js').ValidationRuleDoc[]>} */
export async function fetchAllValidationRules() {
  const snap = await getDocs(collection(db, COL.VALIDATION_RULES));
  return snap.docs
    .map(d => normalizeValidationRuleDoc({ id: d.id, ...d.data() }, d.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/**
 * @param {Partial<import('../../shared/validation-rules.js').ValidationRuleDoc>} rule
 * @param {string} [existingId]
 */
export async function saveValidationRule(rule, existingId = '') {
  const payload = {
    ...buildValidationRulePayload(rule),
    scheduleTemplate: deleteField(),
  };
  if (!payload.availabilityRuleId) {
    payload.availabilityRuleId = deleteField();
  }
  if (payload.approachInterval !== 'period') {
    payload.approachPeriodStart = deleteField();
    payload.approachPeriodEnd = deleteField();
  } else {
    if (!payload.approachPeriodStart) payload.approachPeriodStart = deleteField();
    if (!payload.approachPeriodEnd) payload.approachPeriodEnd = deleteField();
  }
  const id = String(existingId || rule.id || '').trim();

  if (id) {
    await setDoc(doc(db, COL.VALIDATION_RULES, id), payload, { merge: true });
    return normalizeValidationRuleDoc({ id, ...buildValidationRulePayload(rule) }, id);
  }

  const cleanPayload = buildValidationRulePayload(rule);
  const ref = await addDoc(collection(db, COL.VALIDATION_RULES), cleanPayload);
  return normalizeValidationRuleDoc({ id: ref.id, ...cleanPayload }, ref.id);
}

/** @param {string} id */
export async function deleteValidationRule(id) {
  await deleteDoc(doc(db, COL.VALIDATION_RULES, id));
}
