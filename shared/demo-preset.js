/** @typedef {{ id: string; name: string; email: string }} DemoServiceUser */
/** @typedef {{ logoDataUrl: string | null; themePrimary: string; serviceUsers: DemoServiceUser[]; applied: boolean }} DemoPreset */

export const DEMO_PRESET_STORAGE_KEY = 'ifcm-demo-preset';
export const DEMO_PRESET_EVENT = 'demo-preset-applied';
export const DEFAULT_THEME_PRIMARY = '#1E1B4B';
export const DEFAULT_EMAIL_DOMAIN = '@ifcm.demo';

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
    serviceUsers: DEFAULT_SERVICE_USERS.map(u => ({ ...u })),
    applied: false,
  };
}

/** @returns {DemoPreset | null} */
export function loadPreset() {
  try {
    const raw = sessionStorage.getItem(DEMO_PRESET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizePreset(parsed);
  } catch {
    return null;
  }
}

/** @param {Partial<DemoPreset> | null | undefined} value */
function normalizePreset(value) {
  const base = getDefaultPreset();
  if (!value || typeof value !== 'object') return base;

  return {
    logoDataUrl: typeof value.logoDataUrl === 'string' ? value.logoDataUrl : null,
    themePrimary: normalizeHexColor(value.themePrimary) || DEFAULT_THEME_PRIMARY,
    serviceUsers: Array.isArray(value.serviceUsers) && value.serviceUsers.length
      ? value.serviceUsers.map(u => ({
        id: String(u.id || u.email || ''),
        name: String(u.name || ''),
        email: String(u.email || ''),
      }))
      : base.serviceUsers.map(u => ({ ...u })),
    applied: Boolean(value.applied),
  };
}

/** @param {DemoPreset} preset */
export function savePreset(preset) {
  sessionStorage.setItem(DEMO_PRESET_STORAGE_KEY, JSON.stringify(normalizePreset(preset)));
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

/** @param {string} color */
function primaryDark(color) {
  const hex = normalizeHexColor(color) || DEFAULT_THEME_PRIMARY;
  const num = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((num >> 16) & 255) - 24);
  const g = Math.max(0, ((num >> 8) & 255) - 24);
  const b = Math.max(0, (num & 255) - 24);
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
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

/** @param {DemoPreset} preset */
export function applyPreset(preset) {
  const normalized = normalizePreset({ ...preset, applied: true });
  savePreset(normalized);
  applyThemeColor(normalized.themePrimary);
  refreshBrandLogos(normalized.logoDataUrl);
  document.documentElement.classList.add('demo-preset-active');
  window.dispatchEvent(new CustomEvent(DEMO_PRESET_EVENT, { detail: normalized }));
  return normalized;
}

/**
 * @param {{ applyTheme?: boolean; fallbackLogoUrl?: string }} [options]
 */
export function initDemoPreset({ applyTheme = true, fallbackLogoUrl = null } = {}) {
  const preset = loadPreset();
  if (preset?.applied) {
    if (applyTheme) applyThemeColor(preset.themePrimary);
    refreshBrandLogos(preset.logoDataUrl, fallbackLogoUrl);
    document.documentElement.classList.add('demo-preset-active');
  }

  window.addEventListener(DEMO_PRESET_EVENT, event => {
    const detail = /** @type {CustomEvent<DemoPreset>} */ (event).detail;
    if (!detail) return;
    if (applyTheme) applyThemeColor(detail.themePrimary);
    refreshBrandLogos(detail.logoDataUrl, fallbackLogoUrl);
  });
}

/** @param {string} fallback */
export function getBrandLogoUrl(fallback) {
  const preset = loadPreset();
  if (preset?.applied && preset.logoDataUrl) return preset.logoDataUrl;
  return fallback;
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
