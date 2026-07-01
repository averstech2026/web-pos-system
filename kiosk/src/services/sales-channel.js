import { collection, getDocs } from 'firebase/firestore';
import { db } from '@shared/firebase.js';
import { COL } from '@shared/schema.js';
import { fetchKioskSalesChannel } from '@shared/sales-channels-data.js';
import {
  currentAvailabilitySlot,
  shouldShowSalesChannelMaintenance,
} from '@shared/sales-channel-availability.js';
import { mountSalesChannelMaintenance } from '@shared/sales-channel-maintenance.js';
import {
  filterActiveRules,
  normalizeAvailabilityRuleDoc,
} from '@shared/availability-rules.js';

/**
 * Kiosk entry gate:
 * if (!isSalesChannelActive(channel) || !isWithinSchedule(channel, rules, slot))
 *   → fullscreen maintenance instead of the menu shell.
 *
 * @param {HTMLElement} container
 * @returns {Promise<boolean>} true when maintenance screen is shown
 */
export async function renderKioskMaintenanceIfNeeded(container) {
  const [channel, rulesSnap] = await Promise.all([
    fetchKioskSalesChannel(),
    getDocs(collection(db, COL.AVAILABILITY_RULES)),
  ]);

  if (!channel) return false;

  const rules = filterActiveRules(
    rulesSnap.docs.map(d => normalizeAvailabilityRuleDoc({ id: d.id, ...d.data() }, d.id)),
  );

  if (!shouldShowSalesChannelMaintenance(channel, rules, currentAvailabilitySlot())) {
    return false;
  }

  mountSalesChannelMaintenance(container, { channel, variant: 'tailwind' });
  return true;
}
