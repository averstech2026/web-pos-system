import {
  DEFAULT_COMPANY_NAME,
  DEFAULT_DOCUMENT_TITLE_BRAND,
  DEFAULT_SERVICE_USERS,
  DEFAULT_SUPPORT_PHONE,
  DEFAULT_THEME_PRIMARY,
  DEFAULT_LK_CARD_COLOR,
  getDefaultPreset,
  normalizeHexColor,
  normalizeLogoInvertSlots,
} from './demo-preset.js';
import { normalizeCashierTheme } from './cashier-theme.js';

export const DEMO_PRESETS_LIBRARY_KEY = 'ifcm-demo-presets-library';
export const DEMO_ACTIVE_PRESET_ID_KEY = 'ifcm-demo-active-preset-id';
export const DEFAULT_PRESET_ID = '__default__';

/** @typedef {{ id: string; name: string; email: string }} DemoServiceUser */
/** @typedef {{
 *   id: string;
 *   name: string;
 *   logo: string | null;
 *   primaryColor: string;
 *   lkCardColor: string;
 *   logoInvertSlots: import('./demo-preset-logo-invert.js').LogoInvertSlots;
 *   usersState: DemoServiceUser[];
 *   companyName: string;
 *   supportPhone: string;
 *   documentTitleBrand: string;
 *   cashierTheme: import('./cashier-theme.js').CashierTheme | null;
 *   updatedAt: number;
 * }} SavedDemoPreset */

/** @typedef {import('./demo-preset.js').DemoPreset} DemoPreset */

/** @returns {SavedDemoPreset[]} */
export function loadSavedPresets() {
  try {
    const raw = localStorage.getItem(DEMO_PRESETS_LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeSavedPreset).filter(Boolean);
  } catch {
    return [];
  }
}

/** @param {SavedDemoPreset[]} presets */
export function saveSavedPresets(presets) {
  localStorage.setItem(
    DEMO_PRESETS_LIBRARY_KEY,
    JSON.stringify(presets.map(normalizeSavedPreset)),
  );
}

/** @param {Partial<SavedDemoPreset> | null | undefined} value */
function normalizeSavedPreset(value) {
  if (!value || typeof value !== 'object' || !value.id || !value.name) return null;

  return {
    id: String(value.id),
    name: String(value.name).trim(),
    logo: typeof value.logo === 'string' ? value.logo : null,
    primaryColor: normalizeHexColor(value.primaryColor) || DEFAULT_THEME_PRIMARY,
    lkCardColor: normalizeHexColor(value.lkCardColor) || DEFAULT_LK_CARD_COLOR,
    logoInvertSlots: normalizeLogoInvertSlots(value.logoInvertSlots),
    usersState: Array.isArray(value.usersState) && value.usersState.length
      ? value.usersState.map(u => ({
        id: String(u.id || u.email || ''),
        name: String(u.name || ''),
        email: String(u.email || ''),
      }))
      : DEFAULT_SERVICE_USERS.map(u => ({ ...u })),
    companyName: typeof value.companyName === 'string' && value.companyName.trim()
      ? value.companyName.trim()
      : DEFAULT_COMPANY_NAME,
    supportPhone: typeof value.supportPhone === 'string' && value.supportPhone.trim()
      ? value.supportPhone.trim()
      : DEFAULT_SUPPORT_PHONE,
    documentTitleBrand: typeof value.documentTitleBrand === 'string' && value.documentTitleBrand.trim()
      ? value.documentTitleBrand.trim()
      : DEFAULT_DOCUMENT_TITLE_BRAND,
    cashierTheme: value.cashierTheme && typeof value.cashierTheme === 'object'
      ? normalizeCashierTheme(value.cashierTheme)
      : null,
    updatedAt: Number(value.updatedAt) || Date.now(),
  };
}

/** @returns {string} */
export function getActivePresetId() {
  return localStorage.getItem(DEMO_ACTIVE_PRESET_ID_KEY) || DEFAULT_PRESET_ID;
}

