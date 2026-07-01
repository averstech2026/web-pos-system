import {

  collection,

  doc,

  getDoc,

  getDocs,

  increment,

  query,

  runTransaction,

  setDoc,

  updateDoc,

  where,

  orderBy,

  limit,

  writeBatch,

} from 'firebase/firestore';

import { sendPasswordResetEmail } from 'firebase/auth';

import { auth, db } from '../../shared/firebase.js';

import {

  COL,

  ROLES,

  USER_SUB,

  USER_STATUS,

  WALLET_OP_TYPE,

  createUserDoc,

  createWalletHistoryDoc,

  normalizeUserWallets,

  normalizeWalletOpType,

  totalWalletBalance,

} from '../../shared/schema.js';

import {
  buildUserWalletsFromGroup,
} from '../../shared/group-wallets.js';

import { fetchWallets } from './wallets-data.js';
/** @param {string|null} groupId @returns {Promise<object|null>} */
async function fetchUserGroupById(groupId) {
  if (!groupId) return null;
  const snap = await getDoc(doc(db, COL.USER_GROUPS, groupId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * @param {object} user
 * @param {object|null} group
 * @param {Array<object>} walletCatalog
 */
function walletsPatchForGroup(user, group, walletCatalog) {
  const wallets = buildUserWalletsFromGroup(user.wallets, group, walletCatalog);
  return {
    wallets,
    balance: totalWalletBalance(wallets),
  };
}

/**
 * Sync allowed wallets to all members of a user group.
 * @param {string} groupId
 * @param {string[]} allowedWalletIds
 * @returns {Promise<number>} number of updated users
 */
export async function syncGroupWalletsToMembers(groupId, allowedWalletIds) {
  const [walletCatalog, usersSnap] = await Promise.all([
    fetchWallets(),
    getDocs(query(collection(db, COL.USERS), where('role', '==', ROLES.CLIENT))),
  ]);

  const group = {
    id: groupId,
    allowedWalletIds: Array.isArray(allowedWalletIds) ? allowedWalletIds : [],
  };

  const members = usersSnap.docs
    .map(d => normalizeCrmUser({ id: d.id, ...d.data() }))
    .filter(u => u.userGroupId === groupId);

  if (!members.length) return 0;

  const BATCH_LIMIT = 500;
  let updated = 0;

  for (let i = 0; i < members.length; i += BATCH_LIMIT) {
    const chunk = members.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);

    for (const user of chunk) {
      const patch = walletsPatchForGroup(user, group, walletCatalog);
      batch.update(doc(db, COL.USERS, user.id), patch);
    }

    await batch.commit();
    updated += chunk.length;
  }

  return updated;
}

/**
 * @param {object} raw
 * @returns {object}
 */
export function normalizeCrmUser(raw) {

  const wallets = normalizeUserWallets(raw);

  const loyaltyCategoryId = raw.loyaltyCategoryId ?? raw.loyaltyCategory ?? null;

  return {

    ...raw,

    status: raw.status || USER_STATUS.ACTIVE,

    firedAt: raw.firedAt ?? null,

    activeFrom: raw.activeFrom ?? null,

    activeTo: raw.activeTo ?? null,

    userGroupId: raw.userGroupId ?? null,

    shiftId: raw.shiftId ?? null,

    loyaltyCategoryId,

    qrCode: raw.qrCode || '',

    allergens: Array.isArray(raw.allergens) ? raw.allergens : [],

    allowsWebAccess: raw.allowsWebAccess !== false,

    phone: raw.phone || '',

    wallets,

    balance: totalWalletBalance(wallets),

  };

}



/** @returns {Promise<Array<object>>} */

export async function fetchCrmUsers() {

  const q = query(collection(db, COL.USERS), where('role', '==', ROLES.CLIENT));

  const snap = await getDocs(q);

  return snap.docs

    .map(d => normalizeCrmUser({ id: d.id, ...d.data() }))

    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));

}



/** @param {object} data */

