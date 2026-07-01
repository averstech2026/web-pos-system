/**
 * Sales channel availability middleware (Kiosk / Web).
 *
 * Frontends should gate the main UI:
 *   if (shouldShowSalesChannelMaintenance(channel, rules, slot)) {
 *     render maintenance fullscreen instead of the app shell;
 *   }
 *
 * Equivalent condition:
 *   if (!isSalesChannelActive(channel) || !isWithinSchedule(channel, rules, slot)) { ... }
 */

import { isAvailableByRule, rulesToMap } from './availability-rules.js';
import {
  DEFAULT_MAINTENANCE_MESSAGE,
  DEFAULT_MAINTENANCE_TITLE_OFFLINE,
  DEFAULT_MAINTENANCE_TITLE_SCHEDULE,
  resolveMaintenanceMessage,
  SALES_CHANNEL_STATUS,
} from './sales-channels.js';

/** @param {{ status?: string }} channel */
export function isSalesChannelActive(channel) {
  return channel?.status === SALES_CHANNEL_STATUS.ACTIVE;
}

/**
 * @param {Partial<import('./availability-rules.js').AvailabilityRuleDoc>[]|Map<string, import('./availability-rules.js').AvailabilityRuleDoc>} rulesSource
 * @param {string|null|undefined} scheduleId
 */
export function resolveChannelScheduleRule(rulesSource, scheduleId) {
  if (!scheduleId) return null;
  const map = rulesSource instanceof Map
    ? rulesSource
    : rulesToMap(Array.isArray(rulesSource) ? rulesSource : Object.values(rulesSource || {}));
  return map.get(scheduleId) || null;
}

/**
 * @param {{ scheduleId?: string|null }} channel
 * @param {Partial<import('./availability-rules.js').AvailabilityRuleDoc>[]|Map<string, import('./availability-rules.js').AvailabilityRuleDoc>} rulesSource
 * @param {{ date?: string, time?: string }} [slot]
 */
export function isWithinSchedule(channel, rulesSource, slot = {}) {
  if (!channel?.scheduleId) return true;
  const rule = resolveChannelScheduleRule(rulesSource, channel.scheduleId);
  if (!rule) return true;
  return isAvailableByRule(rule, slot);
}

/**
 * @param {{ status?: string, scheduleId?: string|null, maintenanceMessage?: string }} channel
 * @param {Partial<import('./availability-rules.js').AvailabilityRuleDoc>[]|Map<string, import('./availability-rules.js').AvailabilityRuleDoc>} rulesSource
 * @param {{ date?: string, time?: string }} [slot]
 */
export function shouldShowSalesChannelMaintenance(channel, rulesSource, slot = {}) {
  if (!isSalesChannelActive(channel)) return true;
  return !isWithinSchedule(channel, rulesSource, slot);
}

/** @param {{ status?: string, maintenanceMessage?: string }} channel */
export function resolveMaintenanceTitle(channel) {
  if (!isSalesChannelActive(channel)) return DEFAULT_MAINTENANCE_TITLE_OFFLINE;
  return DEFAULT_MAINTENANCE_TITLE_SCHEDULE;
}

export { resolveMaintenanceMessage };

/** @returns {{ date: string, time: string }} */
export function currentAvailabilitySlot(date = new Date()) {
  return {
    date: date.toISOString().slice(0, 10),
    time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
  };
}
