import { formatAvailabilityRuleShort } from './availability-rules.js';

/** Default product categories (menu groups). */
export const DEFAULT_CATEGORIES = [
  'Первые блюда',
  'Вторые блюда',
  'Салаты',
  'Напитки',
  'Выпечка',
];

/** Default visibility for new/existing groups without explicit flags. */
export const DEFAULT_GROUP_VISIBLE_IN_WEB = true;
export const DEFAULT_GROUP_VISIBLE_IN_KIOSK = false;

/**
 * @typedef {object} CategoryGroup
 * @property {string} id
 * @property {string} name
 * @property {string|null} [imageUrl]
 * @property {string|null} [availabilityRuleId] - ref to availability_rules/{id}; null = always available
 * @property {boolean} [visibleInWeb] - show in personal account (web portal)
 * @property {boolean} [visibleInKiosk] - show on self-service kiosk
 * @property {number} [webOrder] - sort index in web menu
 * @property {number} [kioskOrder] - sort index on kiosk menu
 * @property {string[]} [modifierGroupIds] - modifier groups offered for items in this category
 */

/** @param {unknown} value @param {number} [fallback] */
export function normalizeGroupOrderIndex(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

/** @param {CategoryGroup[]} groups @param {'web'|'kiosk'} channel */
export function sortCategoryGroupsByChannel(groups, channel = 'web') {
  const key = channel === 'kiosk' ? 'kioskOrder' : 'webOrder';
  return [...groups].sort((a, b) => {
    const ao = normalizeGroupOrderIndex(a[key], 0);
    const bo = normalizeGroupOrderIndex(b[key], 0);
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name, 'ru');
  });
}

