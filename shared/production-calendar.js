/**
 * Production calendar — global day-type registry for POS modules.
 *
 * Day types:
 * - workday   — regular or transferred working day
 * - weekend   — Saturday / Sunday (non-working)
 * - holiday   — official public holiday or company day off on a weekday
 * - preholiday — shortened pre-holiday working day
 *
 * ── Integration guide for other modules ─────────────────────────────────────
 *
 * 1. Prefetch the year once (admin / kiosk bootstrap):
 *
 *    import { prefetchProductionCalendar, checkDayStatus } from '../shared/production-calendar.js';
 *    await prefetchProductionCalendar(2026);
 *
 * 2. Products / Marketing promos — hide "weekdays only" items on non-working days:
 *
 *    import { checkDayStatus, DAY_TYPES } from '../shared/production-calendar.js';
 *
 *    const today = new Date();
 *    const status = checkDayStatus(today);
 *    if (item.weekdaysOnly && (status === DAY_TYPES.HOLIDAY || status === DAY_TYPES.WEEKEND)) {
 *      // hide item from menu
 *    }
 *
 * 3. Shift planner — highlight holidays for premium pay rates:
 *
 *    import { checkDayStatus, DAY_TYPES } from '../shared/production-calendar.js';
 *
 *    const status = checkDayStatus(dateKey);
 *    const isPremiumDay = status === DAY_TYPES.HOLIDAY || status === DAY_TYPES.WEEKEND;
 *
 * Firestore document: settings/production_calendar_{year}
 * Day entry shape: { type: 'holiday', name?: '...', manual?: true }
 * Manual overrides are stored separately in manualOverrides and merged on read/sync.
 */

/** @typedef {'workday' | 'weekend' | 'holiday' | 'preholiday'} ProductionDayType */

/** @typedef {{ type: ProductionDayType, name?: string|null, manual?: boolean }} ProductionDayEntry */

/** @typedef {Record<string, ProductionDayEntry>} ProductionDaysMap */

/** @typedef {Record<string, Omit<ProductionDayEntry, 'manual'>>} ManualOverridesMap */

/** Dates the user explicitly reverted to API / routine — never resurrect on sync. */
/** @typedef {Record<string, true>} ClearedManualDatesMap */

export const DAY_TYPES = {
  WORKDAY: 'workday',
  WEEKEND: 'weekend',
  HOLIDAY: 'holiday',
  PREHOLIDAY: 'preholiday',
};

export const DAY_TYPE_LABELS = {
  [DAY_TYPES.WORKDAY]: 'Рабочий',
  [DAY_TYPES.WEEKEND]: 'Выходной',
  [DAY_TYPES.HOLIDAY]: 'Праздник / выходной',
  [DAY_TYPES.PREHOLIDAY]: 'Предпраздничный',
};

/** Manual edit cycle: workday → off-day → preholiday → workday */
export const DAY_TYPE_CYCLE = [
  DAY_TYPES.WORKDAY,
  DAY_TYPES.HOLIDAY,
  DAY_TYPES.PREHOLIDAY,
];

/** @type {Record<string, string>} MM-DD → official holiday name */
export const RU_HOLIDAY_NAMES = {
  '01-01': 'Новый год',
  '01-02': 'Новогодние каникулы',
  '01-03': 'Новогодние каникулы',
  '01-04': 'Новогодние каникулы',
  '01-05': 'Новогодние каникулы',
  '01-06': 'Новогодние каникулы',
  '01-07': 'Рождество Христово',
  '01-08': 'Новогодние каникулы',
  '02-23': 'День защитника Отечества',
  '03-08': 'Международный женский день',
  '05-01': 'Праздник Весны и Труда',
  '05-09': 'День Победы',
  '06-12': 'День России',
  '11-04': 'День народного единства',
};

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

const WEEKDAY_HEADERS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** @type {Map<number, ProductionDaysMap>} */
const yearCache = new Map();

