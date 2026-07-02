/**
 * seed.js — one-shot script to populate Firestore with demo data.
 * Run once from the browser console or a Node script after npm install:
 *   import { seedDatabase } from './shared/seed.js';
 *   await seedDatabase();
 */

import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  collection,
  getDocs,
  query,
  limit,
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth, db } from './firebase.js';
import { COL, ROLES, createItemDoc, createUserDoc, USER_STATUS, DEFAULT_ITEM_VISIBLE_IN_WEB, DEFAULT_ITEM_VISIBLE_IN_KIOSK } from './schema.js';
import { buildValidationRulePayload, normalizeValidationRuleDoc } from './validation-rules.js';
import { isCompositeItem } from './composite-meals.js';
import { DEFAULT_GROUP_VISIBLE_IN_WEB, DEFAULT_GROUP_VISIBLE_IN_KIOSK, normalizeCategoryGroup } from './menu-catalog.js';
import { getItemImageUrl } from './item-images.js';
import { DEMO_NUTRITION_BY_NAME } from './demo-nutrition.js';

const DEMO_ITEMS = [
  { name: 'Борщ с мясом',          description: 'Традиционный борщ',       price: 180, category: 'Первые блюда' },
  { name: 'Куриная лапша',          description: 'Домашняя лапша',          price: 120, category: 'Первые блюда' },
  { name: 'Рассольник',             description: 'На говяжьем бульоне',     price: 150, category: 'Первые блюда' },
  { name: 'Солянка сборная',        description: 'Мясная солянка',          price: 150, category: 'Первые блюда' },
  { name: 'Гороховый суп',          description: 'С копчёностями',          price: 180, category: 'Первые блюда' },
  { name: 'Тыквенный крем-суп',     description: 'Содержит древесные орехи', price: 170, category: 'Первые блюда' },

  { name: 'Котлета с пюре',         description: 'Домашняя котлета',        price: 200, category: 'Вторые блюда' },
  { name: 'Греча по-купечески',     description: 'С говядиной',             price: 190, category: 'Вторые блюда' },
  { name: 'Стейк из лосося',        description: 'С рисом басмати',         price: 320, category: 'Вторые блюда' },

  { name: 'Салат Цезарь',           description: 'С курицей и гренками',   price: 160, category: 'Салаты' },
  { name: 'Оливье с семгой',        description: 'Авторский рецепт',        price: 180, category: 'Салаты' },
  { name: 'Салат весенний',         description: 'Свежие овощи',            price: 120, category: 'Салаты' },

  { name: 'Чай чёрный',             description: 'С сахаром',              price: 40,  category: 'Напитки' },
  { name: 'Морс ягодный 0.5л',      description: 'Клюква и брусника',       price: 60,  category: 'Напитки' },
  { name: 'Компот',                 description: 'Из сухофруктов',          price: 50,  category: 'Напитки' },
  { name: 'Вода Aqua Minerale 1л',  description: 'Без газа, лимон',         price: 89,  category: 'Напитки', honestSignMarked: true, honestSignCategory: 'water' },

  { name: 'Хлеб бородинский',       description: '2 куска',                price: 20,  category: 'Выпечка' },
  { name: 'Булочка ванильная',      description: 'Сдобная выпечка',         price: 150, category: 'Выпечка' },
  { name: 'Блинчики с джемом',      description: 'Со сметаной',             price: 90,  category: 'Выпечка' },
].map(item => ({
  ...item,
  nutrition: DEMO_NUTRITION_BY_NAME[item.name] || null,
}));