/** @param {string} name */
export function slugFromCategoryName(name) {
  const map = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '',
    'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  };
  const slug = String(name || '')
    .trim()
    .toLowerCase()
    .split('')
    .map(ch => map[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'category';
}

/** @param {Partial<CategoryGroup>|string|null|undefined} raw @param {string} [fallbackName] */
export function normalizeCategoryGroup(raw, fallbackName = '') {
  if (typeof raw === 'string') {
    const name = raw.trim();
    return normalizeCategoryGroup({
      id: slugFromCategoryName(name),
      name,
      imageUrl: null,
      availabilityRuleId: null,
    });
  }
  const name = String(raw?.name || fallbackName || '').trim();
  const ruleId = raw?.availabilityRuleId || null;

  return {
    id: String(raw?.id || slugFromCategoryName(name)).trim() || slugFromCategoryName(name),
    name,
    imageUrl: raw?.imageUrl || null,
    availabilityRuleId: ruleId,
    visibleInWeb: raw?.visibleInWeb !== false,
    visibleInKiosk: raw?.visibleInKiosk === true,
    webOrder: normalizeGroupOrderIndex(raw?.webOrder, 0),
    kioskOrder: normalizeGroupOrderIndex(raw?.kioskOrder, 0),
    modifierGroupIds: normalizeModifierGroupIds(raw?.modifierGroupIds),
  };
}

/** @param {CategoryGroup[]} groups */
export function filterWebVisibleCategoryGroups(groups) {
  return groups.filter(g => g.visibleInWeb !== false);
}

/** @param {CategoryGroup[]} groups */
export function filterKioskVisibleCategoryGroups(groups) {
  return groups.filter(g => g.visibleInKiosk === true);
}

/** @param {CategoryGroup[]} groups */
export function categoryGroupsToNames(groups) {
  return groups.map(g => g.name).filter(Boolean);
}

/**
 * @param {Array<CategoryGroup|object|string>|null|undefined} stored
 * @param {string[]} [fromItems]
 * @returns {CategoryGroup[]}
 */
export function mergeCategoryGroups(stored, fromItems = []) {
  const byName = new Map();

  for (const name of DEFAULT_CATEGORIES) {
    byName.set(name, normalizeCategoryGroup(name));
  }

  for (const raw of stored || []) {
    const g = normalizeCategoryGroup(raw);
    if (!g.name) continue;
    const prev = byName.get(g.name);
    byName.set(g.name, prev ? { ...prev, ...g, id: prev.id || g.id } : g);
  }

  for (const name of fromItems) {
    if (!name || byName.has(name)) continue;
    byName.set(name, normalizeCategoryGroup(name));
  }

  const ordered = DEFAULT_CATEGORIES
    .filter(name => byName.has(name))
    .map(name => byName.get(name));

  const rest = [...byName.values()]
    .filter(g => !DEFAULT_CATEGORIES.includes(g.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  return [...ordered, ...rest];
}

/**
 * @param {CategoryGroup} group
 * @param {import('./availability-rules.js').AvailabilityRuleDoc|null|undefined} [rule]
 */
export function formatGroupScheduleSummary(group, rule = null) {
  if (!group?.availabilityRuleId) return 'Весь день';
  if (rule) return formatAvailabilityRuleShort(rule);
  return 'По расписанию';
}

/** @param {CategoryGroup[]} [stored] @param {string[]} [fromItems] */
export function mergeCategories(stored, fromItems = []) {
  if (stored?.length && typeof stored[0] === 'object' && stored[0]?.name) {
    return categoryGroupsToNames(mergeCategoryGroups(stored, fromItems));
  }
  const set = new Set([...DEFAULT_CATEGORIES, ...(stored || []), ...fromItems].filter(Boolean));
  const ordered = DEFAULT_CATEGORIES.filter(c => set.has(c));
  const rest = [...set].filter(c => !DEFAULT_CATEGORIES.includes(c)).sort((a, b) => a.localeCompare(b, 'ru'));
  return [...ordered, ...rest];
}

/** @typedef {{ id: string, name: string }} Allergen */

/** @type {Allergen[]} */
export const DEFAULT_ALLERGENS = [
  { id: 'gluten', name: 'Глютен' },
  { id: 'lactose', name: 'Лактоза' },
  { id: 'nuts', name: 'Орехи' },
  { id: 'eggs', name: 'Яйца' },
  { id: 'fish', name: 'Рыба' },
  { id: 'soy', name: 'Соя' },
  { id: 'celery', name: 'Сельдерей' },
  { id: 'mustard', name: 'Горчица' },
  { id: 'sesame', name: 'Кунжут' },
  { id: 'shellfish', name: 'Моллюски' },
];

/** @param {Allergen[]} [stored] */
export function mergeAllergens(stored) {
  if (!stored?.length) return [...DEFAULT_ALLERGENS];
  const byId = new Map(DEFAULT_ALLERGENS.map(a => [a.id, a]));
  for (const a of stored) {
    if (a?.id && a?.name) byId.set(a.id, { id: a.id, name: a.name });
  }
  return [...byId.values()];
}

/**
 * @typedef {{ id: string, name: string, priceDelta?: number }} ModifierOption
 * @typedef {{
 *   id: string,
 *   name: string,
 *   required?: boolean,
 *   minOptions?: number,
 *   maxOptions?: number,
 *   options?: ModifierOption[],
 * }} ModifierGroup
 */

/** @type {ModifierGroup[]} */
export const DEFAULT_MODIFIER_GROUPS = [
  {
    id: 'doneness',
    name: 'Степень прожарки',
    required: true,
    minOptions: 1,
    maxOptions: 1,
    options: [
      { id: 'rare', name: 'С кровью', priceDelta: 0 },
      { id: 'medium', name: 'Средняя', priceDelta: 0 },
      { id: 'well', name: 'Полная', priceDelta: 0 },
    ],
  },
  {
    id: 'sauce',
    name: 'Выбор соуса',
    required: false,
    minOptions: 0,
    maxOptions: 2,
    options: [
      { id: 'cheese', name: 'Сырный соус', priceDelta: 50 },
      { id: 'garlic', name: 'Чесночный', priceDelta: 30 },
      { id: 'none', name: 'Без соуса', priceDelta: 0 },
    ],
  },
  {
    id: 'salt',
    name: 'Соль',
    required: false,
    minOptions: 0,
    maxOptions: 1,
    options: [
      { id: 'with_salt', name: 'С солью', priceDelta: 0 },
      { id: 'no_salt', name: 'Без соли', priceDelta: 0 },
    ],
  },
];

/** @param {unknown} value */
function parsePriceDelta(value) {
  const raw = String(value ?? '').trim().replace(/руб\.?/gi, '').replace(/\s+/g, '');
  if (!raw || raw === '0' || raw === '+0' || raw === '-0') return 0;
  const match = raw.match(/^([+-]?)(\d+(?:[.,]\d+)?)/);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  const num = Number(match[2].replace(',', '.'));
  return Number.isFinite(num) ? sign * num : 0;
}

/** @param {number} delta */
export function formatModifierPriceDelta(delta) {
  const n = Number(delta) || 0;
  if (n === 0) return '0';
  return n > 0 ? `+${n} руб` : `${n} руб`;
}

/** @param {unknown} ids */
export function normalizeModifierGroupIds(ids) {
  return [...new Set((ids || []).map(id => String(id).trim()).filter(Boolean))];
}

/**
 * Объединяет модификаторы группы и товара (сначала группа, затем товар).
 * @param {{ modifierGroupIds?: string[] }|null|undefined} item
 * @param {{ modifierGroupIds?: string[] }|null|undefined} group
 */
export function resolveItemModifierGroupIds(item, group) {
  return normalizeModifierGroupIds([
    ...(group?.modifierGroupIds || []),
    ...(item?.modifierGroupIds || []),
  ]);
}

/** @param {ModifierGroup[]} allGroups @param {string[]} ids */
export function resolveModifierGroupsByIds(allGroups, ids) {
  const byId = new Map(allGroups.map(g => [g.id, g]));
  return normalizeModifierGroupIds(ids)
    .map(id => byId.get(id))
    .filter(Boolean);
}

/** @param {ModifierOption} option */
function normalizeModifierOption(option) {
  return {
    id: String(option?.id || '').trim(),
    name: String(option?.name || '').trim(),
    priceDelta: Number(option?.priceDelta) || 0,
  };
}

/** @param {ModifierGroup} group */
export function normalizeModifierGroup(group) {
  const options = (group?.options || [])
    .map(normalizeModifierOption)
    .filter(o => o.id && o.name);
  const minOptions = Math.max(0, Number(group?.minOptions) || 0);
  let maxOptions = Math.max(minOptions, Number(group?.maxOptions) || 1);
  if (group?.required && minOptions < 1) {
    maxOptions = Math.max(maxOptions, 1);
  }
  return {
    id: String(group?.id || '').trim(),
    name: String(group?.name || '').trim(),
    required: group?.required === true,
    minOptions: group?.required ? Math.max(1, minOptions) : minOptions,
    maxOptions,
    options,
  };
}

/** @param {ModifierGroup[]} [stored] */
export function mergeModifierGroups(stored) {
  if (!stored?.length) return DEFAULT_MODIFIER_GROUPS.map(g => normalizeModifierGroup(g));
  return stored
    .map(normalizeModifierGroup)
    .filter(g => g.id && g.name);
}

export { parsePriceDelta };
