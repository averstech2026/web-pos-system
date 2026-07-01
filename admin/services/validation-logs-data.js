import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import {
  COL,
  TX_TYPE,
  USER_SUB,
  WALLET_OP_TYPE,
  createTransactionDoc,
  createValidationLogDoc,
  createWalletHistoryDoc,
  normalizeUserWallets,
} from '../../shared/schema.js';

/**
 * @param {{ limitCount?: number, userId?: string }} [opts]
 * @returns {Promise<Array<object>>}
 */
export async function fetchValidationLogs(opts = {}) {
  const { limitCount = 500, userId = '' } = opts;
  const fetchLimit = userId ? Math.max(limitCount, 1000) : limitCount;
  const snap = await getDocs(query(
    collection(db, COL.VALIDATION_LOGS),
    orderBy('createdAt', 'desc'),
    limit(fetchLimit),
  ));
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (userId) rows = rows.filter(r => r.userId === userId).slice(0, limitCount);
  return rows;
}

/**
 * Сброс демо валидатора: возврат списаний + удаление логов проходов.
 * @param {object} p
 * @param {string[]} p.userIds
 * @param {string} p.performedBy
 * @returns {Promise<{ logsDeleted: number, refunds: number }>}
 */
export async function resetValidatorDemoForUsers({ userIds, performedBy }) {
  const idSet = new Set(userIds.filter(Boolean));
  if (!idSet.size) return { logsDeleted: 0, refunds: 0 };

  const logs = await fetchValidationLogs({ limitCount: 1000 });
  const userLogs = logs.filter(l => idSet.has(l.userId));

  const moneyLogs = userLogs.filter(l =>
    l.status === 'success'
    && l.deductionType === 'money'
    && l.walletId
    && Number(l.amount) > 0);

  let refunds = 0;
  for (const log of moneyLogs) {
    await refundValidatorMoneyDeduction({
      userId: log.userId,
      walletId: log.walletId,
      amount: log.amount,
      ruleName: log.ruleName || '—',
      performedBy,
    });
    refunds += 1;
  }

  if (!userLogs.length) return { logsDeleted: 0, refunds };

  const BATCH_LIMIT = 500;
  let logsDeleted = 0;

  for (let i = 0; i < userLogs.length; i += BATCH_LIMIT) {
    const chunk = userLogs.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const log of chunk) {
      batch.delete(doc(db, COL.VALIDATION_LOGS, log.id));
    }
    await batch.commit();
    logsDeleted += chunk.length;
  }

  return { logsDeleted, refunds };
}

/** @deprecated use resetValidatorDemoForUsers */
export async function clearValidationLogsForUsers(userIds) {
  const { logsDeleted } = await resetValidatorDemoForUsers({
    userIds,
    performedBy: 'validator-terminal',
  });
  return logsDeleted;
}

/**
 * @param {object} p
 */
async function refundValidatorMoneyDeduction({
  userId,
  walletId,
  amount,
  ruleName,
  performedBy,
}) {
  const sum = Number(amount);
  if (!Number.isFinite(sum) || sum <= 0) return;

  const userRef = doc(db, COL.USERS, userId);

  await runTransaction(db, async tx => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) throw new Error('Пользователь не найден');

    const userData = userSnap.data();
    const wallets = normalizeUserWallets(userData);
    const wallet = wallets[walletId];
    if (!wallet) throw new Error('Кошелёк не найден');

    const balanceAfter = (Number(wallet.balance) || 0) + sum;
    wallets[walletId] = { ...wallet, balance: balanceAfter };
    const comment = `Возврат по сбросу валидатора: ${ruleName}`;

    tx.update(userRef, {
      wallets,
      balance: Object.values(wallets).reduce((s, w) => s + (Number(w.balance) || 0), 0),
    });

    tx.set(doc(collection(userRef, USER_SUB.WALLET_HISTORY)), createWalletHistoryDoc({
      walletId,
      walletName: wallet.name,
      type: WALLET_OP_TYPE.DEPOSIT,
      amount: sum,
      comment,
      performedBy,
    }));

    tx.set(doc(collection(db, COL.TRANSACTIONS)), createTransactionDoc({
      type: TX_TYPE.VALIDATOR_REFUND,
      amount: sum,
      userId,
      userName: userData.name || '',
      walletId,
      walletName: wallet.name,
      ruleName,
      balanceAfter,
      source: 'validator',
      comment,
    }));
  });
}