const DEMO_USERS = [
  { id: 'demo-admin-001',   name: 'Администратор', email: 'admin@ifcm.demo',   role: ROLES.ADMIN,   balance: 0 },
  { id: 'demo-manager-001', name: 'Менеджер',      email: 'manager@ifcm.demo', role: ROLES.MANAGER, balance: 0 },
  { id: 'demo-cook-001',    name: 'Повар',         email: 'cook@ifcm.demo',    role: ROLES.COOK,    balance: 0 },
  { id: 'demo-cashier-001', name: 'Кассир',        email: 'cashier@ifcm.demo', role: ROLES.CASHIER, balance: 0 },
  createUserDoc({
    id: 'demo-client-001',
    name: 'Иванов Иван Иванович',
    email: 'ivanov@ifcm.demo',
    role: ROLES.CLIENT,
    balance: 1686,
    phone: '+7 900 111-22-33',
    birthDate: '1985-03-15',
    status: USER_STATUS.ACTIVE,
    userGroupId: 'office_romashka',
    loyaltyCategoryId: 'gold',
    qrCode: 'MEAL-100000001',
    allergens: ['gluten'],
    allowsWebAccess: true,
    wallets: {
      personal: { balance: 686, name: 'Личные средства', allowedCategories: [] },
      dotation: { balance: 1000, name: 'Дотация', allowedCategories: [] },
    },
  }),
  createUserDoc({
    id: 'demo-client-002',
    name: 'Петрова Анна Сергеевна',
    email: 'petrova@ifcm.demo',
    role: ROLES.CLIENT,
    balance: 500,
    phone: '+7 900 444-55-66',
    birthDate: '1992-07-22',
    status: USER_STATUS.ACTIVE,
    userGroupId: 'production',
    loyaltyCategoryId: 'silver',
    qrCode: 'MEAL-100000002',
    allergens: [],
    allowsWebAccess: true,
  }),
];

export async function seedDatabase() {
  // Guard: skip if items already seeded
  const existing = await getDocs(query(collection(db, COL.ITEMS), limit(1)));
  if (!existing.empty) {
    console.warn('[seed] Database already seeded. Skipping.');
    return;
  }

  console.log('[seed] Seeding items...');
  for (const item of DEMO_ITEMS) {
    const ref = doc(collection(db, COL.ITEMS));
    await setDoc(ref, createItemDoc({
      ...item,
      imageUrl: getItemImageUrl(item.name),
      visibleInKiosk: true,
      visibleInPos: true,
      honestSignMarked: item.honestSignMarked === true,
      honestSignCategory: item.honestSignCategory || null,
    }));
  }

  console.log('[seed] Seeding demo users...');
  for (const user of DEMO_USERS) {
    await setDoc(doc(db, COL.USERS, user.id), user);
  }

  await setDoc(doc(db, COL.USERS, 'kiosk-guest'), createUserDoc({
    id: 'kiosk-guest',
    name: 'Гость киоска',
    email: 'guest@kiosk.local',
    role: ROLES.CLIENT,
    balance: 0,
  }));

  console.log('[seed] Seeding user groups...');
  const DEMO_USER_GROUPS = [
    { id: 'office_romashka', name: 'Офис Ромашка', description: 'Офисные сотрудники' },
    { id: 'production', name: 'Производство', description: 'Производственный персонал' },
    { id: 'askona', name: 'Завод Аскона', description: 'Корпоративное питание' },
  ];
  for (const group of DEMO_USER_GROUPS) {
    await setDoc(doc(db, COL.USER_GROUPS, group.id), { name: group.name, description: group.description || '' });
  }

  console.log('[seed] Seeding loyalty categories...');
  const DEMO_LOYALTY = [
    { id: 'bronze', name: 'Бронза', discountPercent: 0, cashbackPercent: 3 },
    { id: 'silver', name: 'Серебро', discountPercent: 5, cashbackPercent: 5 },
    { id: 'gold', name: 'Золото', discountPercent: 10, cashbackPercent: 7 },
  ];
  for (const cat of DEMO_LOYALTY) {
    await setDoc(doc(db, COL.LOYALTY_CATEGORIES, cat.id), {
      name: cat.name,
      discountPercent: cat.discountPercent,
      cashbackPercent: cat.cashbackPercent,
    });
  }

  await seedValidatorDemo({ skipAuth: true });

  console.log('[seed] Done! 🎉');
}