/** @param {string | null} presetId */
export function setActivePresetId(presetId) {
  if (!presetId || presetId === DEFAULT_PRESET_ID) {
    localStorage.removeItem(DEMO_ACTIVE_PRESET_ID_KEY);
    return;
  }
  localStorage.setItem(DEMO_ACTIVE_PRESET_ID_KEY, presetId);
}

/** @param {string} id */
export function getSavedPresetById(id) {
  return loadSavedPresets().find(p => p.id === id) || null;
}

/** @param {SavedDemoPreset} preset */
export function upsertSavedPreset(preset) {
  const normalized = normalizeSavedPreset(preset);
  if (!normalized) return null;

  const presets = loadSavedPresets();
  const index = presets.findIndex(p => p.id === normalized.id);
  if (index >= 0) presets[index] = normalized;
  else presets.unshift(normalized);

  saveSavedPresets(presets);
  return normalized;
}

/** @param {string} id */
export function deleteSavedPreset(id) {
  if (!id || id === DEFAULT_PRESET_ID) return false;
  const presets = loadSavedPresets().filter(p => p.id !== id);
  saveSavedPresets(presets);
  if (getActivePresetId() === id) setActivePresetId(null);
  return true;
}

/**
 * @param {string} name
 * @param {DemoPreset} draft
 */
export function createSavedPresetFromDraft(name, draft) {
  const trimmed = name.trim();
  if (!trimmed) return null;

  return upsertSavedPreset({
    id: String(Date.now()),
    name: trimmed,
    logo: draft.logoDataUrl,
    primaryColor: draft.themePrimary,
    lkCardColor: draft.lkCardColor,
    logoInvertSlots: draft.logoInvertSlots,
    usersState: draft.serviceUsers.map(u => ({ ...u })),
    companyName: draft.companyName,
    supportPhone: draft.supportPhone,
    documentTitleBrand: draft.documentTitleBrand,
    cashierTheme: draft.cashierTheme ? normalizeCashierTheme(draft.cashierTheme) : null,
    updatedAt: Date.now(),
  });
}

/**
 * @param {string} id
 * @param {DemoPreset} draft
 */
export function updateSavedPresetFromDraft(id, draft) {
  const existing = getSavedPresetById(id);
  if (!existing) return null;

  return upsertSavedPreset({
    ...existing,
    logo: draft.logoDataUrl,
    primaryColor: draft.themePrimary,
    lkCardColor: draft.lkCardColor,
    logoInvertSlots: draft.logoInvertSlots,
    usersState: draft.serviceUsers.map(u => ({ ...u })),
    companyName: draft.companyName,
    supportPhone: draft.supportPhone,
    documentTitleBrand: draft.documentTitleBrand,
    cashierTheme: draft.cashierTheme ? normalizeCashierTheme(draft.cashierTheme) : null,
    updatedAt: Date.now(),
  });
}

/** @param {SavedDemoPreset} saved */
export function savedPresetToDemoPreset(saved) {
  return {
    logoDataUrl: saved.logo,
    themePrimary: saved.primaryColor,
    lkCardColor: saved.lkCardColor,
    logoInvertSlots: saved.logoInvertSlots,
    companyName: saved.companyName,
    supportPhone: saved.supportPhone,
    documentTitleBrand: saved.documentTitleBrand,
    cashierTheme: saved.cashierTheme ? normalizeCashierTheme(saved.cashierTheme) : null,
    serviceUsers: saved.usersState.map(u => ({ ...u })),
    applied: true,
  };
}

/** @param {DemoPreset} draft */
export function demoPresetToSavedSnapshot(draft, name, id = String(Date.now())) {
  return normalizeSavedPreset({
    id,
    name,
    logo: draft.logoDataUrl,
    primaryColor: draft.themePrimary,
    lkCardColor: draft.lkCardColor,
    logoInvertSlots: draft.logoInvertSlots,
    usersState: draft.serviceUsers,
    companyName: draft.companyName,
    supportPhone: draft.supportPhone,
    documentTitleBrand: draft.documentTitleBrand,
    cashierTheme: draft.cashierTheme ? normalizeCashierTheme(draft.cashierTheme) : null,
    updatedAt: Date.now(),
  });
}

/** @returns {DemoPreset} */
export function getDefaultDemoPresetState() {
  return getDefaultPreset();
}
