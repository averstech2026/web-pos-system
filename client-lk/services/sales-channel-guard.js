import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import { COL } from '../../shared/schema.js';
import { fetchWebSalesChannel } from '../../shared/sales-channels-data.js';
import {
  currentAvailabilitySlot,
  shouldShowSalesChannelMaintenance,
} from '../../shared/sales-channel-availability.js';
import { mountSalesChannelMaintenance } from '../../shared/sales-channel-maintenance.js';
import {
  filterActiveRules,
  normalizeAvailabilityRuleDoc,
} from '../../shared/availability-rules.js';

let cachedContext = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

/**
 * Web LK entry gate:
 * if (!isSalesChannelActive(channel) || !isWithinSchedule(channel, rules, slot))
 *   → fullscreen maintenance instead of the app shell.
 */
export async function loadWebChannelAccessContext(force = false) {
  if (!force && cachedContext && Date.now() - cachedAt < CACHE_MS) {
    return cachedContext;
  }

  const [channel, rulesSnap] = await Promise.all([
    fetchWebSalesChannel(),
    getDocs(collection(db, COL.AVAILABILITY_RULES)),
  ]);

  const rules = filterActiveRules(
    rulesSnap.docs.map(d => normalizeAvailabilityRuleDoc({ id: d.id, ...d.data() }, d.id)),
  );

  cachedContext = { channel, rules };
  cachedAt = Date.now();
  return cachedContext;
}

/** @param {HTMLElement} app */
export async function renderWebChannelMaintenanceIfNeeded(app) {
  const { channel, rules } = await loadWebChannelAccessContext();
  if (!channel) return false;

  if (!shouldShowSalesChannelMaintenance(channel, rules, currentAvailabilitySlot())) {
    return false;
  }

  mountSalesChannelMaintenance(app, { channel, variant: 'lk' });
  return true;
}