export async function createCrmUser(data) {

  const ref = doc(collection(db, COL.USERS));

  let wallets = data.wallets;
  let strictWallets = false;

  if (!wallets && data.userGroupId) {
    const [group, walletCatalog] = await Promise.all([
      fetchUserGroupById(data.userGroupId),
      fetchWallets(),
    ]);
    wallets = buildUserWalletsFromGroup({}, group, walletCatalog);
    strictWallets = true;
  }

  const payload = createUserDoc({

    id: ref.id,

    role: ROLES.CLIENT,

    name: data.name,

    email: data.email,

    phone: data.phone || null,

    birthDate: data.birthDate || null,

    status: data.status || USER_STATUS.ACTIVE,

    firedAt: data.firedAt || null,

    activeFrom: data.activeFrom || null,

    activeTo: data.activeTo || null,

    userGroupId: data.userGroupId || null,

    shiftId: data.shiftId || null,

    loyaltyCategoryId: data.loyaltyCategoryId || null,

    qrCode: data.qrCode || generateQrCodeValue(),

    allergens: data.allergens || [],

    allowsWebAccess: data.allowsWebAccess !== false,

    wallets,

    strictWallets,

    balance: 0,

  });

  await setDoc(ref, payload);

  return normalizeCrmUser({ id: ref.id, ...payload });

}



/**

 * @param {string} userId

 * @param {object} patch

 */

export async function updateCrmUser(userId, patch) {

  const ref = doc(db, COL.USERS, userId);

  const payload = { ...patch };

  if (Object.prototype.hasOwnProperty.call(patch, 'userGroupId') && !payload.wallets) {
    const [userSnap, group, walletCatalog] = await Promise.all([
      getDoc(ref),
      fetchUserGroupById(patch.userGroupId || null),
      fetchWallets(),
    ]);
    if (userSnap.exists()) {
      const user = normalizeCrmUser({ id: userSnap.id, ...userSnap.data() });
      Object.assign(payload, walletsPatchForGroup(user, group, walletCatalog));
      payload._strictWallets = true;
    }
  }

  if (payload.wallets) {
    payload.wallets = normalizeUserWallets(
      { wallets: payload.wallets },
      { strict: payload._strictWallets === true },
    );
    delete payload._strictWallets;
    payload.balance = totalWalletBalance(payload.wallets);
  }

  await updateDoc(ref, payload);

}



/**

 * @param {string[]} userIds

 * @param {object} patch

 */

export async function bulkUpdateCrmUsers(userIds, patch) {

  if (!userIds.length) return 0;

  const BATCH_LIMIT = 500;

  let updated = 0;

  if (Object.prototype.hasOwnProperty.call(patch, 'userGroupId')) {
    const [walletCatalog, group] = await Promise.all([
      fetchWallets(),
      fetchUserGroupById(patch.userGroupId || null),
    ]);

    for (let i = 0; i < userIds.length; i += BATCH_LIMIT) {
      const chunk = userIds.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);

      for (const id of chunk) {
        const userSnap = await getDoc(doc(db, COL.USERS, id));
        if (!userSnap.exists()) continue;

        const user = normalizeCrmUser({ id: userSnap.id, ...userSnap.data() });
        const walletPatch = walletsPatchForGroup(user, group, walletCatalog);
        batch.update(doc(db, COL.USERS, id), {
          ...patch,
          ...walletPatch,
        });
      }

      await batch.commit();
      updated += chunk.length;
    }

    return updated;
  }

  for (let i = 0; i < userIds.length; i += BATCH_LIMIT) {

    const chunk = userIds.slice(i, i + BATCH_LIMIT);

    const batch = writeBatch(db);

    for (const id of chunk) {

      batch.update(doc(db, COL.USERS, id), patch);

    }

    await batch.commit();

    updated += chunk.length;

  }

  return updated;

}



/**

 * @param {object} p

 * @param {string} p.userId

 * @param {string} p.walletId

 * @param {'deposit'|'withdraw'|'credit'|'debit'} p.type

 * @param {number} p.amount

 * @param {string} p.comment

 * @param {string} p.performedBy

 */

