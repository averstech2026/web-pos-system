import { isAvailableByRule } from '../../shared/availability-rules.js';

/**
 * @typedef {object} ScheduleStatus
 * @property {string} text
 * @property {string} className
 * @property {boolean} [isExpired]
 */

/** @param {{ date?: string, time?: string }} [slot] */
function resolveSlot(slot) {
  if (slot?.date && slot?.time) return { date: slot.date, time: slot.time };
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  const time = [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join(':');
  return { date, time };
}

/** @param {import('../../shared/availability-rules.js').AvailabilityRuleDoc|null|undefined} rule */
function getAllowDateBounds(rule) {
  /** @type {string|null} */
  let dateStart = null;
  /** @type {string|null} */
  let dateEnd = null;

  for (const raw of rule?.conditions || []) {
    if (raw?.type === 'deny' || raw?.isActive === false) continue;
    const cond = raw;
    if (cond.dateStart && (!dateStart || cond.dateStart < dateStart)) {
      dateStart = cond.dateStart;
    }
    if (cond.dateEnd && (!dateEnd || cond.dateEnd > dateEnd)) {
      dateEnd = cond.dateEnd;
    }
  }

  return { dateStart, dateEnd };
}

const STATUS = {
  always: { text: 'Всегда', className: 'admin-schedule-status--always' },
  pending: { text: 'Ожидает старта', className: 'admin-schedule-status--pending' },
  expired: { text: 'Завершено', className: 'admin-schedule-status--expired', isExpired: true },
  break: { text: 'Перерыв', className: 'admin-schedule-status--break' },
  active: { text: 'Активно', className: 'admin-schedule-status--active' },
};

/**
 * Unified schedule status for admin list cards (groups, banners, promos).
 *
 * @param {object} input
 * @param {string|null|undefined} input.ruleId
 * @param {import('../../shared/availability-rules.js').AvailabilityRuleDoc|null|undefined} [input.rule]
 * @param {string|null|undefined} [input.campaignDateStart]
 * @param {string|null|undefined} [input.campaignDateEnd]
 * @param {{ date?: string, time?: string }} [input.slot]
 * @returns {ScheduleStatus}
 */
export function getScheduleStatus({
  ruleId = null,
  rule = null,
  campaignDateStart = null,
  campaignDateEnd = null,
  slot,
} = {}) {
  const hasRule = !!(ruleId && String(ruleId).trim());
  const hasCampaignDates = !!(campaignDateStart || campaignDateEnd);

  if (!hasRule && !hasCampaignDates) {
    return { ...STATUS.always };
  }

  const { date, time } = resolveSlot(slot);
  const ruleBounds = getAllowDateBounds(rule);
  const startDate = campaignDateStart || ruleBounds.dateStart || null;
  const endDate = campaignDateEnd || ruleBounds.dateEnd || null;

  if (startDate && date < startDate) {
    return { ...STATUS.pending };
  }

  if (endDate && date > endDate) {
    return { ...STATUS.expired };
  }

  if (hasRule && rule) {
    if (!isAvailableByRule(rule, { date, time })) {
      return { ...STATUS.break };
    }
  }

  return { ...STATUS.active };
}

/** @param {{ availabilityRuleId?: string|null }} group @param {import('../../shared/availability-rules.js').AvailabilityRuleDoc|null|undefined} [rule] @param {{ date?: string, time?: string }} [slot] */
export function scheduleStatusForGroup(group, rule = null, slot) {
  return getScheduleStatus({
    ruleId: group?.availabilityRuleId,
    rule,
    slot,
  });
}

/** @param {{ availabilityRuleId?: string|null }} promo @param {import('../../shared/availability-rules.js').AvailabilityRuleDoc|null|undefined} [rule] @param {{ date?: string, time?: string }} [slot] */
export function scheduleStatusForPromo(promo, rule = null, slot) {
  return getScheduleStatus({
    ruleId: promo?.availabilityRuleId,
    rule,
    slot,
  });
}

/** @param {{ scheduleId?: string|null, campaignDateStart?: string|null, campaignDateEnd?: string|null }} banner @param {import('../../shared/availability-rules.js').AvailabilityRuleDoc|null|undefined} [rule] @param {{ date?: string, time?: string }} [slot] */
export function scheduleStatusForBanner(banner, rule = null, slot) {
  return getScheduleStatus({
    ruleId: banner?.scheduleId,
    rule,
    campaignDateStart: banner?.campaignDateStart,
    campaignDateEnd: banner?.campaignDateEnd,
    slot,
  });
}

/** @param {ScheduleStatus} status */
export function renderScheduleStatusHtml(status) {
  return `<span class="admin-schedule-status ${esc(status.className)}">${esc(status.text)}</span>`;
}

/**
 * @param {string} mainText meta fragment before schedule label (without trailing dot)
 * @param {ScheduleStatus} status
 */
export function renderListMetaWithSchedule(mainText, status) {
  const main = String(mainText || '').trim();
  if (!main) return renderScheduleStatusHtml(status);
  return `${esc(main)} · ${renderScheduleStatusHtml(status)}`;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
