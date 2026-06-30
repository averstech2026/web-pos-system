import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import { COL } from '../../shared/schema.js';
import { normalizeMarketingBanner } from '../../shared/marketing-banners.js';

/** @returns {Promise<import('../../shared/marketing-banners.d.ts').MarketingBanner[]>} */
export async function fetchMarketingBannersForLk() {
  const snap = await getDocs(collection(db, COL.MARKETING_BANNERS));
  return snap.docs
    .map(d => normalizeMarketingBanner({ id: d.id, ...d.data() }, d.id))
    .filter(b => b.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'ru'));
}
