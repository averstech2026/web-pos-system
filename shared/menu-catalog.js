import { formatAvailabilityRuleShort } from './availability-rules.js';

/** Default product categories (menu groups). */
export const DEFAULT_CATEGORIES = [
  'Первые блюда',
  'Вторые блюда',
  'Салаты',
  'Напитки',
  'Выпечка',
];

/**
 * @typedef {object} CategoryGroup
 * @property {string} id
 * @property {string} name
 * @property {string|null} [imageUrl]
 * @property {string|null} [availabilityRuleId] - ref to availability_rules/{id}; null = always available
 */

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
  };
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