/** Demo cards + validation rules for cafeteria validator terminal */
const DEMO_VALIDATOR_CARD_USERS = [
  createUserDoc({
    id: 'demo-vld-ivanov',
    name: 'Иванов Петр Сергеевич',
    email: 'ivanov.vld@ifcm.demo',
    role: ROLES.CLIENT,
    balance: 0,
    phone: '+7 900 100-01-01',
    status: USER_STATUS.ACTIVE,
    userGroupId: 'askona',
    loyaltyCategoryId: 'silver',
    qrCode: '048291',
    allowsWebAccess: false,
    wallets: {
      dotation: { balance: 0, name: 'Дотация', allowedCategories: [] },
    },
  }),
  createUserDoc({
    id: 'demo-vld-petrov',
    name: 'Петров Алексей Иванович',
    email: 'petrov.vld@ifcm.demo',
    role: ROLES.CLIENT,
    balance: 100,
    phone: '+7 900 100-02-02',
    status: USER_STATUS.ACTIVE,
    userGroupId: 'office_romashka',
    loyaltyCategoryId: 'silver',
    qrCode: '048292',
    allowsWebAccess: false,
    wallets: {
        dotation: { balance: 100, name: 'Субсидия предприятия', allowedCategories: [] },
    },
  }),
  createUserDoc({
    id: 'demo-vld-sidorov',
    name: 'Сидоров Николай Петрович',
    email: 'sidorov.vld@ifcm.demo',
    role: ROLES.CLIENT,
    balance: 500,
    phone: '+7 900 100-03-03',
    status: USER_STATUS.ACTIVE,
    userGroupId: 'production',
    loyaltyCategoryId: 'bronze',
    qrCode: '048293',
    allowsWebAccess: false,
    wallets: {
      dotation: { balance: 500, name: 'Дотация', allowedCategories: [] },
    },
  }),
];

/**
 * Seed demo validator cards, users and validation rules.
 * Run from browser console: await seedValidatorDemo()
 *
 * @param {{ skipAuth?: boolean }} [opts]
 */
export async function seedValidatorDemo(opts = {}) {
  const { skipAuth = false } = opts;

  if (!skipAuth) {
    await signInWithEmailAndPassword(auth, 'admin@ifcm.demo', STAFF_DEMO_PASSWORD).catch(async () => {
      await signInWithEmailAndPassword(auth, 'manager@ifcm.demo', STAFF_DEMO_PASSWORD);
    });
  }

  console.log('[seed] Validator demo users…');
  for (const user of DEMO_VALIDATOR_CARD_USERS) {
    await setDoc(doc(db, COL.USERS, user.id), user, { merge: true });
  }

  const itemsSnap = await getDocs(collection(db, COL.ITEMS));
  const itemsByName = new Map(itemsSnap.docs.map(d => [d.data().name, d.id]));
  const borschtId = itemsByName.get('Борщ с мясом') || '';
  const kotletaId = itemsByName.get('Котлета с пюре') || '';
  const mealItemIds = [borschtId, kotletaId].filter(Boolean);

  const rules = [
    normalizeValidationRuleDoc({
      id: 'vld-demo-lunch-standard',
      name: 'Ланч Стандарт (Подход №1)',
      targetUserGroupIds: ['askona', 'production'],
      availabilityRuleId: null,
      approachLimit: 1,
      approachInterval: 'day',
      approachNumber: 1,
      actionType: 'meal_set',
      itemIds: mealItemIds,
      isActive: true,
    }, 'vld-demo-lunch-standard'),
    normalizeValidationRuleDoc({
      id: 'vld-demo-money-office',
      name: 'Списание 300₽ (Офис)',
      targetUserGroupIds: ['office_romashka'],
      availabilityRuleId: null,
      approachLimit: 99,
      approachInterval: 'day',
      approachNumber: 1,
      actionType: 'money',
      amount: 300,
      walletId: 'dotation',
      allowOverdraft: true,
      isActive: true,
    }, 'vld-demo-money-office'),
    normalizeValidationRuleDoc({
      id: 'vld-demo-weekdays-only',
      name: 'Будни только',
      targetUserGroupIds: ['production'],
      scheduleTemplate: 'weekdays',
      approachLimit: 1,
      approachInterval: 'day',
      approachNumber: 1,
      actionType: 'pass_only',
      isActive: true,
    }, 'vld-demo-weekdays-only'),
  ];

  console.log('[seed] Validator demo rules…');
  for (const rule of rules) {
    const payload = buildValidationRulePayload(rule);
    await setDoc(doc(db, COL.VALIDATION_RULES, rule.id), payload, { merge: true });
  }

  if (!skipAuth) {
    await signOut(auth).catch(() => {});
  }

  console.log(
    '%c[seed] Validator demo ready!\n' +
    'Карты: 048291 (Иванов), 048292 (Петров), 048293 (Сидоров)\n' +
    'Терминал: npm run dev:validator → http://localhost:3007',
    'color:#047857;font-weight:bold',
  );

  return { users: DEMO_VALIDATOR_CARD_USERS.length, rules: rules.length };
}

