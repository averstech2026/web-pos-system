/** Категории меню → названия цехов для производственного отчёта */
export const KITCHEN_WORKSHOP_LABELS = {
  'Первые блюда': 'Суповарня',
  'Вторые блюда': 'Горячие блюда',
  'Салаты': 'Салаты',
  'Напитки': 'Бар / напитки',
  'Выпечка': 'Выпечка',
};

/** Эталонные категории блюд (синхронизировано с shared/seed.js) */
export const DISH_CATEGORY_BY_NAME = {
  'Борщ с мясом': 'Первые блюда',
  'Куриная лапша': 'Первые блюда',
  'Рассольник': 'Первые блюда',
  'Солянка сборная': 'Первые блюда',
  'Гороховый суп': 'Первые блюда',
  'Тыквенный крем-суп': 'Первые блюда',
  'Котлета с пюре': 'Вторые блюда',
  'Греча по-купечески': 'Вторые блюда',
  'Стейк из лосося': 'Вторые блюда',
  'Салат Цезарь': 'Салаты',
  'Оливье с семгой': 'Салаты',
  'Салат весенний': 'Салаты',
  'Чай чёрный': 'Напитки',
  'Морс ягодный 0.5л': 'Напитки',
  'Компот': 'Напитки',
  'Хлеб бородинский': 'Выпечка',
  'Блинчики с джемом': 'Выпечка',
};

/** @param {string|null|undefined} category */
export function kitchenWorkshopLabel(category) {
  if (!category) return 'Прочее';
  return KITCHEN_WORKSHOP_LABELS[category] || category;
}

/** @param {Array<object>} items */
export function buildItemsByNameMap(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.name?.trim().toLowerCase();
    if (key) map.set(key, item);
  }
  return map;
}

/**
 * @param {object} line
 * @param {Map<string, object>} itemsById
 * @param {Map<string, object>} itemsByName
 */
export function resolveDishCategory(line, itemsById, itemsByName) {
  const byId = line.dishId ? itemsById.get(line.dishId) : null;
  if (byId?.category) return byId.category;

  const byName = line.name
    ? itemsByName.get(line.name.trim().toLowerCase())
    : null;
  if (byName?.category) return byName.category;

  return DISH_CATEGORY_BY_NAME[line.name] || 'Прочее';
}
