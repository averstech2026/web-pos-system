import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
  deleteField,
} from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import { COL } from '../../shared/schema.js';
import {
  buildCompositeLunchFirestorePayload,
  isCompositeItem,
  normalizeCatalogItem,
  normalizeCompositeLunch,
} from '../../shared/composite-meals.js';

/** @returns {Promise<import('../../shared/composite-meals.js').CompositeLunchItem[]>} */
export async function fetchLunches() {
  const snap = await getDocs(collection(db, COL.ITEMS));
  return snap.docs
    .filter(d => isCompositeItem(d.data()))
    .map(d => normalizeCompositeLunch({ id: d.id, ...d.data() }))
    .filter(l => l.id && l.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/** Блюда для наполнения шагов — только обычные (несоставные) товары. */
export async function fetchPickerCatalogItems() {
  const snap = await getDocs(collection(db, COL.ITEMS));
  return snap.docs
    .map(d => normalizeCatalogItem({ id: d.id, ...d.data() }))
    .filter(i => !isCompositeItem(i) && i.isArchived !== true)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
}

/** @param {import('../../shared/composite-meals.js').CompositeLunchItem} lunch @param {string} [existingId] @param {Array<{ id: string, allergens?: string[] }>} [catalogItems] */
export async function saveLunch(lunch, existingId = '', catalogItems = null) {
  const id = String(existingId || lunch.id || '').trim();
  const catalog = catalogItems || await fetchPickerCatalogItems();
  const payload = buildCompositeLunchFirestorePayload(lunch, catalog);
  const isUpdate = id && !id.startsWith('draft_');

  if (isUpdate) {
    const update = { ...payload };
    if (!lunch.availabilityRuleId) update.availabilityRuleId = deleteField();
    if (!lunch.allowedPaymentMethods?.length) update.allowedPaymentMethods = deleteField();
    if (!lunch.modifierGroupIds?.length) update.modifierGroupIds = deleteField();
    if (!payload.allergens?.length) update.allergens = deleteField();
    await updateDoc(doc(db, COL.ITEMS, id), update);
    return { id, ...normalizeCompositeLunch({ id, ...payload }) };
  }

  const createPayload = { ...payload };
  if (!createPayload.availabilityRuleId) delete createPayload.availabilityRuleId;
  if (!createPayload.allowedPaymentMethods?.length) delete createPayload.allowedPaymentMethods;

  const ref = await addDoc(collection(db, COL.ITEMS), createPayload);
  return { id: ref.id, ...normalizeCompositeLunch({ id: ref.id, ...createPayload }) };
}

/** @param {string} id */
export async function deleteLunch(id) {
  await deleteDoc(doc(db, COL.ITEMS, id));
}