export async function adjustWalletBalance({

  userId,

  walletId,

  type,

  amount,

  comment = '',

  performedBy,

}) {

  const sum = Number(amount);

  if (!Number.isFinite(sum) || sum <= 0) {

    throw new Error('Укажите положительную сумму');

  }

  if (!comment.trim()) {

    throw new Error('Укажите комментарий / основание операции');

  }



  const opType = normalizeWalletOpType(type);

  const delta = opType === WALLET_OP_TYPE.DEPOSIT ? sum : -sum;



  const userRef = doc(db, COL.USERS, userId);

  const historyRef = doc(collection(userRef, USER_SUB.WALLET_HISTORY));



  await runTransaction(db, async (tx) => {

    const snap = await tx.get(userRef);

    if (!snap.exists()) throw new Error('Пользователь не найден');



    const user = normalizeCrmUser({ id: snap.id, ...snap.data() });

    const wallet = user.wallets?.[walletId];

    if (!wallet) throw new Error('Кошелёк не найден');



    const currentBalance = Number(wallet.balance) || 0;

    if (currentBalance + delta < 0) {

      throw new Error('Недостаточно средств на кошельке');

    }



    tx.update(userRef, {

      [`wallets.${walletId}.balance`]: increment(delta),

      balance: increment(delta),

    });



    tx.set(

      historyRef,

      createWalletHistoryDoc({

        walletId,

        walletName: wallet.name,

        type: opType,

        amount: sum,

        comment: comment.trim(),

        performedBy,

      }),

    );

  });

}



/** @param {string} userId @returns {Promise<Array<object>>} */

export async function fetchWalletHistory(userId) {

  const q = query(

    collection(doc(db, COL.USERS, userId), USER_SUB.WALLET_HISTORY),

    orderBy('createdAt', 'desc'),

    limit(200),

  );

  const snap = await getDocs(q);

  return snap.docs.map(d => ({ id: d.id, ...d.data() }));

}



/** @param {string} userId @returns {Promise<Array<object>>} */

export async function fetchUserOrders(userId) {

  const q = query(

    collection(db, COL.ORDERS),

    where('userId', '==', userId),

    limit(100),

  );

  const snap = await getDocs(q);

  return snap.docs

    .map(d => ({ id: d.id, ...d.data() }))

    .sort((a, b) => {

      const ta = a.createdAt?.toMillis?.() ?? 0;

      const tb = b.createdAt?.toMillis?.() ?? 0;

      return tb - ta;

    });

}



/** @returns {string} */

export function generateQrCodeValue() {

  const part = Math.floor(Math.random() * 900000000) + 100000000;

  return `MEAL-${part}`;

}



/** @param {string} email */

export async function sendUserPasswordReset(email) {

  if (!email?.trim()) throw new Error('У пользователя не указан email');

  await sendPasswordResetEmail(auth, email.trim());

}



/** @returns {string} */

export function generateTempPassword() {

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

  let out = '';

  for (let i = 0; i < 12; i += 1) {

    out += chars[Math.floor(Math.random() * chars.length)];

  }

  return out;

}



/**

 * @param {Array<object>} users

 * @param {object} filters

 */

export function filterCrmUsers(users, {
  search = '',
  groupIds = [],
  statuses = [],
  loyaltyCategoryIds = [],
  activeOnly = false,
}) {

  const q = search.trim().toLowerCase();

  const groupSet = groupIds.length ? new Set(groupIds) : null;

  const statusSet = statuses.length ? new Set(statuses) : null;

  const loyaltySet = loyaltyCategoryIds.length ? new Set(loyaltyCategoryIds) : null;



  return users.filter(u => {

    if (groupSet && !groupSet.has(u.userGroupId || '')) return false;

    if (activeOnly && (u.status || USER_STATUS.ACTIVE) !== USER_STATUS.ACTIVE) return false;

    if (statusSet && !statusSet.has(u.status || USER_STATUS.ACTIVE)) return false;

    if (loyaltySet) {

      const catKey = u.loyaltyCategoryId || '__none__';

      if (!loyaltySet.has(catKey)) return false;

    }

    if (!q) return true;

    const hay = [u.name, u.email, u.phone, u.qrCode].filter(Boolean).join(' ').toLowerCase();

    return hay.includes(q);

  });

}

const BULK_WALLET_BATCH_USERS = 250;

/**
 * @param {object} p
 * @param {string[]} p.userIds
 * @param {string} p.walletId
 * @param {{ name: string, allowedCategories?: string[] }|null} [p.walletDef]
 * @param {'deposit'|'withdraw'|'credit'|'debit'} p.type
 * @param {number} p.amount
 * @param {string} p.comment
 * @param {string} p.performedBy
 * @param {(progress: { done: number, total: number }) => void} [p.onProgress]
 */
