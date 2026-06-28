/** @typedef {'all'|'weekdays'|'weekends'|'custom'} ItemDayMode */

/**
 * @typedef {object} ItemAvailabilityRules
 * @property {boolean} restricted
 * @property {string|null} [timeFrom]
 * @property {string|null} [timeTo]
 * @property {ItemDayMode} [dayMode]
 * @property {number[]} [customDays] - ISO weekday 1=Mon … 7=Sun
 * @property {boolean} [dateRangeEnabled]
 * @property {string|null} [dateFrom]
 * @property {string|null} [dateTo]
 */

export const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const DAY_VALUES = [1, 2, 3, 4, 5, 6, 7];

export const DAY_MODE_OPTIONS = [
  { id: 'all', label: 'Все дни' },
  { id: 'weekdays', label: 'Будни' },
  { id: 'weekends', label: 'Выходные' },
  { id: 'custom', label: 'Выборочно' },
];

/** @param {Partial<ItemAvailabilityRules>|null|undefined} raw */
export function normalizeItemAvailability(raw) {
  if (!raw || raw.restricted !== true) {
    return { restricted: false };
  }

  const dayMode = ['all', 'weekdays', 'weekends', 'custom'].includes(raw.dayMode)
    ? raw.dayMode
    : 'all';

  return {
    restricted: true,
    timeFrom: raw.timeFrom || null,
    timeTo: raw.timeTo || null,
    dayMode,
    customDays: Array.isArray(raw.customDays)
      ? [...new Set(raw.customDays.filter(d => Number.isInteger(d) && d >= 1 && d <= 7))]
      : [],
    dateRangeEnabled: !!raw.dateRangeEnabled,
    dateFrom: raw.dateFrom || null,
    dateTo: raw.dateTo || null,
  };
}

/** @param {string} dateStr YYYY-MM-DD */
export function isoWeekdayFromDate(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

/** @param {string|null|undefined} time HH:MM */
function timeToMinutes(time) {
  if (!time) return null;
  const [h, m] = String(time).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** @param {ItemAvailabilityRules} rules @param {number} isoWeekday */
function isDayAllowed(rules, isoWeekday) {
  if (rules.dayMode === 'weekdays') return isoWeekday >= 1 && isoWeekday <= 5;
  if (rules.dayMode === 'weekends') return isoWeekday >= 6;
  if (rules.dayMode === 'custom') return rules.customDays.includes(isoWeekday);
  return true;
}

/** @param {string} timeStr @param {string|null} from @param {string|null} to */
function isTimeInWindow(timeStr, from, to) {
  const current = timeToMinutes(timeStr);
  const start = timeToMinutes(from);
  const end = timeToMinutes(to);
  if (start == null || end == null || current == null) return true;

  if (start <= end) {
    return current >= start && current <= end;
  }
  return current >= start || current <= end;
}

/**
 * @param {{ isAvailable?: boolean, availability?: Partial<ItemAvailabilityRules> }} item
 * @param {{ date?: string, time?: string }} [slot]
 */
export function isItemAvailableAt(item, slot = {}) {
  if (item?.isAvailable === false) return false;

  const rules = normalizeItemAvailability(item?.availability);
  if (!rules.restricted) return true;

  const dateStr = slot.date || new Date().toISOString().slice(0, 10);
  const timeStr = slot.time || new Date().toTimeString().slice(0, 5);

  if (rules.dateRangeEnabled) {
    if (rules.dateFrom && dateStr < rules.dateFrom) return false;
    if (rules.dateTo && dateStr > rules.dateTo) return false;
  }

  if (!isDayAllowed(rules, isoWeekdayFromDate(dateStr))) return false;

  if (rules.timeFrom && rules.timeTo && !isTimeInWindow(timeStr, rules.timeFrom, rules.timeTo)) {
    return false;
  }

  return true;
}

/** @param {Partial<ItemAvailabilityRules>|null|undefined} raw */
export function formatAvailabilitySummary(raw) {
  const rules = normalizeItemAvailability(raw);
  if (!rules.restricted) return '';

  const parts = [];

  if (rules.timeFrom && rules.timeTo) {
    parts.push(`${rules.timeFrom}–${rules.timeTo}`);
  }

  if (rules.dayMode === 'weekdays') parts.push('будни');
  else if (rules.dayMode === 'weekends') parts.push('выходные');
  else if (rules.dayMode === 'custom' && rules.customDays.length) {
    parts.push(rules.customDays.map(d => DAY_LABELS[d - 1]).join(', '));
  }

  if (rules.dateRangeEnabled && (rules.dateFrom || rules.dateTo)) {
    const from = rules.dateFrom ? fmtShortDate(rules.dateFrom) : '…';
    const to = rules.dateTo ? fmtShortDate(rules.dateTo) : '…';
    parts.push(`${from}—${to}`);
  }

  return parts.join(' · ') || 'По расписанию';
}

/** @param {string} iso */
function fmtShortDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y?.slice(2) || ''}`;
}

/**
 * @param {object} form
 * @returns {ItemAvailabilityRules}
 */
export function buildAvailabilityFromForm(form) {
  if (!form.restricted) {
    return { restricted: false };
  }

  const dayMode = form.dayMode || 'all';
  const customDays = Array.isArray(form.customDays)
    ? form.customDays.map(Number).filter(d => d >= 1 && d <= 7)
    : [];

  if (dayMode === 'custom' && !customDays.length) {
    throw new Error('Выберите хотя бы один день недели');
  }

  const dateRangeEnabled = !!form.dateRangeEnabled;
  const dateFrom = form.dateFrom || null;
  const dateTo = form.dateTo || null;

  if (dateRangeEnabled && dateFrom && dateTo && dateFrom > dateTo) {
    throw new Error('Дата начала не может быть позже даты окончания');
  }

  const timeFrom = form.timeEnabled ? (form.timeFrom || null) : null;
  const timeTo = form.timeEnabled ? (form.timeTo || null) : null;

  if (form.timeEnabled && timeFrom && timeTo && timeFrom === timeTo) {
    throw new Error('Укажите корректный интервал часов');
  }

  return normalizeItemAvailability({
    restricted: true,
    timeFrom,
    timeTo,
    dayMode,
    customDays,
    dateRangeEnabled,
    dateFrom: dateRangeEnabled ? dateFrom : null,
    dateTo: dateRangeEnabled ? dateTo : null,
  });
}
