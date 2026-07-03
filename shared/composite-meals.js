import { normalizeModifierGroupIds } from './menu-catalog.js';
import { resolveSalesChannelMode } from './sales-channel-modes.js';

/** Default category for legacy lunches without an explicit group. */
export const LUNCH_ITEM_CATEGORY = 'Комплексные обеды';

/**
 * @param {Partial<CompositeLunchItem>|null|undefined} lunch
 * @param {string[]} [groupNames]
 */
export function resolveLunchCategory(lunch, groupNames = []) {
  const raw = String(lunch?.category || '').trim();
  if (raw) return raw;
  if (groupNames.length) return groupNames[0];
  return LUNCH_ITEM_CATEGORY;
}

export const COMPOSITE_SET_MODES = {
  FIXED: 'fixed',
  STEPS: 'steps',
};

/**
 * @typedef {{ id: string, name: string, itemIds: string[], minPick?: number, maxPick?: number }} LunchStep
 * @typedef {{ itemId: string, quantity: number }} FixedSetItem
 * @typedef {object} CompositeLunchItem
 * @property {string} id
 * @property {string} name
 * @property {number} price
 * @property {boolean} isComposite
 * @property {'fixed'|'steps'} [compositeMode]
 * @property {FixedSetItem[]} [fixedItems]
 * @property {boolean} [isAvailable]
 * @property {boolean} [visibleInWeb]
 * @property {boolean} [visibleInKiosk]
 * @property {boolean} [visibleInPos]
 * @property {string|null} [availabilityRuleId]
 * @property {string[]} [allowedPaymentMethods]
 * @property {string[]} [modifierGroupIds]
 * @property {string[]} [allergens] — вычисляемое объединение аллергенов блюд из шагов
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

/** @param {unknown} value @param {number} [fallback] */
function parsePositiveInt(value, fallback = 1) {
  const num = Math.floor(Number(value));
  if (!Number.isFinite(num) || num < 1) return fallback;
  return num;
}

/** @param {CompositeLunchItem|object} [lunch] */
export function resolveCompositeSetMode(lunch) {
  return lunch?.compositeMode === COMPOSITE_SET_MODES.FIXED
    ? COMPOSITE_SET_MODES.FIXED
    : COMPOSITE_SET_MODES.STEPS;
}

/** @param {FixedSetItem} [entry] */
function normalizeFixedSetItem(entry) {
  return {
    itemId: String(entry?.itemId || '').trim(),
    quantity: Math.max(1, parsePositiveInt(entry?.quantity, 1)),
  };
}

/** @param {LunchStep} step */
function normalizeLunchStep(step) {
  const minPick = parsePositiveInt(step?.minPick, 1);
  const maxPick = Math.max(minPick, parsePositiveInt(step?.maxPick, 1));
  return {
    id: String(step?.id || '').trim(),
    name: String(step?.name || '').trim(),
    itemIds: [...new Set((step?.itemIds || []).map(id => String(id).trim()).filter(Boolean))],
    minPick,
    maxPick,
  };
}

/** @param {CompositeLunchItem} lunch @param {string[]} [groupNames] */
export function normalizeCompositeLunch(lunch, groupNames = []) {
  const compositeMode = resolveCompositeSetMode(lunch);
  const steps = (lunch?.lunchSteps || [])
    .map(normalizeLunchStep)
    .filter(s => s.id && s.name);
  const fixedItems = (lunch?.fixedItems || [])
    .map(normalizeFixedSetItem)
    .filter(entry => entry.itemId);
  const visibleInWeb = lunch?.visibleInWeb !== false;
  const visibleInKiosk = lunch?.visibleInKiosk === true;
  let visibleInPos = lunch?.visibleInPos === true;
  if (lunch?.visibleInPos === undefined) {
    const mode = resolveSalesChannelMode(visibleInWeb, visibleInKiosk, false);
    visibleInPos = mode === 'everywhere' || mode === 'pos' || (visibleInWeb && visibleInKiosk);
  }
  return {
    id: String(lunch?.id || '').trim(),
    name: String(lunch?.name || '').trim(),
    price: Math.max(0, Number(lunch?.price) || 0),
    isComposite: true,
    compositeMode,
    fixedItems,
    isAvailable: lunch?.isAvailable !== false,
    visibleInWeb,
    visibleInKiosk,
    visibleInPos,
    availabilityRuleId: lunch?.availabilityRuleId || null,
    allowedPaymentMethods: [...new Set((lunch?.allowedPaymentMethods || []).map(String).filter(Boolean))],
    modifierGroupIds: normalizeModifierGroupIds(lunch?.modifierGroupIds),
    lunchSteps: steps,
    category: resolveLunchCategory(lunch, groupNames),
    description: String(lunch?.description || '').trim(),
    compositionEnabled: lunch?.compositionEnabled !== false,
  };
}

/** @param {CompositeLunchItem|{ lunchSteps?: LunchStep[], fixedItems?: FixedSetItem[], compositeMode?: string }} lunch */
export function collectLunchStepItemIds(lunch) {
  const ids = new Set();
  for (const step of lunch?.lunchSteps || []) {
    for (const id of step?.itemIds || []) {
      const key = String(id).trim();
      if (key) ids.add(key);
    }
  }
  if (resolveCompositeSetMode(lunch) === COMPOSITE_SET_MODES.FIXED) {
    for (const entry of lunch?.fixedItems || []) {
      const key = String(entry?.itemId || '').trim();
      if (key) ids.add(key);
    }
  }
  return [...ids];
}

