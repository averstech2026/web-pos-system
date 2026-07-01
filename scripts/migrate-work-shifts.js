#!/usr/bin/env node
/**
 * Миграция справочника рабочих смен:
 * — создаёт «Стандарт 5/2» (09:00–18:00, фиксированный, с производственным календарём);
 * — проставляет shiftId всем пользователям без этого поля.
 *
 *   npm run migrate:work-shifts
 *   npm run migrate:work-shifts:dry
 *   node scripts/migrate-work-shifts.js --credentials=./service-account.json --force
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { COL } from '../shared/schema.js';
import { migrateWorkShifts } from '../shared/work-shifts-migration.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');
const credentialsArg = process.argv.find(a => a.startsWith('--credentials='))?.split('=').slice(1).join('=');

function log(msg) {
  console.log(`[migrate-work-shifts] ${msg}`);
}

function initFirebase() {
  if (getApps().length) return getFirestore();

  const credPath = credentialsArg
    || process.env.GOOGLE_APPLICATION_CREDENTIALS
    || join(__dirname, 'service-account.json');

  if (!existsSync(credPath)) {
    throw new Error(
      'Нужен service account: положите scripts/service-account.json '
      + 'или укажите --credentials=path.json',
    );
  }

  const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'));
  initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
  log(`Firebase Admin: ${serviceAccount.project_id}`);
  return getFirestore();
}

async function main() {
  const db = initFirebase();

  const result = await migrateWorkShifts({
    getDoc: async (path) => {
      const snap = await db.doc(path).get();
      return {
        exists: () => snap.exists,
        data: () => snap.data() || {},
      };
    },
    setDoc: async (path, data, opts) => {
      const ref = db.doc(path);
      if (opts?.merge) {
        await ref.set(data, { merge: true });
      } else {
        await ref.set(data);
      }
    },
    listUsers: async () => {
      const snap = await db.collection(COL.USERS).get();
      return snap.docs.map(d => ({ id: d.id, data: () => d.data() }));
    },
  }, { dryRun, force });

  if (dryRun) {
    log('DRY RUN — записей в Firestore не было.');
  }

  log(`Готово: shiftCreated=${result.shiftCreated}, usersPatched=${result.usersPatched}, alreadyDone=${result.alreadyDone}`);
}

main().catch(err => {
  console.error('[migrate-work-shifts] ERROR:', err.message || err);
  process.exit(1);
});
