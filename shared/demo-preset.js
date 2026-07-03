import {
  applyCashierTheme,
  clearCashierTheme,
  normalizeCashierTheme,
} from './cashier-theme.js';
import { POS_SUPPORT_PHONE } from './pos-channel.js';
import {
  applyLogoInvertSlots,
  DEFAULT_LOGO_INVERT,
  normalizeLogoInvertSlots,
} from './demo-preset-logo-invert.js';
import {
  fetchDemoPresetRuntimeDoc,
  publishDemoPresetRuntimeDoc,
  subscribeDemoPresetRuntimeDoc,
} from './demo-preset-sync.js';

export { DEFAULT_LOGO_INVERT, LOGO_INVERT_SLOT_META, normalizeLogoInvertSlots } from './demo-preset-logo-invert.js';

/** @typedef {{ id: string; name: string; email: string }} DemoServiceUser */
/** @typedef {{
 *   logoDataUrl: string | null;
 *   themePrimary: string;
 *   lkCardColor: string;
 *   logoInvertSlots: import('./demo-preset-logo-invert.js').LogoInvertSlots;
 *   companyName: string;
 *   supportPhone: string;
 *   documentTitleBrand: string;
 *   serviceUsers: DemoServiceUser[];
 *   cashierTheme: import('./cashier-theme.js').CashierTheme | null;
 *   applied: boolean;
 * }} DemoPreset */

export const DEMO_PRESET_STORAGE_KEY = 'ifcm-demo-preset';
export const DEMO_PRESET_META_KEY = 'ifcm-demo-preset-meta';
export const DEMO_PRESET_EVENT = 'demo-preset-applied';
export const DEFAULT_THEME_PRIMARY = '#1E1B4B';
export const DEFAULT_LK_CARD_COLOR = '#1E1B4B';
export const DEFAULT_EMAIL_DOMAIN = '@ifcm.demo';
export const DEFAULT_COMPANY_NAME = 'iFCM TECH';
export const DEFAULT_DOCUMENT_TITLE_BRAND = 'iFCM Lunch';
export const DEFAULT_SUPPORT_PHONE = POS_SUPPORT_PHONE;

/** @type {DemoServiceUser[]} */
export const DEFAULT_SERVICE_USERS = [
  { id: 'admin', name: 'Администратор', email: 'admin@ifcm.demo' },
  { id: 'manager', name: 'Менеджер', email: 'manager@ifcm.demo' },
  { id: 'cook', name: 'Повар', email: 'cook@ifcm.demo' },
  { id: 'cashier', name: 'Кассир', email: 'cashier@ifcm.demo' },
  { id: 'kiosk', name: 'Киоск', email: 'kiosk@ifcm.demo' },
  { id: 'pos', name: 'Кассовый модуль', email: 'pos@ifcm.demo' },
  { id: 'queue', name: 'Экран очереди', email: 'queue@ifcm.demo' },
  { id: 'ivanov', name: 'Иванов Иван Иванович', email: 'ivanov@ifcm.demo' },
  { id: 'petrova', name: 'Петрова Анна Сергеевна', email: 'petrova@ifcm.demo' },
];

/** @returns {DemoPreset} */
export function getDefaultPreset() {
  return {
    logoDataUrl: null,
    themePrimary: DEFAULT_THEME_PRIMARY,
    lkCardColor: DEFAULT_LK_CARD_COLOR,
    logoInvertSlots: normalizeLogoInvertSlots(null),
    companyName: DEFAULT_COMPANY_NAME,
    supportPhone: DEFAULT_SUPPORT_PHONE,
    documentTitleBrand: DEFAULT_DOCUMENT_TITLE_BRAND,
    serviceUsers: DEFAULT_SERVICE_USERS.map(u => ({ ...u })),
    cashierTheme: null,
    applied: false,
  };
}

