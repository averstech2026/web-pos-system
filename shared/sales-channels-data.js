import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase.js';
import { COL, ORDER_SOURCE } from './schema.js';
import {
  DEFAULT_SALES_CHANNELS,
  normalizeSalesChannel,
} from './sales-channels.js';

const SETTINGS_DOC_ID = 'sales_channels';

/** @returns {Promise<import('./sales-channels.d.ts').SalesChannel[]>} */
export async function fetchSalesChannelsFromSettings() {
  const snap = await getDoc(doc(db, COL.SETTINGS, SETTINGS_DOC_ID));
  const data = snap.exists() ? snap.data() : {};
  const stored = Array.isArray(data.channels) ? data.channels : [];

  const byId = new Map(
    stored.map(raw => [raw.id, normalizeSalesChannel(raw, raw.id)]),
  );

  return DEFAULT_SALES_CHANNELS.map(def => {
    const existing = byId.get(def.id);
    return normalizeSalesChannel(existing || def, def.id);
  });
}

/**
 * @param {string} channelId — ORDER_SOURCE.KIOSK | ORDER_SOURCE.WEB
 * @returns {Promise<import('./sales-channels.d.ts').SalesChannel|null>}
 */
export async function fetchSalesChannelById(channelId) {
  const channels = await fetchSalesChannelsFromSettings();
  return channels.find(ch => ch.id === channelId) || null;
}

/** @returns {Promise<import('./sales-channels.d.ts').SalesChannel|null>} */
export function fetchKioskSalesChannel() {
  return fetchSalesChannelById(ORDER_SOURCE.KIOSK);
}

/** @returns {Promise<import('./sales-channels.d.ts').SalesChannel|null>} */
export function fetchWebSalesChannel() {
  return fetchSalesChannelById(ORDER_SOURCE.WEB);
}
