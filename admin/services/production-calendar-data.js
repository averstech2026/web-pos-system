import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import { COL } from '../../shared/schema.js';
import {
  cacheProductionCalendar,
  checkDayStatus,
  inferDayType,
  isRoutineCalendarEntry,
  mergeProductionCalendarDays,
  parseIsDayOffYear,
  sanitizeManualOverrides,
  toDateKey,
  toManualOverrideEntry,
  getCachedProductionCalendar,
} from '../../shared/production-calendar.js';

/** @param {number} year */
export function productionCalendarDocId(year) {
  return `production_calendar_${year}`;
}

/**
 * @typedef {object} ProductionCalendarDoc
 * @property {number} year
 * @property {import('../../shared/production-calendar.js').ProductionDaysMap} days
 * @property {import('../../shared/production-calendar.js').ManualOverridesMap} [manualOverrides]
 * @property {import('../../shared/production-calendar.js').ClearedManualDatesMap} [clearedManualDates]
 * @property {import('../../shared/production-calendar.js').ProductionDaysMap} [apiDays]
 * @property {import('firebase/firestore').Timestamp|string|null} [syncedAt]
 * @property {string} [source]
 * @property {import('firebase/firestore').Timestamp|string|null} [updatedAt]
 */

/**
 * @param {import('firebase/firestore').DocumentData} data
 * @returns {import('../../shared/production-calendar.js').ProductionDaysMap}
 */
function resolveMergedDays(data) {
  const manualOverrides =
    data.manualOverrides && typeof data.manualOverrides === 'object' ? data.manualOverrides : {};
  const clearedManualDates =
    data.clearedManualDates && typeof data.clearedManualDates === 'object'
      ? data.clearedManualDates
      : {};
  const apiDays = data.apiDays && typeof data.apiDays === 'object' ? data.apiDays : null;
  const storedDays = data.days && typeof data.days === 'object' ? data.days : {};

  if (apiDays) {
    const active = sanitizeManualOverrides(manualOverrides, apiDays, clearedManualDates);
    return mergeProductionCalendarDays(apiDays, active, clearedManualDates);
  }

  if (Object.keys(manualOverrides).length > 0) {
    return mergeProductionCalendarDays(storedDays, manualOverrides, clearedManualDates);
  }

  return storedDays;
}

/**
 * @param {number} year
 * @returns {Promise<ProductionCalendarDoc|null>}
 */
export async function fetchProductionCalendar(year) {
  const ref = doc(db, COL.SETTINGS, productionCalendarDocId(year));
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data();
  const clearedManualDates =
    data.clearedManualDates && typeof data.clearedManualDates === 'object'
      ? data.clearedManualDates
      : {};
  const manualOverrides =
    data.manualOverrides && typeof data.manualOverrides === 'object' ? data.manualOverrides : {};
  const apiDays = data.apiDays && typeof data.apiDays === 'object' ? data.apiDays : undefined;
  const days = resolveMergedDays(data);
  cacheProductionCalendar(year, days);

  return {
    year,
    days,
    manualOverrides,
    clearedManualDates,
    apiDays,
    syncedAt: data.syncedAt ?? null,
    source: data.source || '',
    updatedAt: data.updatedAt ?? null,
  };
}

/**
 * @param {number} year
 * @param {import('../../shared/production-calendar.js').ProductionDaysMap} days
 * @param {{ source?: string, synced?: boolean, apiDays?: import('../../shared/production-calendar.js').ProductionDaysMap, manualOverrides?: import('../../shared/production-calendar.js').ManualOverridesMap, clearedManualDates?: import('../../shared/production-calendar.js').ClearedManualDatesMap }} [opts]
 */
export async function saveProductionCalendar(year, days, opts = {}) {
  const ref = doc(db, COL.SETTINGS, productionCalendarDocId(year));
  const payload = {
    year,
    days,
    updatedAt: serverTimestamp(),
  };

  if (opts.source) payload.source = opts.source;
  if (opts.synced) payload.syncedAt = serverTimestamp();
  if (opts.apiDays) payload.apiDays = opts.apiDays;
  if (opts.manualOverrides) payload.manualOverrides = opts.manualOverrides;
  if (opts.clearedManualDates) payload.clearedManualDates = opts.clearedManualDates;

  await setDoc(ref, payload, { merge: true });
  cacheProductionCalendar(year, days);
}

/**
 * @param {number} year
 * @param {string} dateKey
 * @param {import('../../shared/production-calendar.js').ProductionDayEntry} entry
 * @param {import('../../shared/production-calendar.js').ProductionDaysMap} currentDays
 */
