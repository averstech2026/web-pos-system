/** POS / Cashier module channel settings and Honest Sign (ЧЗ) constants. */

export const POS_OPERATION_MODE = {
  CASHIER: 'cashier',
  SCO: 'sco',
};

export const POS_SCREEN_FORMAT = {
  POS_1024: '1024x768',
  WIDE_1920: '1920x1080',
};

export const POS_CATALOG_DISPLAY = {
  FOLDERS: 'folders',
  FLAT: 'flat',
};

/** @type {Array<{ id: string, label: string }>} */
export const POS_OPERATION_MODE_OPTIONS = [
  { id: POS_OPERATION_MODE.CASHIER, label: 'Обслуживание кассиром' },
  { id: POS_OPERATION_MODE.SCO, label: 'Самообслуживание (SCO)' },
];

/** @type {Array<{ id: string, label: string }>} */
export const POS_SCREEN_FORMAT_OPTIONS = [
  { id: POS_SCREEN_FORMAT.POS_1024, label: '1024×768 (POS-терминал)' },
  { id: POS_SCREEN_FORMAT.WIDE_1920, label: '1920×1080 (Широкоформатный)' },
];

/** @type {Array<{ id: string, label: string }>} */
export const POS_CATALOG_DISPLAY_OPTIONS = [
  { id: POS_CATALOG_DISPLAY.FOLDERS, label: 'По папкам (Иерархия)' },
  { id: POS_CATALOG_DISPLAY.FLAT, label: 'Раскрыть все товары сплошным списком' },
];

/** POS-specific payment type ids (subset of payment_methods + dotation). */
export const POS_PAYMENT_TYPE_IDS = {
  CASH: 'cash',
  CARD: 'card',
  INTERNAL: 'internal',
  DOTATION: 'dotation',
};

/** @type {Array<{ id: string, label: string }>} */
export const POS_PAYMENT_TYPE_OPTIONS = [
  { id: POS_PAYMENT_TYPE_IDS.CASH, label: 'Наличные' },
  { id: POS_PAYMENT_TYPE_IDS.CARD, label: 'Карта' },
  { id: POS_PAYMENT_TYPE_IDS.INTERNAL, label: 'Личный счёт' },
  { id: POS_PAYMENT_TYPE_IDS.DOTATION, label: 'Дотация' },
];

export const DEFAULT_POS_PAYMENT_TYPES = [
  POS_PAYMENT_TYPE_IDS.CASH,
  POS_PAYMENT_TYPE_IDS.CARD,
  POS_PAYMENT_TYPE_IDS.INTERNAL,
  POS_PAYMENT_TYPE_IDS.DOTATION,
];

/** Honest Sign (Честный Знак) product categories. */
export const HONEST_SIGN_CATEGORIES = [
  { id: 'dairy', label: 'Молочная продукция' },
  { id: 'water', label: 'Вода' },
  { id: 'packaged_water', label: 'Упакованная вода' },
  { id: 'non_alcoholic_beer', label: 'Безалкогольное пиво' },
];

/** Default tile colors per category group name. */
export const DEFAULT_CATEGORY_COLORS = {
  'Первые блюда': '#B8CCE0',
  'Вторые блюда': '#6BA3C7',
  'Салаты': '#A8D5BA',
  'Напитки': '#C5D8E8',
  'Выпечка': '#E8D4B8',
};

export const POS_SOFTWARE_VERSION = '2.0.0.2043 от 23.09.2025';
export const POS_SUPPORT_PHONE = '+7 (495) 215-03-47';
export const POS_TERMINAL_NAME = 'Касса 3 ТПУ: RNB3';
export const DEFAULT_POS_STATION_NAME = POS_TERMINAL_NAME;
export const DEFAULT_POS_POINT_NAME = 'Столовая Ст_Касса1';

/** @param {string} [raw] */
export function normalizePosOperationMode(raw) {
  return raw === POS_OPERATION_MODE.SCO ? POS_OPERATION_MODE.SCO : POS_OPERATION_MODE.CASHIER;
}

/** @param {string} [raw] */
export function normalizePosScreenFormat(raw) {
  return raw === POS_SCREEN_FORMAT.WIDE_1920
    ? POS_SCREEN_FORMAT.WIDE_1920
    : POS_SCREEN_FORMAT.POS_1024;
}

/** @param {string} [raw] */
export function normalizePosCatalogDisplay(raw) {
  return raw === POS_CATALOG_DISPLAY.FLAT
    ? POS_CATALOG_DISPLAY.FLAT
    : POS_CATALOG_DISPLAY.FOLDERS;
}

/** @param {unknown} raw */
export function normalizePosPaymentTypes(raw) {
  if (!Array.isArray(raw)) return [...DEFAULT_POS_PAYMENT_TYPES];
  const allowed = new Set(POS_PAYMENT_TYPE_OPTIONS.map(o => o.id));
  const filtered = [...new Set(raw.map(String).filter(id => allowed.has(id)))];
  return filtered.length ? filtered : [...DEFAULT_POS_PAYMENT_TYPES];
}

/** @param {string} [categoryId] */
export function honestSignCategoryLabel(categoryId) {
  return HONEST_SIGN_CATEGORIES.find(c => c.id === categoryId)?.label || '';
}

/** @param {string} [categoryName] @param {string|null} [storedColor] */
export function resolveCategoryColor(categoryName, storedColor) {
  const color = String(storedColor || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(color)) return color;
  return DEFAULT_CATEGORY_COLORS[categoryName] || '#C5CED6';
}

/**
 * Normalize POS-specific fields on a sales channel document.
 * @param {object} [raw]
 */
export function normalizePosChannelSettings(raw = {}) {
  return {
    operationMode: normalizePosOperationMode(raw.operationMode),
    screenFormat: normalizePosScreenFormat(raw.screenFormat),
    catalogDisplay: normalizePosCatalogDisplay(raw.catalogDisplay),
    showProductPhotos: raw.showProductPhotos === true,
    showQueueNumber: raw.showQueueNumber === true,
    posPaymentTypes: normalizePosPaymentTypes(raw.posPaymentTypes),
    stationName: String(raw.stationName ?? '').trim() || DEFAULT_POS_STATION_NAME,
    pointName: String(raw.pointName ?? '').trim() || DEFAULT_POS_POINT_NAME,
  };
}

/** @param {object} channel */
export function toPersistedPosChannelSettings(channel = {}) {
  const n = normalizePosChannelSettings(channel);
  return {
    operationMode: n.operationMode,
    screenFormat: n.screenFormat,
    catalogDisplay: n.catalogDisplay,
    showProductPhotos: n.showProductPhotos,
    showQueueNumber: n.showQueueNumber,
    posPaymentTypes: n.posPaymentTypes,
    stationName: n.stationName,
    pointName: n.pointName,
  };
}