/**
 * Patch imageUrl on all existing menu items in Firestore.
 * Run from the browser console on a seeded project:
 *   import { updateItemImages } from './shared/seed.js';
 *   await updateItemImages();
 */
export async function updateItemImages() {
  const snap = await getDocs(collection(db, COL.ITEMS));
  let updated = 0;
  let failed = 0;

  console.log(`[seed] Updating imageUrl for ${snap.size} items...`);

  for (const docSnap of snap.docs) {
    const { name } = docSnap.data();
    const imageUrl = getItemImageUrl(name);
    if (!imageUrl) {
      console.warn(`[seed] No image mapping for "${name}"`);
      continue;
    }
    try {
      await updateDoc(doc(db, COL.ITEMS, docSnap.id), { imageUrl });
      updated += 1;
    } catch (err) {
      failed += 1;
      if (err.code === 'permission-denied') {
        console.error(
          '[seed] Permission denied while writing items.\n' +
          'Publish the updated firestore.rules to Firebase Console, then retry.\n' +
          'Menu images still work via client-side mapping without this update.'
        );
        break;
      }
      throw err;
    }
  }

  if (updated) console.log(`[seed] Updated ${updated} item(s).`);
  if (failed) console.warn(`[seed] ${failed} update(s) failed.`);
}

/**
 * Patch nutrition on all existing menu items in Firestore.
 * Run from the browser console:
 *   import { updateItemNutrition } from './shared/seed.js';
 *   await updateItemNutrition();
 */
export async function updateItemNutrition() {
  const snap = await getDocs(collection(db, COL.ITEMS));
  let updated = 0;
  let failed = 0;

  console.log(`[seed] Updating nutrition for ${snap.size} items...`);

  for (const docSnap of snap.docs) {
    const { name } = docSnap.data();
    const nutrition = DEMO_NUTRITION_BY_NAME[name];
    if (!nutrition) {
      console.warn(`[seed] No nutrition mapping for "${name}"`);
      continue;
    }
    try {
      await updateDoc(doc(db, COL.ITEMS, docSnap.id), { nutrition });
      updated += 1;
    } catch (err) {
      failed += 1;
      if (err.code === 'permission-denied') {
        console.error(
          '[seed] Permission denied while writing item nutrition.\n' +
          'Publish the updated firestore.rules to Firebase Console, then retry.'
        );
        break;
      }
      throw err;
    }
  }

  if (updated) console.log(`[seed] Updated nutrition for ${updated} item(s).`);
  if (failed) console.warn(`[seed] ${failed} update(s) failed.`);
}

/**
 * Синхронизирует category у существующих блюд с эталоном DEMO_ITEMS.
 * Вызов из консоли: await patchDemoItemCategories()
 */
export async function patchDemoItemCategories() {
  const snap = await getDocs(collection(db, COL.ITEMS));
  let updated = 0;

  for (const docSnap of snap.docs) {
    const name = docSnap.data().name;
    const expected = DEMO_ITEMS.find(i => i.name === name)?.category;
    if (!expected || docSnap.data().category === expected) continue;

    await updateDoc(doc(db, COL.ITEMS, docSnap.id), { category: expected });
    updated += 1;
    console.log(`[seed] ${name}: → ${expected}`);
  }

  console.log(`[seed] Categories patched for ${updated} item(s).`);
}

