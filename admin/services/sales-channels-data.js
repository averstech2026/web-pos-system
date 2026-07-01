import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import { COL } from '../../shared/schema.js';
import {
  createDefaultSalesChannels,
  DEFAULT_SALES_CHANNELS,
  normalizeSalesChannel,
  toPersistedSalesChannel,
} from '../../shared/sales-channels.js';

const SETTINGS_DOC_ID = 'sales_channels';

/** @returns {Promise<import('../../shared/sales-channels.d.ts').SalesChannel[]>} */
export async function fetchSalesChannels() {
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

/** @param {import('../../shared/sales-channels.d.ts').SalesChannel[]} channels */
export async function saveSalesChannels(channels) {
  const payload = channels.map(ch => toPersistedSalesChannel(ch, ch.id));
  await setDoc(
    doc(db, COL.SETTINGS, SETTINGS_DOC_ID),
    { channels: payload },
    { merge: true },
  );
  return payload.map(ch => normalizeSalesChannel(ch, ch.id));
}

/** @param {import('../../shared/sales-channels.d.ts').SalesChannel} channel */
export async function saveSalesChannel(channel) {
  const normalized = toPersistedSalesChannel(channel, channel.id);
  const snap = await getDoc(doc(db, COL.SETTINGS, SETTINGS_DOC_ID));
  const stored = Array.isArray(snap.data()?.channels) ? snap.data().channels : [];

  const byId = new Map(stored.map(raw => [raw.id, raw]));
  byId.set(normalized.id, normalized);

  const payload = DEFAULT_SALES_CHANNELS.map(def => (
    toPersistedSalesChannel(byId.get(def.id) || def, def.id)
  ));

  await setDoc(
    doc(db, COL.SETTINGS, SETTINGS_DOC_ID),
    { channels: payload },
    { merge: true },
  );

  return normalizeSalesChannel(normalized, normalized.id);
}

export async function ensureDefaultSalesChannels() {
  const ref = doc(db, COL.SETTINGS, SETTINGS_DOC_ID);
  const snap = await getDoc(ref);
  const stored = snap.exists() && Array.isArray(snap.data().channels) ? snap.data().channels : [];
  const byId = new Map(stored.map(raw => [raw.id, raw]));

  let changed = !stored.length;
  for (const def of DEFAULT_SALES_CHANNELS) {
    if (!byId.has(def.id)) {
      byId.set(def.id, toPersistedSalesChannel(
        createDefaultSalesChannels().find(ch => ch.id === def.id) || def,
        def.id,
      ));
      changed = true;
    }
  }

  if (changed) {
    const payload = DEFAULT_SALES_CHANNELS.map(def => (
      toPersistedSalesChannel(byId.get(def.id) || def, def.id)
    ));
    await setDoc(ref, { channels: payload }, { merge: true });
  }
}
