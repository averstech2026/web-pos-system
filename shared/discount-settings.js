import { ROLES } from './schema.js';

/** @typedef {'all'|'admin'|'manager'|'cashier'} CashierDiscountRoleScope */

/** @typedef {object} DiscountApplyChannels
 * @property {boolean} applyOnPos
 * @property {boolean} applyOnWeb
 * @property {boolean} applyOnKiosk
 */

/**
 * @typedef {object} CashierDiscountPreset
 * @property {string} id
 * @property {string} [name]
 * @property {number} percent
 * @property {boolean} activeOnCashier
 * @property {CashierDiscountRoleScope} allowedRole
 * @property {boolean} applyOnPos
 * @property {boolean} applyOnWeb
 * @property {boolean} applyOnKiosk
 */

/**
 * @typedef {object} DiscountSettingsDoc
 * @property {CashierDiscountPreset[]} cashierPresets
 */

export const DISCOUNT_APPLY_CHANNEL_OPTIONS = [
  { id: 'pos', label: 'Касса' },
  { id: 'web', label: 'Веб' },
  { id: 'kiosk', label: 'Киоск' },
];

export const CASHIER_DISCOUNT_ROLE_OPTIONS = [
  { id: 'all', label: 'Все' },
  { id: ROLES.ADMIN, label: 'Только администратор' },
  { id: ROLES.MANAGER, label: 'Только менеджер' },
  { id: ROLES.CASHIER, label: 'Только кассир' },
];

const ROLE_SCOPE_IDS = CASHIER_DISCOUNT_ROLE_OPTIONS.map(o => o.id);

/**
 * @param {Partial<DiscountApplyChannels>|null|undefined} raw
 * @param {{ defaultPos?: boolean, defaultWeb?: boolean, defaultKiosk?: boolean }} [defaults]
 * @returns {DiscountApplyChannels}
 */
export function normalizeDiscountApplyChannels(raw, {
  defaultPos = true,
  defaultWeb = false,
  defaultKiosk = false,
} = {}) {
  return {
    applyOnPos: raw?.applyOnPos !== undefined ? raw.applyOnPos === true : defaultPos,
    applyOnWeb: raw?.applyOnWeb !== undefined ? raw.applyOnWeb === true : defaultWeb,
    applyOnKiosk: raw?.applyOnKiosk !== undefined ? raw.applyOnKiosk === true : defaultKiosk,
  };
}

/** @param {DiscountApplyChannels} channels */
export function isDiscountActiveOnChannels(channels) {
  return channels.applyOnPos === true || channels.applyOnWeb === true || channels.applyOnKiosk === true;
}

/** @param {DiscountApplyChannels} channels */
export function formatDiscountApplyChannelsShort(channels) {
  const parts = [];
  if (channels.applyOnPos) parts.push('Касса');
  if (channels.applyOnWeb) parts.push('Веб');
  if (channels.applyOnKiosk) parts.push('Киоск');
  return parts.length ? parts.join(' · ') : 'Нигде';
}

/** @param {number} value @param {number} [fallback] */
function clampPercent(value, fallback = 10) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(1, Math.round(n)));
}

/**
 * @param {Partial<CashierDiscountPreset>} [overrides]
 * @returns {CashierDiscountPreset}
 */
export function createCashierDiscountPreset(overrides = {}) {
  const percent = clampPercent(overrides.percent, 10);
  const channels = normalizeDiscountApplyChannels(overrides, {
    defaultPos: overrides.applyOnPos !== false,
    defaultWeb: false,
    defaultKiosk: false,
  });
  return {
    id: String(overrides.id || `preset-${percent}-${Date.now()}`),
    name: String(overrides.name || '').trim(),
    percent,
    activeOnCashier: overrides.activeOnCashier !== false && channels.applyOnPos,
    allowedRole: ROLE_SCOPE_IDS.includes(overrides.allowedRole) ? overrides.allowedRole : 'all',
    ...channels,
  };
}

/** @returns {DiscountSettingsDoc} */
export function createDefaultDiscountSettings() {
  return {
    cashierPresets: [
      { id: 'preset-5', name: '', percent: 5, activeOnCashier: true, allowedRole: 'all', applyOnPos: true, applyOnWeb: false, applyOnKiosk: false },
      { id: 'preset-10', name: '', percent: 10, activeOnCashier: true, allowedRole: 'all', applyOnPos: true, applyOnWeb: false, applyOnKiosk: false },
      { id: 'preset-15', name: '', percent: 15, activeOnCashier: false, allowedRole: ROLES.ADMIN, applyOnPos: true, applyOnWeb: false, applyOnKiosk: false },
    ],
  };
}

/**
 * @param {Partial<CashierDiscountPreset>|null|undefined} raw
 * @param {CashierDiscountPreset} fallback
 * @returns {CashierDiscountPreset}
 */
function normalizeCashierPreset(raw, fallback) {
  const percent = clampPercent(raw?.percent, fallback.percent);
  const channels = normalizeDiscountApplyChannels(raw, {
    defaultPos: raw?.activeOnCashier !== false && fallback.applyOnPos !== false,
    defaultWeb: fallback.applyOnWeb === true,
    defaultKiosk: fallback.applyOnKiosk === true,
  });
  return {
    id: String(raw?.id || fallback.id || `preset-${percent}`),
    name: String(raw?.name || fallback.name || '').trim(),
    percent,
    ...channels,
    activeOnCashier: raw?.activeOnCashier !== false && channels.applyOnPos,
    allowedRole: ROLE_SCOPE_IDS.includes(raw?.allowedRole) ? raw.allowedRole : fallback.allowedRole,
  };
}

