/** @param {string} color */
function normalizeHexColor(color) {
  if (typeof color !== 'string') return '';
  const trimmed = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return '';
}

export const CASHIER_THEME_STYLE_ID = 'cashier-theme-overrides';

/** @typedef {Record<keyof typeof DEFAULT_CASHIER_THEME, string>} CashierTheme */

export const DEFAULT_CASHIER_THEME = {
  pageBg: '#9DB7C6',
  backdropBg: '#5A7285',
  headerBg: '#E6E9EE',
  panelBg: '#E6E9EE',
  functionsStripBg: '#CDD8E0',
  guestBg: '#B8C9D9',
  capsuleBg: '#B8C4CE',
  modalPanelBg: '#DBE4E9',
  numpadKeyBg: '#DBE4E9',
  text: '#1A202C',
  textMuted: '#5A6573',
  payGreen: '#22C55E',
  paySteel: '#94A3B8',
  exitCoral: '#FF5C5C',
  modalAccent: '#7A9EB8',
  selectedMarker: '#F43F5E',
};

/** @type {{ id: string; label: string; fields: { key: keyof CashierTheme; label: string; hint?: string }[] }[]} */
export const CASHIER_THEME_GROUPS = [
  {
    id: 'backgrounds',
    label: 'Фоны',
    fields: [
      { key: 'pageBg', label: 'Фон экрана', hint: 'Auth и продажи' },
      { key: 'backdropBg', label: 'Подложка вокруг viewport', hint: 'html, body, #app' },
      { key: 'headerBg', label: 'Шапка', hint: 'ct-header' },
      { key: 'panelBg', label: 'Панели чека и каталога', hint: 'Сетка товаров, список чека, итоги' },
      { key: 'functionsStripBg', label: 'Плашка инструментов', hint: 'Toolbar чека: ±, скидка, удаление' },
      { key: 'guestBg', label: 'Полоска гостя', hint: 'ct-guest-bar' },
      { key: 'capsuleBg', label: 'Капсула пути каталога', hint: 'Хлебные крошки внизу каталога' },
      { key: 'modalPanelBg', label: 'Подложка модалок', hint: 'Guest picker, оплата' },
      { key: 'numpadKeyBg', label: 'Клавиши numpad', hint: 'PIN, количество, скидка' },
    ],
  },
  {
    id: 'text',
    label: 'Текст',
    fields: [
      { key: 'text', label: 'Основной текст', hint: '--ct-text' },
      { key: 'textMuted', label: 'Вторичный текст', hint: 'Подписи, пустые состояния' },
    ],
  },
  {
    id: 'actions',
    label: 'Кнопки и акценты',
    fields: [
      { key: 'payGreen', label: 'Оплата / подтверждение', hint: 'ЧЕК, ВВОД, primary' },
      { key: 'paySteel', label: 'Вторичные действия', hint: 'КАРТА, ПЛАТЕЖИ' },
      { key: 'exitCoral', label: 'Выход / отмена', hint: 'ВЫХОД, заголовки ошибок' },
      { key: 'modalAccent', label: 'Акцент модалок', hint: 'Auth bar, guest picker active' },
      { key: 'selectedMarker', label: 'Выделение в чеке', hint: 'Маркер и фон выбранной строки' },
    ],
  },
];

