/**
 * Local product images live in /products/ (project root).
 * Keys match item.name from the menu catalog.
 */
export const ITEM_IMAGE_BY_NAME = {
  'Борщ с мясом':       '/products/goulash.jpg',
  'Куриная лапша':      '/products/pasta.jpg',
  'Рассольник':         '/products/lunch2.jpg',
  'Солянка сборная':    '/products/goulash.jpg',
  'Гороховый суп':      '/products/porridge.jpg',
  'Тыквенный крем-суп': '/products/lunch1.jpg',

  'Котлета с пюре':     '/products/cutlet.jpg',
  'Греча по-купечески': '/products/buckwheat.jpg',
  'Стейк из лосося':    '/products/baked_fish.jpg',

  'Салат Цезарь':       '/products/caesar.jpg',
  'Оливье с семгой':    '/products/vinaigrette.jpg',
  'Салат весенний':     '/products/veggie_salad.jpg',

  'Чай чёрный':         '/products/tea.jpg',
  'Морс ягодный 0.5л':  '/products/juice.jpg',
  'Компот':             '/products/fruit_mix.jpg',

  'Хлеб бородинский':   '/products/rye.jpg',
  'Блинчики с джемом':  '/products/pancakes.jpg',
};

/** @param {string|null|undefined} url */
export function resolveProductImageUrl(url) {
  if (!url) return null;
  const raw = String(url).trim();
  if (!raw) return null;
  if (raw.startsWith('blob:')) return null;
  if (raw.startsWith('data:')) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = import.meta.env.BASE_URL || '/';
  if (raw.startsWith('/')) {
    return `${base}${raw.replace(/^\//, '')}`;
  }
  if (raw.startsWith('products/')) {
    return `${base}${raw}`;
  }
  return raw;
}

/** @param {string} name */
export function getItemImageUrl(name) {
  return resolveProductImageUrl(ITEM_IMAGE_BY_NAME[name] ?? null);
}