/** @returns {DemoPreset | null} */
export function loadPreset() {
  try {
    const raw = localStorage.getItem(DEMO_PRESET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizePreset(parsed);
  } catch {
    return null;
  }
}

/** @returns {{ updatedAt: number }} */
function loadPresetMeta() {
  try {
    const raw = localStorage.getItem(DEMO_PRESET_META_KEY);
    if (!raw) return { updatedAt: 0 };
    const parsed = JSON.parse(raw);
    return { updatedAt: Number(parsed?.updatedAt) || 0 };
  } catch {
    return { updatedAt: 0 };
  }
}

/** @param {{ updatedAt?: number }} meta */
function savePresetMeta(meta) {
  localStorage.setItem(DEMO_PRESET_META_KEY, JSON.stringify({
    updatedAt: Number(meta.updatedAt) || Date.now(),
  }));
}

/** @param {string | null | undefined} value @param {string} fallback */
function normalizeText(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/** @param {Partial<DemoPreset> | null | undefined} value */
function normalizePreset(value) {
  const base = getDefaultPreset();
  if (!value || typeof value !== 'object') return base;

  return {
    logoDataUrl: typeof value.logoDataUrl === 'string' ? value.logoDataUrl : null,
    themePrimary: normalizeHexColor(value.themePrimary) || DEFAULT_THEME_PRIMARY,
    lkCardColor: normalizeHexColor(value.lkCardColor) || DEFAULT_LK_CARD_COLOR,
    logoInvertSlots: normalizeLogoInvertSlots(value.logoInvertSlots),
    companyName: normalizeText(value.companyName, DEFAULT_COMPANY_NAME),
    supportPhone: normalizeText(value.supportPhone, DEFAULT_SUPPORT_PHONE),
    documentTitleBrand: normalizeText(value.documentTitleBrand, DEFAULT_DOCUMENT_TITLE_BRAND),
    serviceUsers: Array.isArray(value.serviceUsers) && value.serviceUsers.length
      ? value.serviceUsers.map(u => ({
        id: String(u.id || u.email || ''),
        name: String(u.name || ''),
        email: String(u.email || ''),
      }))
      : base.serviceUsers.map(u => ({ ...u })),
    cashierTheme: value.cashierTheme && typeof value.cashierTheme === 'object'
      ? normalizeCashierTheme(value.cashierTheme)
      : null,
    applied: Boolean(value.applied),
  };
}

/** @param {DemoPreset} preset @param {{ updatedAt?: number }} [meta] */
export function savePreset(preset, meta = {}) {
  localStorage.setItem(DEMO_PRESET_STORAGE_KEY, JSON.stringify(normalizePreset(preset)));
  savePresetMeta({ updatedAt: meta.updatedAt ?? Date.now() });
}

/** @param {Record<string, unknown> | null | undefined} data */
function runtimeDocToPreset(data) {
  if (!data || typeof data !== 'object') return null;
  return normalizePreset({
    logoDataUrl: data.logoDataUrl,
    themePrimary: data.themePrimary,
    lkCardColor: data.lkCardColor,
    logoInvertSlots: data.logoInvertSlots,
    companyName: data.companyName,
    supportPhone: data.supportPhone,
    documentTitleBrand: data.documentTitleBrand,
    serviceUsers: data.serviceUsers,
    cashierTheme: data.cashierTheme,
    applied: data.applied,
  });
}

/** @param {string | null | undefined} activePresetId @param {DemoPreset} preset @param {number} updatedAt */
async function publishDemoPresetRuntime(activePresetId, preset, updatedAt) {
  await publishDemoPresetRuntimeDoc({
    activePresetId: activePresetId || null,
    logoDataUrl: preset.logoDataUrl,
    themePrimary: preset.themePrimary,
    lkCardColor: preset.lkCardColor,
    logoInvertSlots: preset.logoInvertSlots,
    companyName: preset.companyName,
    supportPhone: preset.supportPhone,
    documentTitleBrand: preset.documentTitleBrand,
    serviceUsers: preset.serviceUsers,
    cashierTheme: preset.cashierTheme,
    applied: Boolean(preset.applied),
    updatedAt,
  });
}

/** @type {number} */
let lastRemoteUpdatedAt = loadPresetMeta().updatedAt;

/** @returns {Promise<{ preset: DemoPreset; activePresetId: string | null; updatedAt: number } | null>} */
async function fetchDemoPresetRuntime() {
  const data = await fetchDemoPresetRuntimeDoc();
  if (!data) return null;

  const preset = runtimeDocToPreset(data);
  if (!preset) return null;

  return {
    preset,
    activePresetId: typeof data.activePresetId === 'string' ? data.activePresetId : null,
    updatedAt: Number(data.updatedAt) || 0,
  };
}

/** @param {string} color */
export function normalizeHexColor(color) {
  if (typeof color !== 'string') return '';
  const trimmed = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return '';
}

/** @param {DemoPreset | null | undefined} preset */
function resolveBranding(preset) {
  const normalized = normalizePreset(preset);
  const active = Boolean(normalized.applied);

  return {
    companyName: active ? normalized.companyName : DEFAULT_COMPANY_NAME,
    supportPhone: active ? normalized.supportPhone : DEFAULT_SUPPORT_PHONE,
    documentTitleBrand: active ? normalized.documentTitleBrand : DEFAULT_DOCUMENT_TITLE_BRAND,
  };
}

/** @param {string} color */
function primaryDark(color) {
  const hex = normalizeHexColor(color) || DEFAULT_THEME_PRIMARY;
  const num = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((num >> 16) & 255) - 24);
  const g = Math.max(0, ((num >> 8) & 255) - 24);
  const b = Math.max(0, (num & 255) - 24);
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** @param {number} value */
function clampChannel(value) {
  return Math.min(255, Math.max(0, Math.round(value)));
}

/** @param {string} color */
export function deriveLkCardPalette(color) {
  const hex = normalizeHexColor(color) || DEFAULT_LK_CARD_COLOR;
  const num = parseInt(hex.slice(1), 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;

  const mix = (mulR, mulG, mulB) =>
    `#${[
      clampChannel(r * mulR),
      clampChannel(g * mulG),
      clampChannel(b * mulB),
    ].map(v => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

  return {
    start: mix(53 / 30, 49 / 27, 127 / 75),
    mid: mix(40 / 30, 37 / 27, 106 / 75),
    base: hex,
    dark: primaryDark(hex),
    glow: `${clampChannel(r * 2.4)}, ${clampChannel(g * 2.52)}, ${clampChannel(b * 2.13)}`,
    shade: `${clampChannel(r * 1.27)}, ${clampChannel(g * 1.26)}, ${clampChannel(b * 1.33)}`,
    shadow: `${r}, ${g}, ${b}`,
  };
}

/** @param {DemoPreset | null | undefined} [preset] */
function resolveLkCardColor(preset) {
  const normalized = normalizePreset(preset);
  return normalized.applied ? normalized.lkCardColor : DEFAULT_LK_CARD_COLOR;
}

/** @param {string} color */
export function applyLkCardColor(color) {
  const palette = deriveLkCardPalette(color);
  const root = document.documentElement;
  root.style.setProperty('--lk-card-gradient-start', palette.start);
  root.style.setProperty('--lk-card-gradient-mid', palette.mid);
  root.style.setProperty('--lk-card-base', palette.base);
  root.style.setProperty('--lk-card-dark', palette.dark);
  root.style.setProperty('--lk-card-glow', palette.glow);
  root.style.setProperty('--lk-card-shade', palette.shade);
  root.style.setProperty('--lk-card-shadow', palette.shadow);
}

/** @param {DemoPreset | null | undefined} [preset] */
function syncLogoInvertSlots(preset = loadPreset()) {
  const normalized = normalizePreset(preset);
  const slots = normalized.applied
    ? normalized.logoInvertSlots
    : DEFAULT_LOGO_INVERT;
  applyLogoInvertSlots(slots);
}

/** @param {string} color */
export function applyThemeColor(color) {
  const hex = normalizeHexColor(color) || DEFAULT_THEME_PRIMARY;
  const root = document.documentElement;
  root.style.setProperty('--theme-primary', hex);
  root.style.setProperty('--color-navy', hex);
  root.style.setProperty('--color-primary', hex);
  root.style.setProperty('--color-primary-dark', primaryDark(hex));
}

/** @param {string | null | undefined} logoDataUrl @param {string | null | undefined} fallbackUrl */
export function refreshBrandLogos(logoDataUrl, fallbackUrl = null) {
  const src = logoDataUrl || fallbackUrl;
  if (!src) return;

  document.querySelectorAll('[data-brand-logo], .logo-img').forEach(img => {
    if (!(img instanceof HTMLImageElement)) return;
    img.src = src;
    img.classList.toggle('brand-logo--custom', Boolean(logoDataUrl));
    img.closest('.brand-logo-wrap')?.classList.toggle('brand-logo--custom', Boolean(logoDataUrl));
  });
}

/** @param {DemoPreset | null | undefined} [preset] */
export function applyCompanyBranding(preset = loadPreset()) {
  const { companyName, supportPhone } = resolveBranding(preset);
  const supportText = `Техподдержка 24/7: ${supportPhone}`;

  document.querySelectorAll('[data-brand-logo], .logo-img').forEach(img => {
    if (img instanceof HTMLImageElement) img.alt = companyName;
  });

  document.querySelectorAll('[data-brand-support]').forEach(el => {
    el.textContent = supportText;
  });
}

/**
 * @param {string} pageLabel
 * @param {'suffix' | 'prefix'} [style]
 * @param {DemoPreset | null | undefined} [preset]
 */
export function formatDocumentTitle(pageLabel, style = 'suffix', preset = loadPreset()) {
  const { companyName, documentTitleBrand } = resolveBranding(preset);
  if (style === 'prefix') return `${companyName} — ${pageLabel}`;
  return `${pageLabel} — ${documentTitleBrand}`;
}

/**
 * @param {string} pageLabel
 * @param {'suffix' | 'prefix'} [style]
 * @param {DemoPreset | null | undefined} [preset]
 */
export function setDocumentTitle(pageLabel, style = 'suffix', preset = loadPreset()) {
  document.title = formatDocumentTitle(pageLabel, style, preset);
}

/** @param {DemoPreset | null | undefined} [preset] */
function syncCashierTheme(preset = loadPreset()) {
  const normalized = normalizePreset(preset);
  if (normalized.applied && normalized.cashierTheme) {
    applyCashierTheme(normalized.cashierTheme);
    return;
  }
  clearCashierTheme();
}

/** @param {DemoPreset} preset @param {{ activePresetId?: string | null; syncRemote?: boolean }} [options] */
export function applyPreset(preset, { activePresetId = null, syncRemote = true } = {}) {
  const normalized = normalizePreset({ ...preset, applied: true });
  const updatedAt = Date.now();
  lastRemoteUpdatedAt = updatedAt;
  savePreset(normalized, { updatedAt });
  applyThemeColor(normalized.themePrimary);
  applyLkCardColor(normalized.lkCardColor);
  syncLogoInvertSlots(normalized);
  syncCashierTheme(normalized);
  refreshBrandLogos(normalized.logoDataUrl);
  applyCompanyBranding(normalized);
  document.documentElement.classList.add('demo-preset-active');
  window.dispatchEvent(new CustomEvent(DEMO_PRESET_EVENT, { detail: normalized }));
  if (syncRemote) {
    void publishDemoPresetRuntime(activePresetId, normalized, updatedAt);
  }
  return normalized;
}

/** @param {string | null | undefined} [fallbackLogoUrl] @param {{ activePresetId?: string | null; syncRemote?: boolean }} [options] */
export function resetAppliedPreset(fallbackLogoUrl = null, { activePresetId = null, syncRemote = true } = {}) {
  const normalized = getDefaultPreset();
  const updatedAt = Date.now();
  lastRemoteUpdatedAt = updatedAt;
  savePreset(normalized, { updatedAt });
  applyThemeColor(DEFAULT_THEME_PRIMARY);
  applyLkCardColor(DEFAULT_LK_CARD_COLOR);
  syncLogoInvertSlots(normalized);
  clearCashierTheme();
  refreshBrandLogos(null, fallbackLogoUrl);
  applyCompanyBranding(normalized);
  document.documentElement.classList.remove('demo-preset-active');
  window.dispatchEvent(new CustomEvent(DEMO_PRESET_EVENT, { detail: normalized }));
  if (syncRemote) {
    void publishDemoPresetRuntime(activePresetId, normalized, updatedAt);
  }
  return normalized;
}

/**
 * @param {DemoPreset | null | undefined} preset
 * @param {{ applyTheme?: boolean; fallbackLogoUrl?: string | null }} [options]
 */
function syncPresetRuntime(preset, { applyTheme = true, fallbackLogoUrl = null } = {}) {
  const normalized = normalizePreset(preset);

  if (normalized.applied) {
    if (applyTheme) applyThemeColor(normalized.themePrimary);
    applyLkCardColor(resolveLkCardColor(normalized));
    syncLogoInvertSlots(normalized);
    syncCashierTheme(normalized);
    refreshBrandLogos(normalized.logoDataUrl, fallbackLogoUrl);
    applyCompanyBranding(normalized);
    document.documentElement.classList.add('demo-preset-active');
    return;
  }

  if (applyTheme) applyThemeColor(DEFAULT_THEME_PRIMARY);
  applyLkCardColor(DEFAULT_LK_CARD_COLOR);
  syncLogoInvertSlots(normalized);
  clearCashierTheme();
  refreshBrandLogos(null, fallbackLogoUrl);
  applyCompanyBranding(normalized);
  document.documentElement.classList.remove('demo-preset-active');
}

/**
 * @param {{
 *   applyTheme?: boolean;
 *   fallbackLogoUrl?: string;
 *   documentTitle?: { page: string; style?: 'suffix' | 'prefix' };
 * }} [options]
 */
export function initDemoPreset({
  applyTheme = true,
  fallbackLogoUrl = null,
  documentTitle = null,
} = {}) {
  const runtimeOptions = { applyTheme, fallbackLogoUrl };

  const sync = (preset = loadPreset()) => {
    syncPresetRuntime(preset, runtimeOptions);
    if (documentTitle) {
      setDocumentTitle(documentTitle.page, documentTitle.style || 'suffix', preset);
    }
  };

  const applyRemoteRuntime = payload => {
    if (!payload) return;
    if (payload.updatedAt <= lastRemoteUpdatedAt) return;

    lastRemoteUpdatedAt = payload.updatedAt;
    savePreset(payload.preset, { updatedAt: payload.updatedAt });
    sync(payload.preset);
    window.dispatchEvent(new CustomEvent(DEMO_PRESET_EVENT, { detail: payload.preset }));
  };

  sync();

  window.addEventListener(DEMO_PRESET_EVENT, event => {
    const detail = /** @type {CustomEvent<DemoPreset>} */ (event).detail;
    if (!detail) return;
    syncPresetRuntime(detail, runtimeOptions);
    if (documentTitle) {
      setDocumentTitle(documentTitle.page, documentTitle.style || 'suffix', detail);
    }
  });

  void fetchDemoPresetRuntime().then(payload => {
    if (payload) applyRemoteRuntime(payload);
  });

  subscribeDemoPresetRuntimeDoc(data => {
    if (!data) return;
    const preset = runtimeDocToPreset(data);
    if (!preset) return;
    applyRemoteRuntime({
      preset,
      activePresetId: typeof data.activePresetId === 'string' ? data.activePresetId : null,
      updatedAt: Number(data.updatedAt) || 0,
    });
  });
}

/** @param {string} fallback */
export function getBrandLogoUrl(fallback) {
  const preset = loadPreset();
  if (preset?.applied && preset.logoDataUrl) return preset.logoDataUrl;
  return fallback;
}

export function getCompanyName() {
  return resolveBranding(loadPreset()).companyName;
}

export function getSupportPhone() {
  return resolveBranding(loadPreset()).supportPhone;
}

export function getDocumentTitleBrand() {
  return resolveBranding(loadPreset()).documentTitleBrand;
}

/**
 * @param {string} userId
 * @param {string} fallbackEmail
 */
export function getServiceUserEmail(userId, fallbackEmail) {
  const preset = loadPreset();
  if (!preset?.applied) return fallbackEmail;
  const byId = preset.serviceUsers.find(u => u.id === userId);
  if (byId?.email) return byId.email;
  const byEmail = preset.serviceUsers.find(u => u.email === fallbackEmail);
  return byEmail?.email || fallbackEmail;
}

/**
 * @param {string} userId
 * @param {string} fallbackName
 */
export function getServiceUserName(userId, fallbackName) {
  const preset = loadPreset();
  if (!preset?.applied) return fallbackName;
  const user = preset.serviceUsers.find(u => u.id === userId);
  return user?.name || fallbackName;
}

/**
 * @param {DemoServiceUser[]} users
 * @param {string} newDomain
 */
export function bulkReplaceDomain(users, newDomain) {
  const domain = newDomain.trim();
  if (!domain) return users.map(u => ({ ...u }));

  const suffix = domain.startsWith('@') ? domain : `@${domain}`;
  return users.map(user => ({
    ...user,
    email: user.email.includes('@')
      ? user.email.replace(/@[\w.-]+$/i, suffix)
      : `${user.email}${suffix}`,
  }));
}