/** @param {string} hex @param {number} amount */
function darkenHex(hex, amount = 24) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return hex;
  const num = parseInt(normalized.slice(1), 16);
  const r = Math.max(0, ((num >> 16) & 255) - amount);
  const g = Math.max(0, ((num >> 8) & 255) - amount);
  const b = Math.max(0, (num & 255) - amount);
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** @param {string} hex @param {number} alpha */
function hexToRgba(hex, alpha) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return `rgba(244, 63, 94, ${alpha})`;
  const num = parseInt(normalized.slice(1), 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** @param {Partial<CashierTheme> | null | undefined} value */
export function normalizeCashierTheme(value) {
  /** @type {CashierTheme} */
  const result = { ...DEFAULT_CASHIER_THEME };
  if (!value || typeof value !== 'object') return result;

  for (const key of Object.keys(DEFAULT_CASHIER_THEME)) {
    const raw = value[key];
    if (typeof raw === 'string') {
      const hex = normalizeHexColor(raw);
      if (hex) result[key] = hex;
    }
  }
  return result;
}

/** @param {CashierTheme | null | undefined} theme */
export function isDefaultCashierTheme(theme) {
  if (!theme) return true;
  const normalized = normalizeCashierTheme(theme);
  return Object.keys(DEFAULT_CASHIER_THEME).every(
    key => normalized[key] === DEFAULT_CASHIER_THEME[key],
  );
}

/** @param {CashierTheme} theme */
export function buildCashierThemeCss(theme) {
  const t = normalizeCashierTheme(theme);
  const payGreenHover = darkenHex(t.payGreen);
  const exitCoralHover = darkenHex(t.exitCoral);
  const modalAccentHover = darkenHex(t.modalAccent);
  const selectedRow = hexToRgba(t.selectedMarker, 0.14);

  return `
html, body, #app {
  --ct-backdrop-bg: ${t.backdropBg};
}

.ct-viewport {
  background: ${t.pageBg};
}

.ct-auth-screen,
.ct-sales-screen {
  --ct-page-bg: ${t.pageBg};
  --ct-header-bg: ${t.headerBg};
  --ct-panel-bg: ${t.panelBg};
  --ct-receipt-area: ${t.panelBg};
  --ct-functions-strip-bg: ${t.functionsStripBg};
  --ct-toolbar-bg: ${t.functionsStripBg};
  --ct-nav-bg: ${t.functionsStripBg};
  --ct-guest-bg: ${t.guestBg};
  --ct-guest-empty: ${t.guestBg};
  --ct-totals-bg: ${t.panelBg};
  --ct-selected-row: ${selectedRow};
  --ct-selected-marker: ${t.selectedMarker};
  --ct-pay-green: ${t.payGreen};
  --ct-pay-green-hover: ${payGreenHover};
  --ct-pay-steel: ${t.paySteel};
  --ct-exit-coral: ${t.exitCoral};
  --ct-exit-coral-hover: ${exitCoralHover};
  --ct-capsule-bg: ${t.capsuleBg};
  --ct-text: ${t.text};
  --ct-text-muted: ${t.textMuted};
  --ct-numpad-key-bg: ${t.numpadKeyBg};
  --ct-modal-panel-bg: ${t.modalPanelBg};
  --ct-modal-accent: ${t.modalAccent};
  --ct-modal-accent-hover: ${modalAccentHover};
}
`.trim();
}

/** @param {CashierTheme | null | undefined} theme */
export function applyCashierTheme(theme) {
  if (!theme || isDefaultCashierTheme(theme)) {
    clearCashierTheme();
    return;
  }

  let el = document.getElementById(CASHIER_THEME_STYLE_ID);
  if (!el) {
    el = document.createElement('style');
    el.id = CASHIER_THEME_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = buildCashierThemeCss(theme);
}

export function clearCashierTheme() {
  document.getElementById(CASHIER_THEME_STYLE_ID)?.remove();
}

/**
 * @param {CashierTheme} theme
 * @param {HTMLElement} root
 */
export function applyCashierThemePreview(theme, root) {
  const t = normalizeCashierTheme(theme);
  const payGreenHover = darkenHex(t.payGreen);
  const exitCoralHover = darkenHex(t.exitCoral);
  const modalAccentHover = darkenHex(t.modalAccent);
  const selectedRow = hexToRgba(t.selectedMarker, 0.14);

  root.style.setProperty('--ct-page-bg', t.pageBg);
  root.style.setProperty('--ct-header-bg', t.headerBg);
  root.style.setProperty('--ct-panel-bg', t.panelBg);
  root.style.setProperty('--ct-functions-strip-bg', t.functionsStripBg);
  root.style.setProperty('--ct-guest-bg', t.guestBg);
  root.style.setProperty('--ct-capsule-bg', t.capsuleBg);
  root.style.setProperty('--ct-text', t.text);
  root.style.setProperty('--ct-text-muted', t.textMuted);
  root.style.setProperty('--ct-pay-green', t.payGreen);
  root.style.setProperty('--ct-pay-green-hover', payGreenHover);
  root.style.setProperty('--ct-pay-steel', t.paySteel);
  root.style.setProperty('--ct-exit-coral', t.exitCoral);
  root.style.setProperty('--ct-exit-coral-hover', exitCoralHover);
  root.style.setProperty('--ct-modal-accent', t.modalAccent);
  root.style.setProperty('--ct-modal-accent-hover', modalAccentHover);
  root.style.setProperty('--ct-selected-row', selectedRow);
  root.style.setProperty('--ct-selected-marker', t.selectedMarker);
}

/** @returns {CashierTheme} */
export function getDefaultCashierTheme() {
  return { ...DEFAULT_CASHIER_THEME };
}