/** @param {Partial<DiscountSettingsDoc>|null|undefined} raw */
export function normalizeDiscountSettings(raw) {
  const defaults = createDefaultDiscountSettings();
  const source = Array.isArray(raw?.cashierPresets) && raw.cashierPresets.length
    ? raw.cashierPresets
    : defaults.cashierPresets;

  const byPercent = new Map(source.map(item => [clampPercent(item.percent, 0), item]));
  const mergedDefaults = defaults.cashierPresets.map(fallback => {
    const item = source.find(p => p.id === fallback.id)
      || byPercent.get(fallback.percent)
      || fallback;
    return normalizeCashierPreset(item, fallback);
  });

  const mergedPercents = new Set(mergedDefaults.map(p => p.percent));
  const extra = source
    .filter(item => !mergedDefaults.some(p => p.id === item.id))
    .filter(item => !mergedPercents.has(clampPercent(item.percent, 0)))
    .map((item, index) => normalizeCashierPreset(item, createCashierDiscountPreset({
      id: item.id || `preset-extra-${index}`,
      percent: item.percent,
      name: item.name,
      activeOnCashier: item.activeOnCashier,
      allowedRole: item.allowedRole,
    })));

  const presets = dedupeCashierPresetsByPercent([...mergedDefaults, ...extra]);
  const seenIds = new Set();
  for (const preset of presets) {
    let id = preset.id;
    while (seenIds.has(id)) {
      id = `${preset.id}-${Math.random().toString(36).slice(2, 5)}`;
    }
    preset.id = id;
    seenIds.add(id);
  }

  return { cashierPresets: presets };
}

const DEFAULT_PRESET_IDS = new Set(['preset-5', 'preset-10', 'preset-15']);

/** @param {CashierDiscountPreset[]} presets */
function dedupeCashierPresetsByPercent(presets) {
  const byPercent = new Map();
  for (const preset of presets) {
    const existing = byPercent.get(preset.percent);
    if (!existing) {
      byPercent.set(preset.percent, preset);
      continue;
    }
    byPercent.set(preset.percent, pickPreferredCashierPreset(existing, preset));
  }
  return [...byPercent.values()].sort((a, b) => a.percent - b.percent);
}

/** @param {CashierDiscountPreset} a @param {CashierDiscountPreset} b */
function pickPreferredCashierPreset(a, b) {
  if (DEFAULT_PRESET_IDS.has(a.id) && !DEFAULT_PRESET_IDS.has(b.id)) return a;
  if (DEFAULT_PRESET_IDS.has(b.id) && !DEFAULT_PRESET_IDS.has(a.id)) return b;
  if (isDiscountActiveOnChannels(a) && !isDiscountActiveOnChannels(b)) return a;
  if (isDiscountActiveOnChannels(b) && !isDiscountActiveOnChannels(a)) return b;
  return a;
}

/** @param {DiscountSettingsDoc} settings */
export function validateDiscountSettings(settings) {
  const presets = (settings.cashierPresets || []).filter(isDiscountActiveOnChannels);
  const percents = presets.map(p => p.percent);
  if (new Set(percents).size !== percents.length) {
    throw new Error('Проценты скидок не должны повторяться');
  }
  for (const preset of presets) {
    if (preset.percent < 1 || preset.percent > 100) {
      throw new Error('Процент скидки должен быть от 1 до 100');
    }
    if (!preset.id) {
      throw new Error('У каждой скидки должен быть идентификатор');
    }
  }
}

/** @param {Partial<DiscountSettingsDoc>} settings */
export function buildDiscountSettingsPayload(settings) {
  const normalized = normalizeDiscountSettings(settings);
  validateDiscountSettings(normalized);
  return {
    cashierPresets: normalized.cashierPresets
      .filter(isDiscountActiveOnChannels)
      .map(p => ({
      id: p.id,
      name: p.name || '',
      percent: p.percent,
      activeOnCashier: p.activeOnCashier === true,
      allowedRole: p.allowedRole,
      applyOnPos: p.applyOnPos === true,
      applyOnWeb: p.applyOnWeb === true,
      applyOnKiosk: p.applyOnKiosk === true,
    })),
  };
}

/** @param {CashierDiscountPreset[]} presets */
export function suggestCashierDiscountPercent(presets) {
  const used = new Set(presets.map(p => p.percent));
  for (const percent of [5, 10, 15, 20, 25, 30]) {
    if (!used.has(percent)) return percent;
  }
  let candidate = Math.max(0, ...presets.map(p => p.percent)) + 5;
  while (used.has(candidate) && candidate <= 100) candidate += 5;
  return Math.min(100, candidate);
}

/** @param {CashierDiscountPreset} preset */
export function formatCashierDiscountLabel(preset) {
  if (preset.name?.trim()) return preset.name.trim();
  return `Скидка ${preset.percent}%`;
}
