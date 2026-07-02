import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import { COL } from '../../shared/schema.js';
import { normalizeSalesChannel, SALES_CHANNEL_IDS } from '../../shared/sales-channels.js';

const SETTINGS_DOC = 'sales_channels';

/** @returns {Promise<import('../../shared/sales-channels.d.ts').SalesChannel|null>} */
export async function fetchPosChannelSettings() {
  const snap = await getDoc(doc(db, COL.SETTINGS, SETTINGS_DOC));
  const channels = snap.exists() ? snap.data()?.channels : [];
  const raw = Array.isArray(channels)
    ? channels.find(c => c.id === SALES_CHANNEL_IDS.POS)
    : null;
  if (!raw) {
    return normalizeSalesChannel({ id: SALES_CHANNEL_IDS.POS }, SALES_CHANNEL_IDS.POS);
  }
  return normalizeSalesChannel(raw, SALES_CHANNEL_IDS.POS);
}
