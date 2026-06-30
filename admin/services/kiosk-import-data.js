import { db } from '../../shared/firebase.js';
import { KIOSK_CATALOG } from '../../shared/kiosk-catalog-data.js';
import { migrateKioskCatalog, parseKioskCatalogSource } from '../../shared/kiosk-catalog-migration.js';
import { patchKioskImages } from '../../shared/kiosk-image-patch.js';

/** @returns {{ categories: object[], products: object[] }} */
export function loadKioskCatalogFromCode() {
  return parseKioskCatalogSource(KIOSK_CATALOG);
}

/**
 * @param {object} [options]
 * @param {boolean} [options.dryRun]
 * @param {(msg: string) => void} [options.onLog]
 */
export async function runKioskCatalogImport({ dryRun = false, onLog = () => {} } = {}) {
  const { categories, products } = loadKioskCatalogFromCode();

  if (!categories.length && !products.length) {
    throw new Error(
      'Справочник пуст. Вставьте данные из проекта киоска в shared/kiosk-catalog-data.js',
    );
  }

  onLog(`Источник: shared/kiosk-catalog-data.js`);
  onLog(`Категорий: ${categories.length}, товаров: ${products.length}`);

  return migrateKioskCatalog({
    targetDb: db,
    kioskCategories: categories,
    kioskProducts: products,
    dryRun,
    onLog,
  });
}

/**
 * @param {object} [options]
 * @param {boolean} [options.dryRun]
 * @param {(msg: string) => void} [options.onLog]
 */
export async function runKioskImagePatch({ dryRun = false, onLog = () => {} } = {}) {
  const { categories, products } = loadKioskCatalogFromCode();
  onLog('Патч картинок из shared/kiosk-catalog-data.js');
  return patchKioskImages({
    db,
    catalog: { categories, products },
    dryRun,
    onLog,
  });
}
