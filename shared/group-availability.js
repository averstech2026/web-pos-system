import { DAY_LABELS, DAY_VALUES } from './item-availability.js';

export { DAY_LABELS, DAY_VALUES };

/** @returns {import('./group-availability.js').CategoryAvailabilityRule} */
export function createDefaultAvailabilityRule() {
  return {
    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    days: [1, 2, 3, 4, 5, 6, 7],
    timeFrom: '08:00',
    timeTo: '11:00',
    dateRangeEnabled: false,
    dateFrom: null,
    dateTo: null,
  };
}

/**
 * @typedef {object} CategoryAvailabilityRule
 * @property {string} id
 * @property {number[]} days
 * @property {string} timeFrom
 * @property {string} timeTo
 * @property {boolean} dateRangeEnabled
 * @property {string|null} dateFrom
 * @property {string|null} dateTo
 */

/** @param {Partial<CategoryAvailabilityRule>|null|undefined} raw */
export function normalizeAvailabilityRule(raw) {
  const days = Array.isArray(raw?.days)
    ? [...new Set(raw.days.map(Number).filter(d => d >= 1 && d <= 7))].sort((a, b) => a - b)
    : [1, 2, 3, 4, 5, 6, 7];

  return {
    id: String(raw?.id || createDefaultAvailabilityRule().id),
    days: days.length ? days : [1, 2, 3, 4, 5, 6, 7],
    timeFrom: raw?.timeFrom || '08:00',
    timeTo: raw?.timeTo || '11:00',
    dateRangeEnabled: !!raw?.dateRangeEnabled,
    dateFrom: raw?.dateFrom || null,
    dateTo: raw?.dateTo || null,
  };
}

/**
 * @param {object} group
 * @returns {{ restricted: boolean, rules: CategoryAvailabilityRule[] }}
 */
export function normalizeGroupAvailability(group) {
  const hasLegacy = !!(group?.availableFrom && group?.availableTo);
  const restricted = group?.availabilityRestricted === true
    || (group?.availabilityRestricted !== false && hasLegacy && !group?.availabilityRules?.length);

  let rules = Array.isArray(group?.availabilityRules)
    ? group.availabilityRules.map(normalizeAvailabilityRule)
    : [];

  if (restricted && !rules.length && hasLegacy) {
    rules = [normalizeAvailabilityRule({
      id: `legacy-${group.id || 'group'}`,
      days: [1, 2, 3, 4, 5, 6, 7],
      timeFrom: group.availableFrom,
      timeTo: group.availableTo,
    })];
  }

  if (restricted && !rules.length) {
    rules = [createDefaultAvailabilityRule()];
  }

  return { restricted, rules };
}

/** @param {object} group */
export function formatGroupScheduleSummary(group) {
  const { restricted, rules } = normalizeGroupAvailability(group);
  if (!restricted) return 'Весь день';

  if (rules.length === 1) {
    const rule = rules[0];
    const parts = [`${rule.timeFrom}–${rule.timeTo}`];
    if (rule.days.length && rule.days.length < 7) {
      parts.push(rule.days.map(d => DAY_LABELS[d - 1]).join(', '));
    }
    if (rule.dateRangeEnabled && (rule.dateFrom || rule.dateTo)) {
      parts.push('по датам');
    }
    return parts.join(' · ');
  }

  const n = rules.length;
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word = mod10 === 1 && mod100 !== 11
    ? 'правило'
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? 'правила'
      : 'правил';
  return `${n} ${word}`;
}

/**
 * @param {boolean} restricted
 * @param {CategoryAvailabilityRule[]} rules
 */
export function validateGroupAvailability(restricted, rules) {
  if (!restricted) return;

  if (!rules.length) {
    throw new Error('Добавьте хотя бы одно правило доступности');
  }

  for (let i = 0; i < rules.length; i += 1) {
    const rule = normalizeAvailabilityRule(rules[i]);
    if (!rule.days.length) {
      throw new Error(`Правило ${i + 1}: выберите хотя бы один день недели`);
    }
    if (rule.timeFrom && rule.timeTo && rule.timeFrom === rule.timeTo) {
      throw new Error(`Правило ${i + 1}: укажите корректный интервал времени`);
    }
    if (rule.dateRangeEnabled && rule.dateFrom && rule.dateTo && rule.dateFrom > rule.dateTo) {
      throw new Error(`Правило ${i + 1}: дата начала не может быть позже даты окончания`);
    }
  }
}

/**
 * @param {boolean} restricted
 * @param {CategoryAvailabilityRule[]} rules
 */
export function buildCategoryGroupAvailabilityPayload(restricted, rules) {
  if (!restricted) {
    return {
      availabilityRestricted: false,
      availabilityRules: [],
      availableFrom: null,
      availableTo: null,
    };
  }

  const normalized = rules.map(normalizeAvailabilityRule);
  const first = normalized[0];

  return {
    availabilityRestricted: true,
    availabilityRules: normalized,
    availableFrom: first?.timeFrom || null,
    availableTo: first?.timeTo || null,
  };
}