/**
 * Проставляет visibleInWeb / visibleInKiosk у существующих товаров.
 * Вызов из консоли: await patchItemVisibilityFlags()
 */
export async function patchItemVisibilityFlags() {
  const snap = await getDocs(collection(db, COL.ITEMS));
  let updated = 0;
  let failed = 0;

  console.log(`[seed] Patching visibility flags for ${snap.size} items...`);

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    /** @type {Record<string, boolean>} */
    const patch = {};

    if (data.visibleInWeb === undefined) patch.visibleInWeb = DEFAULT_ITEM_VISIBLE_IN_WEB;
    if (data.visibleInKiosk === undefined) patch.visibleInKiosk = DEFAULT_ITEM_VISIBLE_IN_KIOSK;
    if (!Object.keys(patch).length) continue;

    try {
      await updateDoc(doc(db, COL.ITEMS, docSnap.id), patch);
      updated += 1;
    } catch (err) {
      failed += 1;
      if (err.code === 'permission-denied') {
        console.error('[seed] Permission denied while patching item visibility flags.');
        break;
      }
      throw err;
    }
  }

  if (updated) console.log(`[seed] Patched visibility for ${updated} item(s).`);
  if (failed) console.warn(`[seed] ${failed} patch(es) failed.`);
}

/**
 * Проставляет visibleInWeb / visibleInKiosk у групп в settings/menu.
 * Вызов из консоли: await patchCategoryGroupVisibilityFlags()
 */
export async function patchCategoryGroupVisibilityFlags() {
  const ref = doc(db, COL.SETTINGS, 'menu');
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    console.log('[seed] No menu settings document — nothing to patch.');
    return;
  }

  const data = snap.data();
  const groups = data.categoryGroups;
  if (!Array.isArray(groups) || !groups.length) {
    console.log('[seed] No category groups — nothing to patch.');
    return;
  }

  let changed = false;
  const patched = groups.map(raw => {
    const g = normalizeCategoryGroup(raw);
    const next = { ...raw, ...g };
    if (raw.visibleInWeb === undefined) {
      next.visibleInWeb = DEFAULT_GROUP_VISIBLE_IN_WEB;
      changed = true;
    }
    if (raw.visibleInKiosk === undefined) {
      next.visibleInKiosk = DEFAULT_GROUP_VISIBLE_IN_KIOSK;
      changed = true;
    }
    return next;
  });

  if (!changed) {
    console.log('[seed] Category group visibility flags already set.');
    return;
  }

  await setDoc(ref, { categoryGroups: patched }, { merge: true });
  console.log(`[seed] Patched visibility for ${patched.length} category group(s).`);
}

/**
 * Проставляет флаги видимости у товаров и групп (миграция для интеграции с киоском).
 * Вызов из консоли: await patchCatalogVisibilityFlags()
 */
export async function patchCatalogVisibilityFlags() {
  await patchItemVisibilityFlags();
  await patchCategoryGroupVisibilityFlags();
}

/** Demo password for all staff seed accounts */
export const STAFF_DEMO_PASSWORD = 'demo1234';

const STAFF_ACCOUNTS = [
  { email: 'cook@ifcm.demo',    name: 'Повар',           role: ROLES.COOK },
  { email: 'admin@ifcm.demo',   name: 'Администратор',   role: ROLES.ADMIN },
  { email: 'manager@ifcm.demo', name: 'Менеджер',        role: ROLES.MANAGER },
  { email: 'cashier@ifcm.demo', name: 'Кассир',          role: ROLES.CASHIER },
  { email: 'kiosk@ifcm.demo',   name: 'Киоск',           role: ROLES.CASHIER },
  { email: 'pos@ifcm.demo',     name: 'Кассовый модуль', role: ROLES.CASHIER },
  { email: 'queue@ifcm.demo',   name: 'Экран очереди',   role: ROLES.CASHIER },
];

/**
 * Create Firebase Auth users + Firestore docs with staff roles.
 * Run once from the browser console (kitchen or LK, while logged out):
 *   await seedStaffAuth()
 *
 * Then login on http://localhost:3003 with cook@ifcm.demo / demo1234
 */
