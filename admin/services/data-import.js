import {
  collection,
  doc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import { COL, USER_STATUS } from '../../shared/schema.js';
import { fetchAllItems, buildItemPayload } from './products-data.js';
import { fetchMenuSettings, saveCategoryGroups } from './menu-settings-data.js';
import { createCrmUser, fetchCrmUsers, updateCrmUser } from './users-data.js';
import { fetchLoyaltyCategories } from './crm-ref-data.js';
import { normalizeCategoryGroup } from '../../shared/menu-catalog.js';
import { pickColumn } from '../utils/spreadsheet.js';

/** @typedef {{ processed: number, created: number, updated: number, errors: string[] }} ImportStats */

const PRODUCT_COLUMNS = {
  article: ['Артикул', 'article', 'sku', 'код'],
  name: ['Название', 'name', 'наименование'],
  category: ['Категория', 'category', 'группа'],
  price: ['Цена', 'price', 'стоимость'],
  barcode: ['Штрихкод', 'barcode', 'ean', 'штрих-код'],
  unit: ['Ед. измерения', 'Единица измерения', 'unit', 'ед.изм'],
};

const CLIENT_COLUMNS = {
  phone: ['Номер телефона', 'Телефон', 'phone'],
  name: ['Имя', 'ФИО', 'name', 'клиент'],
  loyalty: ['Категория скидки/Кэшбэк', 'Категория лояльности', 'loyalty', 'скидка'],
  card: ['Номер карты', 'Карта', 'card', 'qr'],
};

/**
 * @param {Record<string, string>[]} rows
 * @param {{ dryRun?: boolean }} [options]
 * @returns {Promise<ImportStats>}
 */
export async function importProductsFromRows(rows, { dryRun = false } = {}) {
  const stats = { processed: 0, created: 0, updated: 0, errors: [] };

  if (!rows.length) {
    throw new Error('Файл не содержит строк с данными');
  }

  const [existingItems, menuSettings] = await Promise.all([
    fetchAllItems(),
    fetchMenuSettings(),
  ]);

  const byArticle = new Map();
  for (const item of existingItems) {
    const article = String(item.article ?? item.sku ?? '').trim().toLowerCase();
    if (article) byArticle.set(article, item);
  }

  const categoryGroups = [...menuSettings.categoryGroups];
  const categoryNames = new Set(menuSettings.categories);

  /** @type {Array<{ type: 'create' | 'update', id?: string, payload: object }>} */
  const operations = [];

  rows.forEach((row, index) => {
    const lineNo = index + 2;
    const article = pickColumn(row, PRODUCT_COLUMNS.article);
    const name = pickColumn(row, PRODUCT_COLUMNS.name);
    const category = pickColumn(row, PRODUCT_COLUMNS.category);
    const priceRaw = pickColumn(row, PRODUCT_COLUMNS.price);
    const barcode = pickColumn(row, PRODUCT_COLUMNS.barcode);
    const unit = pickColumn(row, PRODUCT_COLUMNS.unit);

    if (!article && !name) {
      stats.errors.push(`Строка ${lineNo}: не указаны артикул и название`);
      return;
    }

    if (!name) {
      stats.errors.push(`Строка ${lineNo}: не указано название`);
      return;
    }

    if (!category) {
      stats.errors.push(`Строка ${lineNo}: не указана категория`);
      return;
    }

    const price = Number(String(priceRaw).replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(price) || price < 0) {
      stats.errors.push(`Строка ${lineNo}: некорректная цена`);
      return;
    }

    stats.processed += 1;

    if (!categoryNames.has(category)) {
      categoryNames.add(category);
      categoryGroups.push(normalizeCategoryGroup(category));
    }

    const matchKey = article.toLowerCase();
    const existing = matchKey ? byArticle.get(matchKey) : null;

    const itemData = {
      name,
      description: existing?.description || '',
      category,
      price,
      isAvailable: existing?.isAvailable !== false,
      visibleInWeb: existing?.visibleInWeb,
      visibleInKiosk: existing?.visibleInKiosk,
      visibleInPos: existing?.visibleInPos,
      allergens: existing?.allergens || [],
      modifierGroupIds: existing?.modifierGroupIds || [],
      nutrition: existing?.nutrition,
      availabilityRuleId: existing?.availabilityRuleId || null,
      imageUrl: existing?.imageUrl,
    };

    const payload = buildItemPayload(itemData);
    if (article) payload.article = article;
    if (barcode) payload.barcode = barcode;
    if (unit) payload.unit = unit;

    if (existing?.id) {
      operations.push({ type: 'update', id: existing.id, payload });
      stats.updated += 1;
    } else {
      operations.push({ type: 'create', payload });
      stats.created += 1;
      if (matchKey) byArticle.set(matchKey, { id: `pending-${matchKey}`, article });
    }
  });

  if (stats.errors.length) {
    throw new Error(stats.errors.slice(0, 5).join('\n'));
  }

  if (dryRun) return stats;

  await saveCategoryGroups(categoryGroups);

  const batchSize = 400;
  for (let i = 0; i < operations.length; i += batchSize) {
    const chunk = operations.slice(i, i + batchSize);
    const batch = writeBatch(db);

    for (const op of chunk) {
      if (op.type === 'create') {
        const ref = doc(collection(db, COL.ITEMS));
        batch.set(ref, op.payload);
      } else if (op.id) {
        batch.update(doc(db, COL.ITEMS, op.id), op.payload);
      }
    }

    await batch.commit();
  }

  return stats;
}

/**
 * @param {Record<string, string>[]} rows
 * @param {{ dryRun?: boolean }} [options]
 * @returns {Promise<ImportStats>}
 */
export async function importClientsFromRows(rows, { dryRun = false } = {}) {
  const stats = { processed: 0, created: 0, updated: 0, errors: [] };

  if (!rows.length) {
    throw new Error('Файл не содержит строк с данными');
  }

  const [existingUsers, loyaltyCategories] = await Promise.all([
    fetchCrmUsers(),
    fetchLoyaltyCategories(),
  ]);

  const byPhone = new Map();
  const byCard = new Map();
  for (const user of existingUsers) {
    const phone = normalizePhone(user.phone);
    if (phone) byPhone.set(phone, user);
    const card = String(user.qrCode || '').trim();
    if (card) byCard.set(card, user);
  }

  const loyaltyByName = new Map(
    loyaltyCategories.map(cat => [String(cat.name || '').toLowerCase(), cat.id]),
  );
  const loyaltyById = new Map(loyaltyCategories.map(cat => [cat.id, cat.id]));

  /** @type {Array<{ type: 'create' | 'update', user?: object, payload: object }>} */
  const operations = [];

  rows.forEach((row, index) => {
    const lineNo = index + 2;
    const phone = normalizePhone(pickColumn(row, CLIENT_COLUMNS.phone));
    const name = pickColumn(row, CLIENT_COLUMNS.name);
    const loyaltyRaw = pickColumn(row, CLIENT_COLUMNS.loyalty);
    const card = pickColumn(row, CLIENT_COLUMNS.card);

    if (!phone && !card) {
      stats.errors.push(`Строка ${lineNo}: укажите телефон или номер карты`);
      return;
    }

    if (!name) {
      stats.errors.push(`Строка ${lineNo}: не указано имя`);
      return;
    }

    stats.processed += 1;

    const loyaltyCategoryId = resolveLoyaltyCategoryId(loyaltyRaw, loyaltyByName, loyaltyById);
    const existing = (phone && byPhone.get(phone)) || (card && byCard.get(card)) || null;

    const payload = {
      name,
      phone: phone || existing?.phone || '',
      loyaltyCategoryId: loyaltyCategoryId || existing?.loyaltyCategoryId || null,
      qrCode: card || existing?.qrCode || '',
    };

    if (existing?.id) {
      operations.push({ type: 'update', user: existing, payload });
      stats.updated += 1;
    } else {
      operations.push({
        type: 'create',
        payload: {
          ...payload,
          email: buildImportEmail(phone, card),
          status: USER_STATUS.ACTIVE,
          qrCode: card || undefined,
        },
      });
      stats.created += 1;
    }
  });

  if (stats.errors.length) {
    throw new Error(stats.errors.slice(0, 5).join('\n'));
  }

  if (dryRun) return stats;

  for (const op of operations) {
    if (op.type === 'create') {
      await createCrmUser(op.payload);
    } else if (op.user?.id) {
      await updateCrmUser(op.user.id, op.payload);
    }
  }

  return stats;
}

/** @param {string} value */
function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

/** @param {string} phone @param {string} card */
function buildImportEmail(phone, card) {
  const token = phone || card || String(Date.now());
  return `import+${token}@ifcm.local`;
}

/**
 * @param {string} raw
 * @param {Map<string, string>} byName
 * @param {Map<string, string>} byId
 */
function resolveLoyaltyCategoryId(raw, byName, byId) {
  const value = String(raw || '').trim();
  if (!value) return null;
  return byId.get(value) || byName.get(value.toLowerCase()) || null;
}

export const PRODUCT_TEMPLATE_ROWS = [
  ['Артикул', 'Название', 'Категория', 'Цена', 'Штрихкод', 'Ед. измерения'],
  ['SKU-001', 'Борщ с мясом', 'Первые блюда', '180', '4601234567890', 'порц'],
  ['SKU-002', 'Куриная лапша', 'Первые блюда', '120', '4601234567891', 'порц'],
];

export const CLIENT_TEMPLATE_ROWS = [
  ['Номер телефона', 'Имя', 'Категория скидки/Кэшбэк', 'Номер карты'],
  ['79001234567', 'Иванов Иван', 'Бронза', 'CARD-0001'],
  ['79007654321', 'Петрова Анна', 'Серебро', 'CARD-0002'],
];
