/**
 * Work shift reference — schedule types, normalization, and helpers.
 */

/** @type {Record<string, string>} */
export const SCHEDULE_TYPES = {
  FIXED: 'fixed',
  ROTATING: 'rotating',
};

/** @type {Record<string, string>} */
export const CYCLE_UNITS = {
  DAYS: 'days',
  HOURS: 'hours',
};

/** @type {Record<string, string>} */
export const FIXED_PATTERNS = {
  FIVE_TWO: '5/2',
  SIX_ONE: '6/1',
};

export const DEFAULT_WORK_SHIFT_ID = 'standard_5_2';

export const SCHEDULE_TYPE_OPTIONS = [
  { value: SCHEDULE_TYPES.FIXED, label: 'Фиксированный (5/2, 6/1) — привязан к дням недели' },
  { value: SCHEDULE_TYPES.ROTATING, label: 'Циклический (Сменный) — чередование без привязки к дням недели' },
];

export const FIXED_PATTERN_OPTIONS = [
  { value: FIXED_PATTERNS.FIVE_TWO, label: '5/2 (пн–пт рабочие, сб–вс выходные)' },
  { value: FIXED_PATTERNS.SIX_ONE, label: '6/1 (пн–сб рабочие, вс выходной)' },
];

export const CYCLE_UNIT_OPTIONS = [
  { value: CYCLE_UNITS.DAYS, label: 'Дни (2/2, 3/3…)' },
  { value: CYCLE_UNITS.HOURS, label: 'Часы (сутки/трое, 12/48…)' },
];

/**
 * @param {string|null|undefined} start HH:MM
 * @param {string|null|undefined} end HH:MM
 */
export function computeCrossesMidnight(start, end) {
  const s = parseTimeMinutes(start);
  const e = parseTimeMinutes(end);
  if (s == null || e == null) return false;
  return e <= s;
}

/**
 * @param {string|null|undefined} value
 * @returns {number|null}
 */
export function parseTimeMinutes(value) {
  if (!value || typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * @param {object} raw
 */
export function normalizeWorkShift(raw = {}) {
  const scheduleType = raw.scheduleType === SCHEDULE_TYPES.ROTATING
    ? SCHEDULE_TYPES.ROTATING
    : SCHEDULE_TYPES.FIXED;

  const cycleUnit = raw.cycleUnit === CYCLE_UNITS.HOURS ? CYCLE_UNITS.HOURS : CYCLE_UNITS.DAYS;
  const shiftStart = normalizeTime(raw.shiftStart) || '09:00';
  const shiftEnd = normalizeTime(raw.shiftEnd) || '18:00';

  const fixedPattern = raw.fixedPattern === FIXED_PATTERNS.SIX_ONE
    ? FIXED_PATTERNS.SIX_ONE
    : FIXED_PATTERNS.FIVE_TWO;

  return {
    id: String(raw.id || '').trim(),
    name: String(raw.name || '').trim(),
    scheduleType,
    fixedPattern: scheduleType === SCHEDULE_TYPES.FIXED ? fixedPattern : null,
    cycleUnit: scheduleType === SCHEDULE_TYPES.ROTATING ? cycleUnit : CYCLE_UNITS.DAYS,
    workPeriod: clampPeriod(raw.workPeriod, cycleUnit === CYCLE_UNITS.HOURS ? 24 : 2),
    restPeriod: clampPeriod(raw.restPeriod, cycleUnit === CYCLE_UNITS.HOURS ? 72 : 2),
    cycleStartDate: normalizeDateKey(raw.cycleStartDate),
    shiftStart,
    shiftEnd,
    crossesMidnight: computeCrossesMidnight(shiftStart, shiftEnd),
    useProductionCalendar: raw.useProductionCalendar !== false,
  };
}

/**
 * @param {object} p
 */
export function createWorkShiftDoc(p) {
  const normalized = normalizeWorkShift(p);
  if (!normalized.id) throw new Error('Work shift id is required');
  if (!normalized.name) throw new Error('Work shift name is required');
  return normalized;
}

/** Default «Стандарт 5/2» shift for migration. */
export function createDefaultWorkShiftDoc() {
  return createWorkShiftDoc({
    id: DEFAULT_WORK_SHIFT_ID,
    name: 'Стандарт 5/2',
    scheduleType: SCHEDULE_TYPES.FIXED,
    fixedPattern: FIXED_PATTERNS.FIVE_TWO,
    shiftStart: '09:00',
    shiftEnd: '18:00',
    useProductionCalendar: true,
  });
}

/**
 * @param {object} shift
 * @returns {string}
 */
export function formatWorkShiftSummary(shift) {
  const s = normalizeWorkShift(shift);
  const time = `${s.shiftStart}–${s.shiftEnd}${s.crossesMidnight ? ' (+1)' : ''}`;
  if (s.scheduleType === SCHEDULE_TYPES.FIXED) {
    return `${s.fixedPattern || '5/2'} · ${time}`;
  }
  const unit = s.cycleUnit === CYCLE_UNITS.HOURS ? 'ч' : 'д';
  return `${s.workPeriod}/${s.restPeriod}${unit} · ${time}`;
}

/**
 * @param {object|null|undefined} shift
 * @returns {string}
 */
export function formatShiftTimeRange(shift) {
  const s = normalizeWorkShift(shift || createDefaultWorkShiftDoc());
  const suffix = s.crossesMidnight ? ' (ночная, +1)' : '';
  return `${s.shiftStart}–${s.shiftEnd}${suffix}`;
}

/**
 * @param {{ shiftId?: string|null }} user
 * @param {Map<string, object>|Record<string, object>|null|undefined} shiftsById
 */
export function resolveUserWorkShift(user, shiftsById) {
  const id = user?.shiftId || DEFAULT_WORK_SHIFT_ID;
  const map = shiftsById instanceof Map
    ? shiftsById
    : new Map(Object.entries(shiftsById || {}));
  const found = map.get(id);
  if (found) return normalizeWorkShift(found);
  return createDefaultWorkShiftDoc();
}

/**
 * Начало текущего рабочего интервала для подсчёта подходов «в смену».
 * @param {Date} now
 * @param {object|null|undefined} shift
 */
export function shiftIntervalStartDate(now, shift) {
  const s = normalizeWorkShift(shift || createDefaultWorkShiftDoc());
  const startM = parseTimeMinutes(s.shiftStart) ?? 9 * 60;
  const endM = parseTimeMinutes(s.shiftEnd) ?? 18 * 60;
  const crosses = s.crossesMidnight || endM <= startM;

  const result = new Date(now);
  result.setSeconds(0, 0);
  const nowM = now.getHours() * 60 + now.getMinutes();

  const applyStart = (date, dayOffset = 0) => {
    if (dayOffset) date.setDate(date.getDate() + dayOffset);
    date.setHours(Math.floor(startM / 60), startM % 60, 0, 0);
  };

  if (crosses) {
    if (nowM >= startM || nowM < endM) {
      applyStart(result, nowM < endM ? -1 : 0);
    } else {
      applyStart(result, 0);
    }
  } else if (nowM >= startM) {
    applyStart(result, 0);
  } else {
    applyStart(result, -1);
  }

  return result;
}

function clampPeriod(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.round(n), 999);
}

function normalizeTime(value) {
  if (!value) return null;
  const m = String(value).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function normalizeDateKey(value) {
  if (!value) return null;
  const s = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