/**
 * Объединение аллергенов всех товаров, входящих в шаги ланча.
 * @param {CompositeLunchItem|{ lunchSteps?: LunchStep[] }} lunch
 * @param {Array<{ id: string, allergens?: string[] }>} [catalogItems]
 */
export function resolveInheritedLunchAllergens(lunch, catalogItems = []) {
  const byId = new Map(catalogItems.map(i => [i.id, i]));
  const allergens = new Set();
  for (const id of collectLunchStepItemIds(lunch)) {
    for (const allergenId of byId.get(id)?.allergens || []) {
      const key = String(allergenId).trim();
      if (key) allergens.add(key);
    }
  }
  return [...allergens].sort((a, b) => a.localeCompare(b, 'ru'));
}

/**
 * @param {object} item
 * @param {Array<{ id: string, allergens?: string[] }>} [catalogItems]
 */
export function resolveEffectiveItemAllergens(item, catalogItems = []) {
  if (isCompositeItem(item)) {
    return resolveInheritedLunchAllergens(item, catalogItems);
  }
  return [...new Set((item?.allergens || []).map(id => String(id).trim()).filter(Boolean))];
}

/** @param {object[]} catalogItems @param {Map<string, object>|null} [catalogById] */
export function resolveCatalogItemsById(catalogItems = [], catalogById = null) {
  const byId = catalogById instanceof Map ? new Map(catalogById) : new Map();
  for (const item of catalogItems) {
    if (item?.id && item.isComposite !== true && !byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }
  return byId;
}

/** @param {string} itemId @param {Map<string, object>} byId */
function resolveComponentItemName(itemId, byId) {
  const name = byId.get(itemId)?.name;
  return name ? String(name).trim() : '—';
}

/** @param {CompositeLunchItem} lunch @param {Array<{ id: string, name?: string }>} [catalogItems] @param {Map<string, object>|null} [catalogById] */
export function buildFixedSetLunchSelections(lunch, catalogItems = [], catalogById = null) {
  const byId = resolveCatalogItemsById(catalogItems, catalogById);
  /** @type {import('./composite-order-display.js').LunchSelection[]} */
  const selections = [];
  for (const entry of lunch.fixedItems || []) {
    const qty = Math.max(1, Number(entry.quantity) || 1);
    for (let unit = 0; unit < qty; unit += 1) {
      selections.push({
        stepId: `fixed_${entry.itemId}_${unit}`,
        stepName: '',
        itemId: entry.itemId,
        itemName: resolveComponentItemName(entry.itemId, byId),
      });
    }
  }
  return selections;
}

/** @param {CompositeLunchItem} lunch @param {Array<{ id: string, allergens?: string[] }>} [catalogItems] */
export function buildCompositeLunchFirestorePayload(lunch, catalogItems = []) {
  const normalized = normalizeCompositeLunch(lunch);
  const inheritedAllergens = resolveInheritedLunchAllergens(normalized, catalogItems);
  const mode = resolveCompositeSetMode(normalized);
  const compositionLabel = formatCompositeCompositionLabel(normalized, catalogItems);
  const payload = {
    name: normalized.name,
    description: normalized.description || (compositionLabel ? `Составной обед: ${compositionLabel}` : ''),
    price: normalized.price,
    category: normalized.category,
    isComposite: true,
    compositeMode: mode,
    isAvailable: normalized.isAvailable,
    visibleInWeb: normalized.visibleInWeb,
    visibleInKiosk: normalized.visibleInKiosk,
    visibleInPos: normalized.visibleInPos,
    allowedPaymentMethods: normalized.allowedPaymentMethods,
  };
  if (mode === COMPOSITE_SET_MODES.FIXED) {
    payload.fixedItems = normalized.fixedItems;
  } else {
    payload.lunchSteps = normalized.lunchSteps;
  }
  if (normalized.availabilityRuleId) {
    payload.availabilityRuleId = normalized.availabilityRuleId;
  }
  if (normalized.modifierGroupIds.length) {
    payload.modifierGroupIds = normalized.modifierGroupIds;
  }
  if (inheritedAllergens.length) {
    payload.allergens = inheritedAllergens;
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

/** @param {CompositeLunchItem|object} lunch @param {Array<{ id: string, name?: string }>} [catalogItems] */
export function formatCompositeCompositionLabel(lunch, catalogItems = []) {
  const normalized = normalizeCompositeLunch(lunch);
  const mode = resolveCompositeSetMode(normalized);
  if (mode === COMPOSITE_SET_MODES.FIXED) {
    const ids = (normalized.fixedItems || []).map(entry => entry.itemId).filter(Boolean);
    const names = resolveStepItemNames(catalogItems, ids).filter(name => name && name !== '—');
    if (names.length) return names.join(', ');
    return ids.length ? `${ids.length} товаров` : '';
  }
  return (normalized.lunchSteps || []).map(step => step.name).filter(Boolean).join(', ');
}

/** @param {CompositeLunchItem|object} lunch @param {Array<{ id: string, name?: string }>} [catalogItems] */
export function formatCompositeLunchDescription(lunch, catalogItems = []) {
  const label = formatCompositeCompositionLabel(lunch, catalogItems);
  return label ? `Составной обед: ${label}` : '';
}
