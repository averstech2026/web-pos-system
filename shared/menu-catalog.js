/** Default product categories (menu groups). */
export const DEFAULT_CATEGORIES = [
  'Первые блюда',
  'Вторые блюда',
  'Салаты',
  'Напитки',
  'Выпечка',
];

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

/** @param {string[]} [stored] @param {string[]} [fromItems] */
export function mergeCategories(stored, fromItems = []) {
  const set = new Set([...DEFAULT_CATEGORIES, ...(stored || []), ...fromItems].filter(Boolean));
  const ordered = DEFAULT_CATEGORIES.filter(c => set.has(c));
  const rest = [...set].filter(c => !DEFAULT_CATEGORIES.includes(c)).sort((a, b) => a.localeCompare(b, 'ru'));
  return [...ordered, ...rest];
}
