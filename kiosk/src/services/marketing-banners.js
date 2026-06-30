import { collection, getDocs } from 'firebase/firestore';
import { db } from '@shared/firebase.js';
import { COL } from '@shared/schema.js';
import {
  filterMarketingBannersForUser,
  MARKETING_DEFAULT_LOCATION_ID,
  normalizeMarketingBanner,
} from '@shared/marketing-banners.js';

/** @type {import('@shared/marketing-banners.d.ts').MarketingBanner[]} */
export let KIOSK_MARKETING_BANNERS = [];

/**
 * @param {import('@shared/availability-rules.js').AvailabilityRuleDoc[]} rules
 * @param {{ date: string, time: string }} slot
 */
export async function loadKioskMarketingBanners(rules, slot) {
  const snap = await getDocs(collection(db, COL.MARKETING_BANNERS));
  const all = snap.docs.map(d => normalizeMarketingBanner({ id: d.id, ...d.data() }, d.id));

  KIOSK_MARKETING_BANNERS = filterMarketingBannersForUser(all, {
    device: 'kiosk',
    currentLocationId: MARKETING_DEFAULT_LOCATION_ID,
    allRules: rules,
    slot,
  });
}
