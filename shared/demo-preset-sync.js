import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase.js';
import { COL } from './schema.js';

export const DEMO_PRESET_RUNTIME_DOC_ID = 'demo_preset_runtime';

/**
 * @param {Record<string, unknown>} data
 * @returns {Promise<void>}
 */
export async function publishDemoPresetRuntimeDoc(data) {
  try {
    const ref = doc(db, COL.SETTINGS, DEMO_PRESET_RUNTIME_DOC_ID);
    await setDoc(ref, data);
  } catch (err) {
    console.warn('[demo-preset] не удалось опубликовать пресет в Firestore', err);
  }
}

/** @returns {Promise<Record<string, unknown> | null>} */
export async function fetchDemoPresetRuntimeDoc() {
  try {
    const ref = doc(db, COL.SETTINGS, DEMO_PRESET_RUNTIME_DOC_ID);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data();
  } catch (err) {
    console.warn('[demo-preset] не удалось загрузить пресет из Firestore', err);
    return null;
  }
}

/**
 * @param {(data: Record<string, unknown> | null) => void} onUpdate
 * @returns {() => void}
 */
export function subscribeDemoPresetRuntimeDoc(onUpdate) {
  const ref = doc(db, COL.SETTINGS, DEMO_PRESET_RUNTIME_DOC_ID);

  return onSnapshot(ref, snap => {
    onUpdate(snap.exists() ? snap.data() : null);
  }, err => {
    console.warn('[demo-preset] ошибка подписки на пресет', err);
  });
}
