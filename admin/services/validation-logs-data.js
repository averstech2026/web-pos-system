import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
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

/** @returns {Promise<Array<object>>} */
export async function fetchValidatorTransactions(limitCount = 500) {
  const snap = await getDocs(query(
    collection(db, COL.TRANSACTIONS),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  ));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(t => t.type === TX_TYPE.VALIDATOR_DEDUCT || t.source === 'validator');
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
      comment: `Списание по валидатору (По пропуску): ${ruleName}`,
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
      ruleName,
      balanceAfter,
      source: 'validator',
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