export async function seedStaffAuth(password = STAFF_DEMO_PASSWORD) {
  if (typeof window !== 'undefined') window.__SEED_STAFF_AUTH__ = true;

  try {
    await signOut(auth).catch(() => {});

    for (const acc of STAFF_ACCOUNTS) {
      let uid;
      let created = false;

      try {
        const cred = await signInWithEmailAndPassword(auth, acc.email, password);
        uid = cred.user.uid;
      } catch (signInErr) {
        const notFound = signInErr.code === 'auth/user-not-found'
          || signInErr.code === 'auth/invalid-login-credentials';
        if (!notFound) {
          const badPass = signInErr.code === 'auth/invalid-credential'
            || signInErr.code === 'auth/wrong-password';
          if (badPass) {
            const hint = acc.email === 'queue@ifcm.demo'
              ? 'Экран очереди использует kiosk@ifcm.demo — этот аккаунт можно не трогать.\n'
              : '';
            console.warn(
              `[seed] ${acc.email} — аккаунт есть, но пароль не "${password}".\n` +
              hint +
              'Чтобы пересоздать: Firebase Console → Authentication → Users → удалить,\n' +
              'затем снова: await seedStaffAuth()',
            );
            continue;
          }
          throw signInErr;
        }

        const cred = await createUserWithEmailAndPassword(auth, acc.email, password);
        uid = cred.user.uid;
        created = true;
      }

      if (!uid) continue;

      await setDoc(doc(db, COL.USERS, uid), {
        id: uid,
        name: acc.name,
        email: acc.email,
        role: acc.role,
        balance: 0,
        printReceipt: true,
      });

      console.log(`[seed] ${created ? 'Created' : 'Updated'} staff: ${acc.email}`);

      await signOut(auth).catch(() => {});
    }

    // kiosk-guest — Firestore doc for card payments (no Auth account)
    await signInWithEmailAndPassword(auth, 'admin@ifcm.demo', password).catch(async () => {
      await signInWithEmailAndPassword(auth, 'kiosk@ifcm.demo', password);
    });
    await setDoc(doc(db, COL.USERS, 'kiosk-guest'), createUserDoc({
      id: 'kiosk-guest',
      name: 'Гость киоска',
      email: 'guest@kiosk.local',
      role: ROLES.CLIENT,
      balance: 0,
    }), { merge: true });
    console.log('[seed] kiosk-guest user doc ready');
    await signOut(auth).catch(() => {});

    console.log(
      '%c[seed] Staff accounts ready!\n' +
      'Kitchen login: cook@ifcm.demo / demo1234\n' +
      'Validator: npm run dev:validator (port 3007)\n' +
      'Kiosk login: kiosk@ifcm.demo / demo1234\n' +
      'POS terminal: pos@ifcm.demo / demo1234\n' +
      'Queue screen: queue@ifcm.demo / demo1234\n' +
      'Also: admin@ifcm.demo, manager@ifcm.demo, cashier@ifcm.demo\n' +
      'Перелогиньтесь в админке: admin@ifcm.demo / demo1234',
      'color:#1E1B4B;font-weight:bold',
    );
  } finally {
    if (typeof window !== 'undefined') {
      window.__SEED_STAFF_AUTH__ = false;
      window.dispatchEvent(new Event('seed-staff-auth-done'));
    }
  }
}

/**
 * Проставляет isComposite: false всем товарам без явного признака составного.
 * Запуск в консоли: await patchItemCompositeDefaults()
 */
export async function patchItemCompositeDefaults() {
  const snap = await getDocs(collection(db, COL.ITEMS));
  let updated = 0;

  for (const d of snap.docs) {
    const data = d.data();
    if (isCompositeItem(data)) continue;
    if (data.isComposite === false) continue;
    await updateDoc(d.ref, { isComposite: false });
    updated += 1;
  }

  console.log(`[seed] patchItemCompositeDefaults: обновлено ${updated} товаров`);
  return updated;
}
