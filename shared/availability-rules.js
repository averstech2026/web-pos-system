/**
 * Centralized availability rules (collection: availability_rules).
 * Day indices: Вс=0, Пн=1 … Сб=6 (matches JS Date.getDay()).
 */

/** @typedef {'allow'|'deny'} AvailabilityConditionType */

/**
 * @typedef {object} AvailabilityCondition
 * @property {AvailabilityConditionType} type
 * @property {boolean} [isActive] - default true; false = paused, ignored by kiosk
 * @property {number[]} days - empty = all days (when date range is set)
 * @property {string|null} timeStart - HH:MM
 * @property {string|null} timeEnd - HH:MM
 * @property {string|null} dateStart - YYYY-MM-DD
 * @property {string|null} dateEnd - YYYY-MM-DD
 */

/**
 * @typedef {object} AvailabilityRuleDoc
 * @property {string} id
 * @property {string} name
 * @property {'active'|'archived'} [status]
 * @property {AvailabilityCondition[]} conditions
 */

export const AVAIL_DAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
export const AVAIL_DAY_VALUES = [0, 1, 2, 3, 4, 5, 6];
/** UI order: Mon–Sun */
export const AVAIL_DAY_UI_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const CONDITION_TYPE_OPTIONS = [
  {
    id: 'allow',
    label: 'Доступно только в указанное время',
    hint: 'Товар, группа или акция видны в меню только в выбранные дни и часы. Вне этого окна — скрыты.',
  },
  {
    id: 'deny',
    label: 'Скрыть в указанное время',
    hint: 'Исключение: скрывает объект в выбранные интервалы. Часто добавляют к условию «Доступно только…» — например, обеденный перерыв.',
  },
];

/** @param {'allow'|'deny'} type */
export function getConditionTypeHint(type) {
  return CONDITION_TYPE_OPTIONS.find(o => o.id === type)?.hint || '';
}

/** @returns {AvailabilityCondition} */
export function createDefaultCondition(type = 'allow') {
  return {
    type,
    isActive: true,
    days: type === 'allow' ? [1, 2, 3, 4, 5] : [],
    timeStart: type === 'allow' ? '08:00' : null,
    timeEnd: type === 'allow' ? '10:00' : null,
    dateStart: null,
    dateEnd: null,
  };
}

/** @returns {AvailabilityRuleDoc} */
export function createDefaultAvailabilityRuleDoc(id = '') {
  return {
    id: id || `rule-${Date.now()}`,
    name: 'Новое расписание',
    status: 'active',
    conditions: [createDefaultCondition('allow')],
  };
}

/** @param {Partial<AvailabilityRuleDoc>|null|undefined} rule */
export function isRuleArchived(rule) {
  return rule?.status === 'archived';
}

/** @param {Partial<AvailabilityRuleDoc>[]} rules */
export function filterActiveRules(rules) {
  return (rules || []).filter(r => !isRuleArchived(r));
}

/** @param {Partial<AvailabilityCondition>|null|undefined} raw */
export function normalizeCondition(raw) {
  const type = raw?.type === 'deny' ? 'deny' : 'allow';
  const days = Array.isArray(raw?.days)
    ? [...new Set(raw.days.map(Number).filter(d => d >= 0 && d <= 6))].sort((a, b) => a - b)
    : [];

  const hasDateRange = !!(raw?.dateStart || raw?.dateEnd);

  return {
    type,
    isActive: raw?.isActive !== false,
    days: type === 'allow' && !days.length && !hasDateRange ? [1, 2, 3, 4, 5, 6, 0] : days,
    timeStart: raw?.timeStart || null,
    timeEnd: raw?.timeEnd || null,
    dateStart: raw?.dateStart || null,
    dateEnd: raw?.dateEnd || null,
  };
}

/** @param {Partial<AvailabilityRuleDoc>|null|undefined} raw @param {string} [docId] */
export function normalizeAvailabilityRuleDoc(raw, docId = '') {
  const id = String(raw?.id || docId || '').trim();
  const conditions = Array.isArray(raw?.conditions)
    ? raw.conditions.map(normalizeCondition)
    : [];

  return {
    id,
    name: String(raw?.name || '').trim() || 'Без названия',
    status: raw?.status === 'archived' ? 'archived' : 'active',
    conditions,
  };
}

