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
  buildMarketingBannerPayload,
  normalizeMarketingBanner,
} from '../../shared/marketing-banners.js';

/** @returns {Promise<import('../../shared/marketing-banners.d.ts').MarketingBanner[]>} */
export async function fetchAllMarketingBanners() {
  const snap = await getDocs(collection(db, COL.MARKETING_BANNERS));
  return snap.docs
    .map(d => normalizeMarketingBanner({ id: d.id, ...d.data() }, d.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'ru'));
}

/** @returns {Promise<import('../../shared/marketing-banners.d.ts').MarketingBanner[]>} */
export async function fetchActiveMarketingBanners() {
  const all = await fetchAllMarketingBanners();
  return all.filter(b => b.isActive);
}

/**
 * @param {Partial<import('../../shared/marketing-banners.d.ts').MarketingBanner>} banner
 * @param {string} [existingId]
 */
export async function saveMarketingBanner(banner, existingId = '') {
  const payload = buildMarketingBannerPayload(banner);
  const id = String(existingId || banner.id || '').trim();

  if (id) {
    await setDoc(doc(db, COL.MARKETING_BANNERS, id), payload, { merge: true });
    return normalizeMarketingBanner({ id, ...payload }, id);
  }

  const ref = await addDoc(collection(db, COL.MARKETING_BANNERS), payload);
  return normalizeMarketingBanner({ id: ref.id, ...payload }, ref.id);
}

/** @param {string} id */
export async function deleteMarketingBanner(id) {
  await deleteDoc(doc(db, COL.MARKETING_BANNERS, id));
}
