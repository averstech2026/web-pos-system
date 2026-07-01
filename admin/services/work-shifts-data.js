import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import { COL } from '../../shared/schema.js';
import {
  createWorkShiftDoc,
  normalizeWorkShift,
} from '../../shared/work-shifts.js';
import { migrateWorkShifts } from '../../shared/work-shifts-migration.js';

/** @returns {Promise<Array<object>>} */
export async function fetchWorkShifts() {
  const snap = await getDocs(collection(db, COL.WORK_SHIFTS));
  return snap.docs
    .map(d => normalizeWorkShift({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
}

/** @param {object} data */
export async function saveWorkShift(data) {
  const id = data.id || doc(collection(db, COL.WORK_SHIFTS)).id;
  const payload = createWorkShiftDoc({ ...normalizeWorkShift({ ...data, id }), id });
  await setDoc(doc(db, COL.WORK_SHIFTS, id), {
    ...payload,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return payload;
}

/** @param {string} id */
export async function deleteWorkShift(id) {
  await deleteDoc(doc(db, COL.WORK_SHIFTS, id));
}

/** Ensures default shift exists and backfills shiftId for users without one. */
export async function ensureWorkShiftsMigration() {
  return migrateWorkShifts({
    getDoc: async (path) => {
      const snap = await getDoc(doc(db, ...path.split('/')));
      return {
        exists: () => snap.exists(),
        data: () => snap.data() || {},
      };
    },
    setDoc: async (path, data, opts) => {
      await setDoc(doc(db, ...path.split('/')), data, opts || {});
    },
    listUsers: async () => {
      const snap = await getDocs(collection(db, COL.USERS));
      return snap.docs.map(d => ({ id: d.id, data: () => d.data() }));
    },
  });
}