/** @param {Date|string} date */
export function toDateKey(date) {
  if (typeof date === 'string') {
    return date.slice(0, 10);
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** @param {string} dateKey */
export function isNaturalWeekend(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow === 0 || dow === 6;
}

/** @param {ProductionDayType} type @param {string} dateKey @param {string} [name] */
export function isRoutineCalendarEntry(type, dateKey, name) {
  if (name?.trim()) return false;
  if (type === DAY_TYPES.WORKDAY && !isNaturalWeekend(dateKey)) return true;
  if (type === DAY_TYPES.WEEKEND && isNaturalWeekend(dateKey)) return true;
  return false;
}

/**
 * API baseline + manual overrides (manual wins).
 * @param {ProductionDaysMap} apiDays
 * @param {ManualOverridesMap} [manualOverrides]
 * @returns {ProductionDaysMap}
 */
export function mergeProductionCalendarDays(apiDays, manualOverrides = {}, clearedManualDates = {}) {
  const merged = { ...apiDays };
  for (const [dateKey, entry] of Object.entries(manualOverrides || {})) {
    if (!entry?.type || clearedManualDates?.[dateKey]) continue;
    merged[dateKey] = {
      type: entry.type,
      ...(entry.name ? { name: entry.name } : {}),
      manual: true,
    };
  }
  return merged;
}

/**
 * Drop overrides that were cleared by the user or now match the API baseline.
 * @param {ManualOverridesMap} manualOverrides
 * @param {ProductionDaysMap} apiDays
 * @param {ClearedManualDatesMap} [clearedManualDates]
 * @returns {ManualOverridesMap}
 */
export function sanitizeManualOverrides(manualOverrides, apiDays, clearedManualDates = {}) {
  /** @type {ManualOverridesMap} */
  const out = {};

  for (const [dateKey, entry] of Object.entries(manualOverrides || {})) {
    if (!entry?.type || clearedManualDates?.[dateKey]) continue;

    const apiEntry = apiDays?.[dateKey];
    if (apiEntry) {
      const sameType = entry.type === apiEntry.type;
      const sameName = (entry.name || '') === (apiEntry.name || '');
      if (sameType && sameName) continue;
    }

    out[dateKey] = entry;
  }

  return out;
}

/** @param {ProductionDayEntry} entry */
export function toManualOverrideEntry(entry) {
  const out = { type: entry.type };
  if (entry.name?.trim()) out.name = entry.name.trim();
  return out;
}

/**
 * Unified day map for rendering and the upcoming-events widget.
 * @param {ProductionDaysMap} daysMap
 * @param {ManualOverridesMap} [manualOverrides]
 * @param {ProductionDaysMap} [apiDays]
 * @returns {ProductionDaysMap}
 */
export function buildEffectiveProductionDays(daysMap, manualOverrides = {}, apiDays = null) {
  const baseline =
    apiDays && Object.keys(apiDays).length > 0
      ? apiDays
      : daysMap || {};
  const effective = mergeProductionCalendarDays(baseline, manualOverrides);

  for (const [key, entry] of Object.entries(daysMap || {})) {
    if (entry?.manual) {
      effective[key] = entry;
    }
  }

  return effective;
}

/**
 * Recover manual overrides from a merged days map when apiDays is available.
 * @param {ProductionDaysMap} existingDays
 * @param {ProductionDaysMap} apiDays
 * @returns {ManualOverridesMap}
 */
export function extractManualOverridesFromDays(existingDays, apiDays, clearedManualDates = {}) {
  /** @type {ManualOverridesMap} */
  const overrides = {};

  for (const [dateKey, entry] of Object.entries(existingDays || {})) {
    if (!entry?.type || clearedManualDates?.[dateKey]) continue;

    if (entry.manual) {
      overrides[dateKey] = toManualOverrideEntry(entry);
      continue;
    }

    const apiEntry = apiDays[dateKey];
    if (!apiEntry) {
      if (!isRoutineCalendarEntry(entry.type, dateKey, entry.name)) {
        overrides[dateKey] = toManualOverrideEntry(entry);
      }
      continue;
    }

    const sameType = entry.type === apiEntry.type;
    const sameName = (entry.name || '') === (apiEntry.name || '');
    if (!sameType || !sameName) {
      overrides[dateKey] = toManualOverrideEntry(entry);
    }
  }

  return overrides;
}

/** @param {ProductionDayType} type @param {string} dateKey */
export function defaultNameForType(type, dateKey) {
  if (type === DAY_TYPES.HOLIDAY) {
    return RU_HOLIDAY_NAMES[dateKey.slice(5)] || 'Нерабочий праздничный день';
  }
  if (type === DAY_TYPES.PREHOLIDAY) {
    return 'Сокращённый предпраздничный день';
  }
  if (type === DAY_TYPES.WORKDAY && isNaturalWeekend(dateKey)) {
    return 'Перенесённый рабочий день';
  }
  return null;
}

/**
 * Resolve display type when no explicit entry exists.
 * @param {string} dateKey
 * @returns {ProductionDayType}
 */
export function inferDayType(dateKey) {
  return isNaturalWeekend(dateKey) ? DAY_TYPES.WEEKEND : DAY_TYPES.WORKDAY;
}

/**
 * @param {string} dateKey
 * @param {ProductionDaysMap} [daysMap]
 * @returns {ProductionDayType}
 */
export function checkDayStatus(dateKey, daysMap) {
  const key = typeof dateKey === 'string' ? dateKey.slice(0, 10) : toDateKey(dateKey);
  const map = daysMap || yearCache.get(Number(key.slice(0, 4))) || null;
  const entry = map?.[key];
  if (entry?.type) return entry.type;
  return inferDayType(key);
}

/**
 * @param {string} dateKey
 * @param {ProductionDaysMap} [daysMap]
 * @returns {ProductionDayEntry & { date: string }}
 */
export function getDayInfo(dateKey, daysMap) {
  const key = dateKey.slice(0, 10);
  const map = daysMap || yearCache.get(Number(key.slice(0, 4))) || null;
  const entry = map?.[key];
  const type = entry?.type || inferDayType(key);
  return {
    date: key,
    type,
    name: entry?.name ?? defaultNameForType(type, key),
  };
}

/** @param {number} year @param {ProductionDaysMap} days */
export function cacheProductionCalendar(year, days) {
  yearCache.set(year, days);
}

/** @param {number} year @returns {ProductionDaysMap|null} */
export function getCachedProductionCalendar(year) {
  return yearCache.get(year) || null;
}

/** @param {number} year */
export function clearProductionCalendarCache(year) {
  if (year) yearCache.delete(year);
  else yearCache.clear();
}

/**
 * @param {number} year
 * @param {() => Promise<ProductionDaysMap>} loader
 */
export async function prefetchProductionCalendar(year, loader) {
  const cached = yearCache.get(year);
  if (cached) return cached;
  const days = await loader();
  yearCache.set(year, days);
  return days;
}

/**
 * Parse isdayoff.ru year string (pre=1).
 * Codes: 0 workday, 1 day off, 2 shortened, 4 transferred workday, 8 holiday.
 *
 * @param {string} raw
 * @param {number} year
 * @returns {ProductionDaysMap}
 */
export function parseIsDayOffYear(raw, year) {
  const days = /** @type {ProductionDaysMap} */ ({});
  const cur = new Date(year, 0, 1);

  for (let i = 0; i < raw.length && cur.getFullYear() === year; i += 1) {
    const code = Number(raw[i]);
    const dateKey = toDateKey(cur);
    const mmdd = dateKey.slice(5);
    const naturalWeekend = isNaturalWeekend(dateKey);

    /** @type {ProductionDayType} */
    let type;
    /** @type {string|null} */
    let name = null;

    if (code === 2) {
      type = DAY_TYPES.PREHOLIDAY;
      name = defaultNameForType(type, dateKey);
    } else if (code === 0 || code === 4) {
      type = DAY_TYPES.WORKDAY;
      if (code === 4 || naturalWeekend) {
        name = 'Перенесённый рабочий день';
      }
    } else if (code === 1 || code === 8) {
      if (naturalWeekend) {
        type = DAY_TYPES.WEEKEND;
      } else {
        type = DAY_TYPES.HOLIDAY;
        name = RU_HOLIDAY_NAMES[mmdd] || 'Нерабочий праздничный день';
      }
    } else {
      type = inferDayType(dateKey);
    }

    days[dateKey] = { type, ...(name ? { name } : {}) };
    cur.setDate(cur.getDate() + 1);
  }

  return days;
}

/** @param {ProductionDayType} current @param {string} dateKey */
export function nextDayTypeInCycle(current, dateKey) {
  if (current === DAY_TYPES.WORKDAY) {
    return isNaturalWeekend(dateKey) ? DAY_TYPES.WEEKEND : DAY_TYPES.HOLIDAY;
  }
  if (current === DAY_TYPES.WEEKEND || current === DAY_TYPES.HOLIDAY) {
    return DAY_TYPES.PREHOLIDAY;
  }
  return DAY_TYPES.WORKDAY;
}

/**
 * @param {ProductionDayType} type
 * @param {string} dateKey
 * @returns {ProductionDayEntry}
 */
export function buildDayEntry(type, dateKey) {
  const name = defaultNameForType(type, dateKey);
  return name ? { type, name } : { type };
}

/**
 * @param {number} year
 * @param {number} monthIndex 0–11
 */
export function getMonthGrid(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);
  const startPad = (first.getDay() + 6) % 7; // Monday-first
  const cells = [];

  for (let i = 0; i < startPad; i += 1) {
    cells.push(null);
  }

  for (let d = 1; d <= last.getDate(); d += 1) {
    cells.push(toDateKey(new Date(year, monthIndex, d)));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return {
    monthIndex,
    title: MONTH_NAMES[monthIndex],
    cells,
  };
}

/** @param {number} year */
export function getYearMonthGrids(year) {
  return Array.from({ length: 12 }, (_, i) => getMonthGrid(year, i));
}

/** @param {string} dateKey */
export function fmtShortDate(dateKey) {
  const [, m, d] = dateKey.split('-');
  return `${d}.${m}.${dateKey.slice(0, 4)}`;
}

/** @param {string} dateKey */
function addDaysToKey(dateKey, delta) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return toDateKey(dt);
}

/**
 * @param {ProductionDayType} type
 * @param {string} dateKey
 * @param {ProductionDayEntry} [entry]
 */
export function eventTypeTagLabel(type, dateKey, entry) {
  if (entry?.manual) {
    if (type === DAY_TYPES.WORKDAY && isNaturalWeekend(dateKey)) return 'Пользовательский перенос';
    if (type === DAY_TYPES.PREHOLIDAY) return 'Локальный предпраздничный';
    return 'Локальная правка';
  }
  if (type === DAY_TYPES.PREHOLIDAY) return 'Предпраздничный';
  if (type === DAY_TYPES.HOLIDAY) return 'Гос. праздник / выходной';
  if (type === DAY_TYPES.WORKDAY && isNaturalWeekend(dateKey)) return 'Перенос рабочего дня';
  if (type === DAY_TYPES.WEEKEND) return 'Выходной / перенос';
  return 'Событие';
}

/**
 * Whether a day should appear in the upcoming-events widget.
 * Includes API holidays, pre-holidays, transfers, and any manual override.
 *
 * @param {string} dateKey
 * @param {ProductionDaysMap} daysMap
 * @param {ManualOverridesMap} [manualOverrides]
 */
export function isListableCalendarEvent(dateKey, daysMap, manualOverrides = {}) {
  const override = manualOverrides?.[dateKey];
  if (override?.type) {
    return !isRoutineCalendarEntry(override.type, dateKey, override.name);
  }

  const entry = daysMap?.[dateKey];
  if (!entry?.type) return false;

  if (entry.manual) return true;

  const type = entry.type;

  // Plain synced workday (Mon–Fri, no custom label)
  if (type === DAY_TYPES.WORKDAY && !isNaturalWeekend(dateKey) && !entry.name) {
    return false;
  }

  // Plain synced weekend (Sat/Sun, no custom label)
  if (type === DAY_TYPES.WEEKEND && isNaturalWeekend(dateKey) && !entry.name) {
    return false;
  }

  return true;
}

/**
 * @param {ProductionDayType} type
 * @param {string} dateKey
 * @param {ProductionDayEntry|undefined} entry
 */
export function resolveEventDisplayName(type, dateKey, entry) {
  const custom = entry?.name?.trim();
  if (custom) return custom;

  if (entry?.manual) {
    if (type === DAY_TYPES.HOLIDAY || (type === DAY_TYPES.WEEKEND && !isNaturalWeekend(dateKey))) {
      return 'Локальный выходной';
    }
    if (type === DAY_TYPES.WORKDAY && isNaturalWeekend(dateKey)) return 'Пользовательский перенос';
    if (type === DAY_TYPES.PREHOLIDAY) return 'Локальный предпраздничный день';
  }

  const natural = inferDayType(dateKey);
  const isLegacyManual = !entry?.name && (
    type !== natural || (type === DAY_TYPES.WORKDAY && isNaturalWeekend(dateKey))
  );

  if (isLegacyManual) {
    if (type === DAY_TYPES.HOLIDAY || (type === DAY_TYPES.WEEKEND && !isNaturalWeekend(dateKey))) {
      return 'Локальный выходной';
    }
    if (type === DAY_TYPES.WORKDAY && isNaturalWeekend(dateKey)) return 'Пользовательский перенос';
    if (type === DAY_TYPES.PREHOLIDAY) return 'Локальный предпраздничный день';
  }

  return defaultNameForType(type, dateKey) || 'Событие';
}

/**
 * @typedef {object} CalendarEventPeriod
 * @property {string} id
 * @property {ProductionDayType} type
 * @property {string} name
 * @property {string} typeTag
 * @property {string} dateFrom
 * @property {string} dateTo
 * @property {string[]} dates
 */

/**
 * @param {ProductionDaysMap} daysMap
 * @param {number} year
 * @param {{ includePast?: boolean, manualOverrides?: ManualOverridesMap, apiDays?: ProductionDaysMap|null }} [opts]
 * @returns {CalendarEventPeriod[]}
 */
export function collectCalendarEvents(daysMap, year, {
  includePast = false,
  manualOverrides = {},
  apiDays = null,
} = {}) {
  const effectiveDays = buildEffectiveProductionDays(daysMap, manualOverrides, apiDays);
  const todayKey = toDateKey(new Date());
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const cutoff = includePast
    ? yearStart
    : todayKey.slice(0, 4) === String(year)
      ? todayKey
      : todayKey < yearStart
        ? yearStart
        : yearEnd;

  /** @type {Set<string>} */
  const keySet = new Set();

  const cur = new Date(year, 0, 1);
  while (cur.getFullYear() === year) {
    keySet.add(toDateKey(cur));
    cur.setDate(cur.getDate() + 1);
  }

  for (const key of Object.keys(effectiveDays || {})) {
    if (key.startsWith(`${year}-`)) keySet.add(key.slice(0, 10));
  }

  for (const key of Object.keys(manualOverrides || {})) {
    if (key.startsWith(`${year}-`)) keySet.add(key.slice(0, 10));
  }

  /** @type {string[]} */
  const keys = [...keySet]
    .filter(key => key >= cutoff && key <= yearEnd && isListableCalendarEvent(key, effectiveDays, manualOverrides))
    .sort();

  if (!keys.length) return [];

  /** @type {CalendarEventPeriod[]} */
  const periods = [];
  let rangeStart = keys[0];
  let rangeEnd = keys[0];
  let rangeEntry = effectiveDays[rangeStart];
  let rangeType = rangeEntry?.type || inferDayType(rangeStart);

  const flushRange = () => {
    const typeTag = eventTypeTagLabel(rangeType, rangeStart, rangeEntry);
    const name = resolveEventDisplayName(rangeType, rangeStart, rangeEntry);
    const dates = [];
    let dk = rangeStart;
    while (dk <= rangeEnd) {
      dates.push(dk);
      dk = addDaysToKey(dk, 1);
    }
    periods.push({
      id: `${rangeStart}_${rangeEnd}_${rangeType}`,
      type: rangeType,
      name,
      typeTag,
      dateFrom: rangeStart,
      dateTo: rangeEnd,
      dates,
    });
  };

  const sameGroup = (startKey, aEntry, aType, bEntry, bType, bKey) => {
    const aName = resolveEventDisplayName(aType, startKey, aEntry);
    const bName = resolveEventDisplayName(bType, bKey, bEntry);
    return aType === bType && aName === bName;
  };

  for (let i = 1; i < keys.length; i += 1) {
    const key = keys[i];
    const entry = effectiveDays[key];
    const type = entry?.type || inferDayType(key);
    const prevNext = addDaysToKey(rangeEnd, 1);

    if (key === prevNext && sameGroup(rangeStart, rangeEntry, rangeType, entry, type, key)) {
      rangeEnd = key;
      continue;
    }

    flushRange();
    rangeStart = key;
    rangeEnd = key;
    rangeEntry = entry;
    rangeType = type;
  }

  flushRange();
  return periods.sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
}

export { MONTH_NAMES, WEEKDAY_HEADERS };