/** @returns {Promise<Array<object>>} */
export async function fetchValidatorTransactions(limitCount = 500) {
  const snap = await getDocs(query(
    collection(db, COL.TRANSACTIONS),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  ));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(t =>
      t.type === TX_TYPE.VALIDATOR_DEDUCT
      || t.type === TX_TYPE.VALIDATOR_REFUND
      || t.source === 'validator');
}

/**
 * @param {object} result - output from evaluateValidation
 * @param {object} p
 * @param {string} p.performedBy
 * @param {string} [p.channelPoint]
 */
export async function persistValidationResult(result, { performedBy, channelPoint = 'Раздача' }) {
  const status = result.status === 'success' ? 'success' : 'denied';
  const logPayload = createValidationLogDoc({
    userId: result.user?.id || '',
    userName: result.userName || result.user?.name || '—',
    cardNumber: result.cardNumber || result.user?.qrCode || '—',
    channelPoint: result.channelPoint || channelPoint,
    ruleId: result.rule?.id || '',
    ruleName: result.rule?.name || '',
    status,
    denyReason: result.denyReason || '',
    deductionType: result.deductionType || '',
    deductionSummary: result.deductionSummary || '',
    balanceAfter: result.balanceAfter ?? null,
    approachesLeft: result.approachesLeft ?? null,
    walletId: result.walletId || '',
    amount: result.amount || 0,
  });

  if (status === 'success' && result.deductionType === 'money' && result.user?.id) {
    if (String(result.user.id).startsWith('demo-')) {
      await addDoc(collection(db, COL.VALIDATION_LOGS), {
        ...logPayload,
        balanceAfter: result.balanceAfter ?? null,
      });
      return;
    }
    await applyValidatorWalletDeduction({
      userId: result.user.id,
      walletId: result.walletId,
      amount: result.amount,
      ruleName: result.rule?.name || '',
      performedBy,
      logPayload,
    });
    return;
  }

  await addDoc(collection(db, COL.VALIDATION_LOGS), logPayload);
}

/**
 * @param {object} p
 */
async function applyValidatorWalletDeduction({
  userId,
  walletId,
  amount,
  ruleName,
  performedBy,
  logPayload,
}) {
  const sum = Number(amount);
  if (!Number.isFinite(sum) || sum <= 0) {
    await addDoc(collection(db, COL.VALIDATION_LOGS), logPayload);
    return;
  }

  const userRef = doc(db, COL.USERS, userId);

  await runTransaction(db, async tx => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) throw new Error('Пользователь не найден');

    const userData = userSnap.data();
    const wallets = normalizeUserWallets(userData);
    const wallet = wallets[walletId];
    if (!wallet) throw new Error('Кошелёк не найден');

    const balanceAfter = (Number(wallet.balance) || 0) - sum;
    wallets[walletId] = { ...wallet, balance: balanceAfter };
    const comment = `Списание по валидатору (По пропуску): ${ruleName}`;

    tx.update(userRef, {
      wallets,
      balance: Object.values(wallets).reduce((s, w) => s + (Number(w.balance) || 0), 0),
    });

    const historyRef = doc(collection(userRef, USER_SUB.WALLET_HISTORY));
    tx.set(historyRef, createWalletHistoryDoc({
      walletId,
      walletName: wallet.name,
      type: WALLET_OP_TYPE.WITHDRAW,
      amount: sum,
      comment,
      performedBy,
    }));

    const txRef = doc(collection(db, COL.TRANSACTIONS));
    tx.set(txRef, createTransactionDoc({
      type: TX_TYPE.VALIDATOR_DEDUCT,
      amount: sum,
      userId,
      userName: userData.name || '',
      walletId,
      walletName: wallet.name,
      ruleId: logPayload.ruleId || '',
      ruleName,
      balanceAfter,
      source: 'validator',
      comment,
    }));

    const logRef = doc(collection(db, COL.VALIDATION_LOGS));
    tx.set(logRef, {
      ...logPayload,
      balanceAfter,
    });
  });
}

/**
 * @param {string} userId
 * @param {import('../../shared/validation-rules.js').ValidationRuleDoc[]} rules
 * @param {Date} [now]
 */
export async function fetchUserApproachStats(userId, rules, now = new Date(), user = null, shiftsById = null) {
  const logs = await fetchValidationLogs({ userId, limitCount: 200 });
  const { countSuccessfulApproaches } = await import('../../shared/validation-rules.js');

  return rules.map(rule => {
    const used = countSuccessfulApproaches(logs, userId, rule, now, undefined, {
      user: user || { id: userId },
      shiftsById,
    });
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      used,
      limit: rule.approachLimit,
      remaining: Math.max(0, rule.approachLimit - used),
    };
  });
}