export async function saveProductionCalendarDay(year, dateKey, entry, currentDays) {
  const ref = doc(db, COL.SETTINGS, productionCalendarDocId(year));
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : {};
  const manualOverrides = { ...(data.manualOverrides || {}) };
  const clearedManualDates = { ...(data.clearedManualDates || {}) };
  const resolvedApiDays =
    data.apiDays && typeof data.apiDays === 'object' ? data.apiDays : null;
  const clean = toManualOverrideEntry(entry);

  if (isRoutineCalendarEntry(clean.type, dateKey, clean.name)) {
    delete manualOverrides[dateKey];
    clearedManualDates[dateKey] = true;
  } else {
    manualOverrides[dateKey] = clean;
    delete clearedManualDates[dateKey];
  }

  const activeOverrides = resolvedApiDays
    ? sanitizeManualOverrides(manualOverrides, resolvedApiDays, clearedManualDates)
    : manualOverrides;

  const days = resolvedApiDays
    ? mergeProductionCalendarDays(resolvedApiDays, activeOverrides, clearedManualDates)
    : { ...currentDays, [dateKey]: isRoutineCalendarEntry(clean.type, dateKey, clean.name)
        ? { type: inferDayType(dateKey) }
        : { ...clean, manual: true } };

  await setDoc(
    ref,
    {
      year,
      days,
      ...(resolvedApiDays ? { apiDays: resolvedApiDays } : {}),
      manualOverrides: activeOverrides,
      clearedManualDates,
      source: 'manual',
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  cacheProductionCalendar(year, days);
  return {
    days,
    manualOverrides: activeOverrides,
    clearedManualDates,
    apiDays: resolvedApiDays,
  };
}

/**
 * @param {number} year
 * @param {string[]} dateKeys
 * @param {import('../../shared/production-calendar.js').ProductionDaysMap} currentDays
 */
export async function resetProductionCalendarDays(year, dateKeys, currentDays) {
  const ref = doc(db, COL.SETTINGS, productionCalendarDocId(year));
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : {};
  const manualOverrides = { ...(data.manualOverrides || {}) };
  const clearedManualDates = { ...(data.clearedManualDates || {}) };
  const resolvedApiDays =
    data.apiDays && typeof data.apiDays === 'object' ? data.apiDays : null;

  for (const key of dateKeys) {
    delete manualOverrides[key];
    clearedManualDates[key] = true;
  }

  const activeOverrides = resolvedApiDays
    ? sanitizeManualOverrides(manualOverrides, resolvedApiDays, clearedManualDates)
    : manualOverrides;

  const days = resolvedApiDays
    ? mergeProductionCalendarDays(resolvedApiDays, activeOverrides, clearedManualDates)
    : { ...currentDays };

  if (!resolvedApiDays) {
    for (const key of dateKeys) {
      days[key] = { type: inferDayType(key) };
    }
  }

  await setDoc(
    ref,
    {
      year,
      days,
      ...(resolvedApiDays ? { apiDays: resolvedApiDays } : {}),
      manualOverrides: activeOverrides,
      clearedManualDates,
      source: 'manual',
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  cacheProductionCalendar(year, days);
  return days;
}

/**
 * Fetch production calendar from isdayoff.ru and persist.
 * Manual overrides always take priority over API data for the same date.
 * Cleared dates always follow the API.
 * @param {number} year
 */
export async function syncProductionCalendarFromApi(year) {
  const url = `https://isdayoff.ru/api/getdata?year=${year}&pre=1`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`API isdayoff.ru вернул код ${res.status}`);
  }

  const raw = (await res.text()).trim();

  if (!raw || /^10[0149]$/.test(raw)) {
    const code = Number(raw);
    if (code === 101) throw new Error('Данные производственного календаря для этого года не найдены');
    if (code >= 100) throw new Error(`Ошибка API isdayoff.ru: ${raw}`);
  }

  if (!/^[01248]+$/.test(raw)) {
    throw new Error('Некорректный ответ API isdayoff.ru');
  }

  const ref = doc(db, COL.SETTINGS, productionCalendarDocId(year));
  const snap = await getDoc(ref);
  const existingData = snap.exists() ? snap.data() : {};
  const apiDays = parseIsDayOffYear(raw, year);
  const clearedManualDates =
    existingData.clearedManualDates && typeof existingData.clearedManualDates === 'object'
      ? { ...existingData.clearedManualDates }
      : {};

  const manualOverrides = sanitizeManualOverrides(
    existingData.manualOverrides && typeof existingData.manualOverrides === 'object'
      ? existingData.manualOverrides
      : {},
    apiDays,
    clearedManualDates,
  );

  const merged = mergeProductionCalendarDays(apiDays, manualOverrides, clearedManualDates);

  await setDoc(
    ref,
    {
      year,
      days: merged,
      apiDays,
      manualOverrides,
      clearedManualDates,
      source: 'isdayoff',
      syncedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  cacheProductionCalendar(year, merged);
  return { days: merged, manualOverrides, clearedManualDates, apiDays };
}

/**
 * Load calendar; auto-sync when empty.
 * @param {number} year
 * @param {{ forceSync?: boolean }} [opts]
 */
export async function loadOrSyncProductionCalendar(year, opts = {}) {
  if (opts.forceSync) {
    const result = await syncProductionCalendarFromApi(year);
    return result.days;
  }

  const existing = await fetchProductionCalendar(year);
  if (existing && Object.keys(existing.days).length > 0) {
    return existing.days;
  }

  const result = await syncProductionCalendarFromApi(year);
  return result.days;
}

/**
 * Async day check with Firestore-backed cache.
 * @param {Date|string} date
 * @param {number} [year]
 * @returns {Promise<import('../../shared/production-calendar.js').ProductionDayType>}
 */
export async function checkDayStatusAsync(date, year) {
  const key = toDateKey(date);
  const y = year ?? Number(key.slice(0, 4));
  let days = getCachedProductionCalendar(y);
  if (!days) {
    const docData = await fetchProductionCalendar(y);
    days = docData?.days || {};
  }
  return checkDayStatus(key, days);
}

export { checkDayStatus } from '../../shared/production-calendar.js';