/** @param {Partial<AvailabilityCondition>[]} conditions */
function activeConditions(conditions) {
  return (conditions || [])
    .map(normalizeCondition)
    .filter(c => c.isActive !== false);
}

/** @param {string} dateStr YYYY-MM-DD */
export function weekdayFromDate(dateStr) {
  return new Date(`${dateStr}T12:00:00`).getDay();
}

/** @param {string|null|undefined} time HH:MM */
function timeToMinutes(time) {
  if (!time) return null;
  const [h, m] = String(time).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** @param {string} timeStr @param {string|null} from @param {string|null} to */
function isTimeInWindow(timeStr, from, to) {
  const current = timeToMinutes(timeStr);
  const start = timeToMinutes(from);
  const end = timeToMinutes(to);
  if (start == null || end == null || current == null) return true;

  if (start <= end) return current >= start && current <= end;
  return current >= start || current <= end;
}

/** @param {ReturnType<typeof normalizeCondition>} cond @param {string} dateStr @param {string} timeStr */
function conditionMatches(cond, dateStr, timeStr) {
  const hasDateRange = cond.dateStart || cond.dateEnd;
  if (hasDateRange) {
    if (cond.dateStart && dateStr < cond.dateStart) return false;
    if (cond.dateEnd && dateStr > cond.dateEnd) return false;
  }

  if (cond.days.length > 0) {
    const weekday = weekdayFromDate(dateStr);
    if (!cond.days.includes(weekday)) return false;
  }

  if (cond.timeStart && cond.timeEnd) {
    if (!isTimeInWindow(timeStr, cond.timeStart, cond.timeEnd)) return false;
  }

  return true;
}

/** @returns {{ date: string, time: string }} */
function getClientSlot() {
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

/** @param {{ date?: string, time?: string }} [slot] */
function resolveSlot(slot) {
  if (slot?.date && slot?.time) return { date: slot.date, time: slot.time };
  return getClientSlot();
}

/**
 * Resolves effective rule ID with item override over group inheritance.
 *
 * @param {string|null|undefined} itemRuleId
 * @param {string|null|undefined} groupRuleId
 */
export function resolveEffectiveRuleId(itemRuleId, groupRuleId) {
  return itemRuleId || groupRuleId || null;
}

/**
 * @param {import('./menu-catalog.js').CategoryGroup[]|Array<{ name: string, availabilityRuleId?: string|null }>} groups
 */
export function buildGroupsByName(groups) {
  return new Map((groups || []).map(g => [g.name, g]));
}

/**
 * @param {{ availabilityRuleId?: string|null, category?: string }} item
 * @param {Map<string, { availabilityRuleId?: string|null }>} groupsByName
 */
export function getEffectiveRuleIdForItem(item, groupsByName) {
  const group = item?.category ? groupsByName.get(item.category) : null;
  return resolveEffectiveRuleId(item?.availabilityRuleId, group?.availabilityRuleId);
}

/**
 * @param {{ availabilityRuleId?: string|null, category?: string }} item
 * @param {Map<string, { availabilityRuleId?: string|null }>} groupsByName
 * @param {'all'|'none'|string} scheduleFilter
 */
export function matchesScheduleFilter(item, groupsByName, scheduleFilter) {
  if (scheduleFilter === 'all') return true;
  const effective = getEffectiveRuleIdForItem(item, groupsByName);
  if (scheduleFilter === 'none') return !effective;
  return effective === scheduleFilter;
}

/**
 * Direct assignments of a schedule rule (groups + items with explicit availabilityRuleId).
 *
 * @param {string} ruleId
 * @param {Array<{ id?: string, name: string, availabilityRuleId?: string|null }>} groups
 * @param {Array<{ id: string, name?: string, availabilityRuleId?: string|null }>} items
 */
export function getRuleDirectUsage(ruleId, groups = [], items = []) {
  if (!ruleId) return { groups: [], items: [] };
  return {
    groups: groups.filter(g => g.availabilityRuleId === ruleId),
    items: items.filter(i => i.availabilityRuleId === ruleId),
  };
}

/**
 * Whether a rule is linked to any group or item (direct or via inheritance).
 *
 * @param {string} ruleId
 * @param {Array<{ name: string, availabilityRuleId?: string|null }>} groups
 * @param {Array<{ category?: string, availabilityRuleId?: string|null }>} items
 */
export function isRuleInUse(ruleId, groups = [], items = []) {
  if (!ruleId) return false;

  const { groups: linkedGroups, items: linkedItems } = getRuleDirectUsage(ruleId, groups, items);
  if (linkedGroups.length || linkedItems.length) return true;

  const groupsByName = buildGroupsByName(groups);
  return items.some(item => getEffectiveRuleIdForItem(item, groupsByName) === ruleId);
}

/**
 * @param {Partial<AvailabilityRuleDoc>[]} allRules
 * @param {string} ruleId
 * @returns {Partial<AvailabilityRuleDoc>|null}
 */
function findRuleById(allRules, ruleId) {
  if (!Array.isArray(allRules) || !ruleId) return null;
  return allRules.find(r => r?.id === ruleId) || null;
}

/**
 * Evaluates deny/allow conditions for a rule document at a given moment.
 *
 * @param {Partial<AvailabilityRuleDoc>|null|undefined} rule
 * @param {string} dateStr YYYY-MM-DD
 * @param {string} timeStr HH:MM
 */
function evaluateRuleAt(rule, dateStr, timeStr) {
  if (!rule?.conditions?.length) return true;

  const conditions = activeConditions(rule.conditions);
  if (!conditions.length) return true;

  for (const cond of conditions) {
    if (cond.type === 'deny' && conditionMatches(cond, dateStr, timeStr)) {
      return false;
    }
  }

  const allows = conditions.filter(c => c.type === 'allow');
  if (allows.length === 0) return true;

  return allows.some(cond => conditionMatches(cond, dateStr, timeStr));
}

/**
 * Kiosk availability check with item/group rule inheritance.
 *
 * Item rule overrides group rule: `activeRuleId = itemRuleId || groupRuleId`.
 * If both are null — always available.
 *
 * @param {string|null|undefined} itemRuleId
 * @param {string|null|undefined} groupRuleId
 * @param {Partial<AvailabilityRuleDoc>[]} allRules
 * @param {{ date?: string, time?: string }} [slot]
 */
export function isItemAvailable(itemRuleId, groupRuleId, allRules, slot) {
  const activeRuleId = resolveEffectiveRuleId(itemRuleId, groupRuleId);
  if (!activeRuleId) return true;

  const rule = findRuleById(allRules, activeRuleId);
  if (!rule || isRuleArchived(rule)) return true;

  const { date, time } = resolveSlot(slot);
  return evaluateRuleAt(rule, date, time);
}

/**
 * Checks whether a slot matches an availability rule document.
 * Empty/null rule → always available.
 *
 * @param {Partial<AvailabilityRuleDoc>|null|undefined} rule
 * @param {{ date?: string, time?: string }} [slot]
 */
export function isAvailableByRule(rule, slot = {}) {
  if (!rule?.conditions?.length) return true;
  const { date, time } = resolveSlot(slot);
  return evaluateRuleAt(rule, date, time);
}

/**
 * Resolves entity availability: isAvailable flag + optional availabilityRuleId.
 *
 * @param {{ isAvailable?: boolean, availabilityRuleId?: string|null }} entity
 * @param {Partial<AvailabilityRuleDoc>[]|Map<string, AvailabilityRuleDoc>|Record<string, AvailabilityRuleDoc>} [rulesSource]
 * @param {{ date?: string, time?: string }} [slot]
 */
export function isEntityAvailableAt(entity, rulesSource = [], slot = {}, groupRuleId = null) {
  if (entity?.isAvailable === false) return false;

  const allRules = rulesSource instanceof Map
    ? [...rulesSource.values()]
    : Array.isArray(rulesSource)
      ? rulesSource
      : Object.values(rulesSource);

  return isItemAvailable(entity?.availabilityRuleId, groupRuleId, allRules, slot);
}

/** @param {number[]} days */
function formatDaysRange(days) {
  if (!days.length || days.length === 7) return 'все дни';
  const sorted = [...days].sort((a, b) => {
    const ai = a === 0 ? 7 : a;
    const bi = b === 0 ? 7 : b;
    return ai - bi;
  });
  return sorted.map(d => AVAIL_DAY_LABELS[d]).join(', ');
}

/** @param {string|null} iso */
function fmtShortDate(iso) {
  if (!iso) return '…';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y?.slice(2) || ''}`;
}

/** @param {ReturnType<typeof normalizeCondition>} cond */
function formatConditionLine(cond) {
  const parts = [];
  const prefix = cond.type === 'deny' ? 'Скрыто' : 'Доступно';

  if (cond.timeStart && cond.timeEnd) {
    parts.push(`${formatDaysRange(cond.days)} с ${cond.timeStart} до ${cond.timeEnd}`);
  } else if (cond.days.length && cond.days.length < 7) {
    parts.push(formatDaysRange(cond.days));
  }

  if (cond.dateStart || cond.dateEnd) {
    parts.push(`${fmtShortDate(cond.dateStart)} – ${fmtShortDate(cond.dateEnd)}`);
  }

  if (!parts.length) {
    return `${prefix}: всегда`;
  }

  return `${prefix}: ${parts.join('; ')}`;
}

/** @param {Partial<AvailabilityRuleDoc>|null|undefined} rule */
export function formatAvailabilityRuleSummary(rule) {
  if (!rule?.conditions?.length) return '';
  return activeConditions(rule.conditions)
    .map(c => formatConditionLine(c))
    .join('; ');
}

/** @param {Partial<AvailabilityRuleDoc>|null|undefined} rule */
export function formatAvailabilityRuleShort(rule) {
  const summary = formatAvailabilityRuleSummary(rule);
  if (!summary) return 'По расписанию';
  return summary.length > 80 ? `${summary.slice(0, 77)}…` : summary;
}

/**
 * @param {Partial<AvailabilityRuleDoc>} rule
 */
export function validateAvailabilityRuleDoc(rule) {
  const normalized = normalizeAvailabilityRuleDoc(rule, rule.id);
  if (!normalized.name.trim()) {
    throw new Error('Укажите название шаблона');
  }
  if (!normalized.conditions.length) {
    throw new Error('Добавьте хотя бы одно условие');
  }

  for (let i = 0; i < normalized.conditions.length; i += 1) {
    const cond = normalized.conditions[i];
    if (cond.isActive === false) continue;
    const n = i + 1;

    if (cond.type === 'allow' && !cond.days.length && !(cond.dateStart || cond.dateEnd)) {
      throw new Error(`Условие ${n}: выберите дни недели или укажите период дат`);
    }

    if (cond.timeStart && cond.timeEnd && cond.timeStart === cond.timeEnd) {
      throw new Error(`Условие ${n}: укажите корректный интервал времени`);
    }

    if ((cond.dateStart || cond.dateEnd) && cond.dateStart && cond.dateEnd && cond.dateStart > cond.dateEnd) {
      throw new Error(`Условие ${n}: дата начала не может быть позже даты окончания`);
    }
  }

  return normalized;
}

/**
 * Checks menu item availability considering both item and category group rules.
 *
 * @param {{ isAvailable?: boolean, availabilityRuleId?: string|null, category?: string }} item
 * @param {Map<string, { availabilityRuleId?: string|null }>} [groupsByName]
 * @param {Partial<AvailabilityRuleDoc>[]} [allRules]
 * @param {{ date?: string, time?: string }} [slot]
 */
export function isMenuItemAvailableAt(item, groupsByName = new Map(), allRules = [], slot = {}) {
  if (item?.isAvailable === false) return false;
  const group = item?.category ? groupsByName.get(item.category) : null;
  return isItemAvailable(
    item?.availabilityRuleId,
    group?.availabilityRuleId,
    allRules,
    slot,
  );
}

/** @param {AvailabilityRuleDoc[]} rules */
export function rulesToMap(rules) {
  return new Map(rules.map(r => [r.id, r]));
}

/** @param {Partial<AvailabilityRuleDoc>} rule */
export function buildAvailabilityRulePayload(rule) {
  const normalized = validateAvailabilityRuleDoc(rule);
  return {
    name: normalized.name,
    status: normalized.status === 'archived' ? 'archived' : 'active',
    conditions: normalized.conditions.map(c => ({
      type: c.type,
      isActive: c.isActive !== false,
      days: c.days,
      timeStart: c.timeStart,
      timeEnd: c.timeEnd,
      dateStart: c.dateStart,
      dateEnd: c.dateEnd,
    })),
  };
}
