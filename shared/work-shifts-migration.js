/**
 * One-time migration: default work shift + shiftId backfill for users.
 * Shared between admin page load and Node script.
 */

import {
  DEFAULT_WORK_SHIFT_ID,
  createDefaultWorkShiftDoc,
  createWorkShiftDoc,
} from './work-shifts.js';

export const WORK_SHIFTS_MIGRATION_SETTINGS_ID = 'work_shifts_migration';
export const WORK_SHIFTS_MIGRATION_BATCH_LIMIT = 500;

/**
 * @param {object} deps
 * @param {(path: string) => Promise<{ exists: boolean, data: () => object }>} deps.getDoc
 * @param {(path: string, data: object, opts?: object) => Promise<void>} deps.setDoc
 * @param {() => Promise<Array<{ id: string, data: () => object }>>} deps.listUsers
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun=false]
 * @param {boolean} [opts.force=false] — re-run user backfill even if migration flag set
 */
export async function migrateWorkShifts(deps, opts = {}) {
  const { getDoc, setDoc, listUsers } = deps;
  const dryRun = opts.dryRun === true;
  const force = opts.force === true;

  const migrationRef = `settings/${WORK_SHIFTS_MIGRATION_SETTINGS_ID}`;
  const migrationSnap = await getDoc(migrationRef);
  const alreadyDone = migrationSnap.exists() && migrationSnap.data()?.completed === true;

  const defaultShift = createDefaultWorkShiftDoc();
  const shiftRef = `work_shifts/${DEFAULT_WORK_SHIFT_ID}`;
  const shiftSnap = await getDoc(shiftRef);

  let shiftCreated = false;
  if (!shiftSnap.exists()) {
    shiftCreated = true;
    if (!dryRun) {
      await setDoc(shiftRef, createWorkShiftDoc(defaultShift));
    }
  }

  let usersPatched = 0;
  if (!alreadyDone || force) {
    const users = await listUsers();
    const toPatch = users.filter(u => {
      const data = u.data();
      const shiftId = data.shiftId;
      return shiftId == null || String(shiftId).trim() === '';
    });

    for (let i = 0; i < toPatch.length; i += WORK_SHIFTS_MIGRATION_BATCH_LIMIT) {
      const chunk = toPatch.slice(i, i + WORK_SHIFTS_MIGRATION_BATCH_LIMIT);
      if (!dryRun) {
        await Promise.all(chunk.map(u => setDoc(
          `users/${u.id}`,
          { shiftId: DEFAULT_WORK_SHIFT_ID },
          { merge: true },
        )));
      }
      usersPatched += chunk.length;
    }

    if (!dryRun && (!alreadyDone || force)) {
      await setDoc(migrationRef, {
        completed: true,
        defaultShiftId: DEFAULT_WORK_SHIFT_ID,
        usersPatched,
        shiftCreated,
        migratedAt: new Date().toISOString(),
      }, { merge: true });
    }
  }

  return {
    alreadyDone: alreadyDone && !force,
    shiftCreated,
    usersPatched,
    defaultShiftId: DEFAULT_WORK_SHIFT_ID,
    dryRun,
  };
}
