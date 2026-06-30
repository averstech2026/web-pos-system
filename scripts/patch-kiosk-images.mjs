#!/usr/bin/env node
/**
 * Проставляет imageUrl групп и товаров из kiosk-catalog-data.js в Firestore.
 *
 *   npm run patch:kiosk-images
 *   npm run patch:kiosk-images -- --dry-run
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { KIOSK_CATALOG } from '../shared/kiosk-catalog-data.js';
import { parseKioskCatalogSource } from '../shared/kiosk-catalog-migration.js';
import { buildKioskImagePatchPlan } from '../shared/kiosk-image-patch.js';
import { COL } from '../shared/schema.js';
import { normalizeCategoryGroup } from '../shared/menu-catalog.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MENU_SETTINGS_ID = 'menu';
const BATCH_LIMIT = 500;
const dryRun = process.argv.includes('--dry-run');

function log(msg) {
  console.log(`[patch-kiosk-images] ${msg}`);
}

function initFirebase() {
  if (getApps().length) return getFirestore();
  const credPath = process.argv.find(a => a.startsWith('--credentials='))?.split('=').slice(1).join('=')
    || process.env.GOOGLE_APPLICATION_CREDENTIALS
    || join(__dirname, 'service-account.json');
  if (!existsSync(credPath)) throw new Error(`Нужен service account: ${credPath}`);
  const sa = JSON.parse(readFileSync(credPath, 'utf8'));
  initializeApp({ credential: cert(sa), projectId: sa.project_id });
  return getFirestore();
}

async function main() {
  const { categories, products } = parseKioskCatalogSource(KIOSK_CATALOG);
  const db = initFirebase();

  const menuSnap = await db.collection(COL.SETTINGS).doc(MENU_SETTINGS_ID).get();
  const menuData = menuSnap.exists ? menuSnap.data() : {};
  const categoryGroups = menuData.categoryGroups || [];

  const itemsSnap = await db.collection(COL.ITEMS).get();
  const items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const { categoryUpdates, itemUpdates } = buildKioskImagePatchPlan(
    { categories, products },
    { menuCategoryGroups: categoryGroups, items },
  );

  log(`К обновлению: ${categoryUpdates.length} групп, ${itemUpdates.length} товаров`);
  if (dryRun) log('DRY-RUN');

  if (categoryUpdates.length) {
    const byId = new Map(categoryGroups.map(g => [normalizeCategoryGroup(g).id, normalizeCategoryGroup(g)]));
    for (const u of categoryUpdates) {
      const prev = byId.get(u.id);
      if (!prev) continue;
      byId.set(u.id, { ...prev, imageUrl: u.imageUrl });
      log(`↻ группа «${u.label}» → ${u.imageUrl}`);
    }
    if (!dryRun) {
      const groups = [...byId.values()];
      await db.collection(COL.SETTINGS).doc(MENU_SETTINGS_ID).set({
        categoryGroups: groups,
        categories: groups.map(g => g.name),
      }, { merge: true });
    }
  }

  let batch = db.batch();
  let pending = 0;
  let batches = 0;

  for (const u of itemUpdates) {
    log(`↻ товар «${u.label}» → ${u.imageUrl}`);
    batch.update(db.collection(COL.ITEMS).doc(u.id), { imageUrl: u.imageUrl });
    pending += 1;
    if (pending >= BATCH_LIMIT) {
      if (!dryRun) await batch.commit();
      batches += 1;
      log(`Пачка #${batches}: ${pending}`);
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending) {
    if (!dryRun) await batch.commit();
    batches += 1;
    log(`Пачка #${batches}: ${pending}`);
  }

  log('Готово.');
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