export async function bulkAdjustWalletBalances({
  userIds,
  walletId,
  walletDef = null,
  type,
  amount,
  comment = '',
  performedBy,
  onProgress,
}) {
  const sum = Number(amount);
  if (!Number.isFinite(sum) || sum <= 0) {
    throw new Error('Укажите положительную сумму');
  }
  if (!comment.trim()) {
    throw new Error('Укажите комментарий / основание операции');
  }
  if (!userIds.length) {
    throw new Error('Не выбраны пользователи');
  }

  const opType = normalizeWalletOpType(type);
  const delta = opType === WALLET_OP_TYPE.DEPOSIT ? sum : -sum;

  /** @type {Array<{ user: object, wallet: object, needsWalletInit: boolean }>} */
  const eligible = [];
  /** @type {Array<{ userId: string, name?: string, reason: string }>} */
  const skipped = [];

  for (const id of userIds) {
    const snap = await getDoc(doc(db, COL.USERS, id));
    if (!snap.exists()) {
      skipped.push({ userId: id, reason: 'Пользователь не найден' });
      continue;
    }

    const user = normalizeCrmUser({ id: snap.id, ...snap.data() });
    let wallet = user.wallets?.[walletId];
    let needsWalletInit = false;

    if (!wallet) {
      if (!walletDef) {
        skipped.push({ userId: id, name: user.name, reason: 'Кошелёк не найден' });
        continue;
      }
      wallet = {
        name: walletDef.name,
        balance: 0,
        allowedCategories: walletDef.allowedCategories || [],
      };
      needsWalletInit = true;
    }

    const currentBalance = Number(wallet.balance) || 0;
    if (currentBalance + delta < 0) {
      skipped.push({ userId: id, name: user.name, reason: 'Недостаточно средств' });
      continue;
    }

    eligible.push({ user, wallet, needsWalletInit });
  }

  if (!eligible.length) {
    const first = skipped[0];
    throw new Error(first?.reason || 'Нет пользователей для операции');
  }

  let done = 0;
  const total = eligible.length;
  const trimmedComment = comment.trim();

  for (let i = 0; i < eligible.length; i += BULK_WALLET_BATCH_USERS) {
    const chunk = eligible.slice(i, i + BULK_WALLET_BATCH_USERS);
    const batch = writeBatch(db);

    for (const { user, wallet, needsWalletInit } of chunk) {
      const userRef = doc(db, COL.USERS, user.id);
      const historyRef = doc(collection(userRef, USER_SUB.WALLET_HISTORY));

      /** @type {Record<string, unknown>} */
      const updatePayload = {
        [`wallets.${walletId}.balance`]: increment(delta),
        balance: increment(delta),
      };

      if (needsWalletInit) {
        updatePayload[`wallets.${walletId}.name`] = wallet.name;
        updatePayload[`wallets.${walletId}.allowedCategories`] = wallet.allowedCategories || [];
      }

      batch.update(userRef, updatePayload);
      batch.set(
        historyRef,
        createWalletHistoryDoc({
          walletId,
          walletName: wallet.name,
          type: opType,
          amount: sum,
          comment: trimmedComment,
          performedBy,
        }),
      );
    }

    await batch.commit();
    done += chunk.length;
    onProgress?.({ done, total });
  }

  return { processed: done, skipped };
}

/**
 * @param {object} p
 * @param {'group'|'loyalty'|'manual'} p.targetMode
 * @param {string|null} [p.groupId]
 * @param {string|null} [p.loyaltyCategoryId]
 * @param {string[]} [p.manualUserIds]
 * @param {Array<object>} [p.allUsers]
 */
export function resolveDistributionUserIds({
  targetMode,
  groupId = null,
  loyaltyCategoryId = null,
  manualUserIds = [],
  allUsers = [],
}) {
  if (targetMode === 'manual') {
    return [...new Set(manualUserIds)];
  }
  if (targetMode === 'group') {
    if (!groupId) return [];
    return allUsers.filter(u => u.userGroupId === groupId).map(u => u.id);
  }
  if (targetMode === 'loyalty') {
    if (!loyaltyCategoryId) return [];
    return allUsers.filter(u => u.loyaltyCategoryId === loyaltyCategoryId).map(u => u.id);
  }
  return [];
}

