import { normalizeModifierGroupIds } from './menu-catalog.js';

/** Category for composite lunch items in the shared catalog. */
export const LUNCH_ITEM_CATEGORY = 'Комплексные обеды';
/**
 * @typedef {{ id: string, name: string, itemIds: string[] }} LunchStep
 * @typedef {object} CompositeLunchItem
 * @property {string} id
 * @property {string} name
 * @property {number} price
 * @property {boolean} isComposite
 * @property {boolean} [isAvailable]
 * @property {boolean} [visibleInWeb]
 * @property {boolean} [visibleInKiosk]
 * @property {string|null} [availabilityRuleId]
 * @property {string[]} [allowedPaymentMethods]
 * @property {string[]} [modifierGroupIds]
 * @property {LunchStep[]} [lunchSteps]
 * @property {string} [category]
 * @property {string} [description]
 */

export const LUNCH_ACTIVITY_MODES = [
  { id: 'active', label: 'Активен' },
  { id: 'inactive', label: 'Не активен' },
];

/** @param {object} [item] */
export function isCompositeItem(item) {
  return item?.isComposite === true;
}

/**
 * Нормализует признак составности: отсутствующее поле = обычный товар.
 * @param {object} item
 */
export function normalizeCatalogItem(item) {
  return {
    ...item,
    isComposite: item?.isComposite === true,
  };
}

/** @param {boolean} isAvailable */
export function resolveLunchActivityMode(isAvailable) {
  return isAvailable !== false ? 'active' : 'inactive';
}

/** @param {'active'|'inactive'|string} mode */
export function lunchActivityFromMode(mode) {
  return mode !== 'inactive';
}

/** @param {unknown} value */
export function parseLunchPrice(value) {
  const raw = String(value ?? '').trim().replace(/руб\.?/gi, '').replace(/\s+/g, '');
  if (!raw) return 0;
  const match = raw.match(/^(\d+(?:[.,]\d+)?)/);
  if (!match) return 0;
  const num = Number(match[1].replace(',', '.'));
  return Number.isFinite(num) ? Math.max(0, num) : 0;
}

/** @param {number} price */
export function formatLunchPrice(price) {
  const n = Math.max(0, Number(price) || 0);
  return n ? `${n} руб` : '0';
}

/** @param {LunchStep} step */
function normalizeLunchStep(step) {
  return {
    id: String(step?.id || '').trim(),
    name: String(step?.name || '').trim(),
    itemIds: [...new Set((step?.itemIds || []).map(id => String(id).trim()).filter(Boolean))],
  };
}

/** @param {CompositeLunchItem} lunch */
export function normalizeCompositeLunch(lunch) {
  const steps = (lunch?.lunchSteps || [])
    .map(normalizeLunchStep)
    .filter(s => s.id && s.name);
  return {
    id: String(lunch?.id || '').trim(),
    name: String(lunch?.name || '').trim(),
    price: Math.max(0, Number(lunch?.price) || 0),
    isComposite: true,
    isAvailable: lunch?.isAvailable !== false,
    visibleInWeb: lunch?.visibleInWeb !== false,
    visibleInKiosk: lunch?.visibleInKiosk === true,
    availabilityRuleId: lunch?.availabilityRuleId || null,
    allowedPaymentMethods: [...new Set((lunch?.allowedPaymentMethods || []).map(String).filter(Boolean))],
    modifierGroupIds: normalizeModifierGroupIds(lunch?.modifierGroupIds),
    lunchSteps: steps,
    category: LUNCH_ITEM_CATEGORY,
    description: String(lunch?.description || '').trim(),
  };
}

/** @param {CompositeLunchItem} lunch */
export function buildCompositeLunchFirestorePayload(lunch) {
  const normalized = normalizeCompositeLunch(lunch);
  const payload = {
    name: normalized.name,
    description: normalized.description || `Составной обед: ${normalized.lunchSteps.map(s => s.name).join(', ')}`,
    price: normalized.price,
    category: LUNCH_ITEM_CATEGORY,
    isComposite: true,
    isAvailable: normalized.isAvailable,
    visibleInWeb: normalized.visibleInWeb,
    visibleInKiosk: normalized.visibleInKiosk,
    lunchSteps: normalized.lunchSteps,
    allowedPaymentMethods: normalized.allowedPaymentMethods,
  };
  if (normalized.availabilityRuleId) {
    payload.availabilityRuleId = normalized.availabilityRuleId;
  }
  if (normalized.modifierGroupIds.length) {
    payload.modifierGroupIds = normalized.modifierGroupIds;
  }
  return payload;
}

/** @param {CompositeLunchItem} lunch */
export function lunchMetaLabel(lunch) {
  const steps = lunch.lunchSteps?.length || 0;
  const mod10 = steps % 10;
  const mod100 = steps % 100;
  const word = mod10 === 1 && mod100 !== 11
    ? 'шаг'
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? 'шага'
      : 'шагов';
  const price = formatLunchPrice(lunch.price);
  return `${price} · ${steps} ${word}`;
}

/** @param {Array<{ id: string, name?: string }>} catalogItems @param {string[]} itemIds */
export function resolveStepItemNames(catalogItems, itemIds) {
  const byId = new Map(catalogItems.map(i => [i.id, i.name || '—']));
  return itemIds.map(id => byId.get(id) || '—');
}
