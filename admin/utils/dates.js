/** @returns {Date} Local midnight */
export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** @returns {Date} Local end of day */
export function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** @returns {string} YYYY-MM-DD */
export function toDateInputValue(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** @param {string} value YYYY-MM-DD */
export function fromDateInputValue(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * @typedef {'day' | 'week' | 'month' | 'custom'} PeriodPreset
 * @typedef {{ start: Date, end: Date, preset: PeriodPreset }} PeriodRange
 */

/**
 * @param {PeriodPreset} preset
 * @param {string} [customFrom] YYYY-MM-DD
 * @param {string} [customTo] YYYY-MM-DD
 * @returns {PeriodRange}
 */
export function resolvePeriod(preset, customFrom, customTo) {
  const now = new Date();

  if (preset === 'day') {
    return { start: startOfDay(now), end: endOfDay(now), preset };
  }

  if (preset === 'week') {
    const start = startOfDay(now);
    start.setDate(start.getDate() - 6);
    return { start, end: endOfDay(now), preset };
  }

  if (preset === 'month') {
    const start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    return { start, end: endOfDay(now), preset };
  }

  const from = customFrom ? startOfDay(fromDateInputValue(customFrom)) : startOfDay(now);
  const to = customTo ? endOfDay(fromDateInputValue(customTo)) : endOfDay(now);
  return { start: from, end: to > from ? to : endOfDay(from), preset: 'custom' };
}

/** @param {Date} start @param {Date} end */
export function eachDayKey(start, end) {
  const keys = [];
  const cur = startOfDay(start);
  const last = startOfDay(end);
  while (cur <= last) {
    keys.push(toDateInputValue(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return keys;
}
