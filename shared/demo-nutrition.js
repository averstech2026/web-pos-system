/** Demo KBJU per serving — keyed by exact menu item name. */
export const DEMO_NUTRITION_BY_NAME = {
  'Борщ с мясом': { protein: 8, fat: 6, carbs: 18, kcal: 180 },
  'Куриная лапша': { protein: 10, fat: 4, carbs: 22, kcal: 160 },
  'Рассольник': { protein: 7, fat: 5, carbs: 16, kcal: 150 },
  'Солянка сборная': { protein: 9, fat: 8, carbs: 12, kcal: 170 },
  'Гороховый суп': { protein: 8, fat: 5, carbs: 24, kcal: 200 },
  'Тыквенный крем-суп': { protein: 3, fat: 12, carbs: 14, kcal: 170 },
  'Котлета с пюре': { protein: 18, fat: 14, carbs: 28, kcal: 320 },
  'Греча по-купечески': { protein: 16, fat: 10, carbs: 32, kcal: 310 },
  'Стейк из лосося': { protein: 28, fat: 18, carbs: 22, kcal: 380 },
  'Салат Цезарь': { protein: 14, fat: 12, carbs: 8, kcal: 200 },
  'Оливье с семгой': { protein: 8, fat: 16, carbs: 12, kcal: 220 },
  'Салат весенний': { protein: 3, fat: 4, carbs: 10, kcal: 90 },
  'Чай чёрный': { protein: 0, fat: 0, carbs: 0, kcal: 5 },
  'Морс ягодный 0.5л': { protein: 0, fat: 0, carbs: 15, kcal: 60 },
  'Компот': { protein: 0, fat: 0, carbs: 18, kcal: 70 },
  'Хлеб бородинский': { protein: 3, fat: 1, carbs: 22, kcal: 110 },
  'Блинчики с джемом': { protein: 6, fat: 8, carbs: 28, kcal: 220 },
};

/** @param {{ name?: string, nutrition?: object }|null|undefined} item */
export function resolveItemNutrition(item) {
  if (!item) return null;
  if (item.nutrition) return item.nutrition;
  return DEMO_NUTRITION_BY_NAME[item.name] || null;
}
