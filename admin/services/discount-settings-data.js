import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import { COL } from '../../shared/schema.js';
import {
  buildDiscountSettingsPayload,
  createDefaultDiscountSettings,
  normalizeDiscountSettings,
} from '../../shared/discount-settings.js';

const DISCOUNT_SETTINGS_ID = 'discount_settings';

/** @returns {Promise<import('../../shared/discount-settings.js').DiscountSettingsDoc>} */
export async function fetchDiscountSettings() {
  const snap = await getDoc(doc(db, COL.SETTINGS, DISCOUNT_SETTINGS_ID));
  if (!snap.exists()) return createDefaultDiscountSettings();
  return normalizeDiscountSettings(snap.data());
}

/** @param {Partial<import('../../shared/discount-settings.js').DiscountSettingsDoc>} settings */
export async function saveDiscountSettings(settings) {
  const payload = buildDiscountSettingsPayload(settings);
  await setDoc(doc(db, COL.SETTINGS, DISCOUNT_SETTINGS_ID), payload, { merge: true });
  return normalizeDiscountSettings(payload);
}
