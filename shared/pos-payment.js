/**
 * POS cashier — finalize split / combined payment on an open order.
 * Persists check, per-payment transactions, and posPayments on the order.
 */

import {
  doc,
  collection,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase.js';
import { POS_PAYMENT_TYPE_IDS } from './pos-channel.js';
import {
  COL,
  ORDER_STATUS,
  PAYMENT_STATUS,
  TX_TYPE,
  TX_STATUS,
  USER_SUB,
  WALLET_OP_TYPE,
  createTransactionDoc,
  createWalletHistoryDoc,
  normalizeUserWallets,
  totalWalletBalance,
} from './schema.js';

function generateFiscalData() {
  const fd = String(Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000);
  const fp = String(Math.floor(Math.random() * 900_000) + 100_000);
  return { fd, fp };
}

/** @param {string} methodId */
export function posPaymentTxType(methodId) {
  switch (methodId) {
    case POS_PAYMENT_TYPE_IDS.CASH:
      return TX_TYPE.CASH;
    case POS_PAYMENT_TYPE_IDS.CARD:
      return TX_TYPE.BANK_CARD;
    case POS_PAYMENT_TYPE_IDS.INTERNAL:
      return TX_TYPE.INTERNAL_BALANCE;
    case POS_PAYMENT_TYPE_IDS.DOTATION:
      return TX_TYPE.DOTATION;
    default:
      return TX_TYPE.BANK_CARD;
  }
}

/** @param {string} methodId @param {string} [methodName] */
export function posPaymentTypeLabel(methodId, methodName = '') {
  switch (methodId) {
    case POS_PAYMENT_TYPE_IDS.CASH:
      return 'Оплата наличными';
    case POS_PAYMENT_TYPE_IDS.CARD:
      return 'Оплата картой';
    case POS_PAYMENT_TYPE_IDS.INTERNAL:
      return 'Списание с личного кошелька';
    case POS_PAYMENT_TYPE_IDS.DOTATION:
      return 'Оплата дотацией';
    default:
      return methodName || 'Оплата заказа';
  }
}

/** @param {Array<{ methodId?: string, amount?: number }>} payments */
function aggregatePaymentParts(payments) {
  const parts = { cash: 0, card: 0, balance: 0, dotation: 0 };
  for (const p of payments) {
    const amount = Number(p.amount) || 0;
    switch (p.methodId) {
      case POS_PAYMENT_TYPE_IDS.CASH:
        parts.cash += amount;
        break;
      case POS_PAYMENT_TYPE_IDS.CARD:
        parts.card += amount;
        break;
      case POS_PAYMENT_TYPE_IDS.INTERNAL:
        parts.balance += amount;
        break;
      case POS_PAYMENT_TYPE_IDS.DOTATION:
        parts.dotation += amount;
        break;
      default:
        parts.card += amount;
        break;
    }
  }
  return parts;
}

/** @param {string} methodId */
function walletIdForPosMethod(methodId) {
  if (methodId === POS_PAYMENT_TYPE_IDS.DOTATION) return 'dotation';
  if (methodId === POS_PAYMENT_TYPE_IDS.INTERNAL) return 'personal';
  return '';
}

/**
 * @typedef {object} PosPaymentLine
 * @property {string} methodId
 * @property {string} method
 * @property {number} amount
 * @property {Date} [at]
 */

/**
 * @typedef {object} FinalizePosPaymentOptions
 * @property {string} orderId
 * @property {Array<PosPaymentLine>} payments
 * @property {Array<{ dishId?: string, name: string, price: number, quantity: number }>} items
 * @property {number} orderTotal
 * @property {string|null} [guestId]
 * @property {string|null} [guestName]
 * @property {string|null} [cashierLogin]
 * @property {string|null} [posStationName]
 * @property {string|null} [posPointName]
 * @property {string} [performedBy='pos-cashier']
 */

/**
 * @param {FinalizePosPaymentOptions} options
 * @returns {Promise<{ checkId: string, orderNumber?: string }>}
 */
export async function finalizePosOrderPayment(options) {
  const {
    orderId,
    payments,
    items,
    orderTotal,
    guestId = null,
    guestName = null,
    cashierLogin = null,
    posStationName = null,
    posPointName = null,
    performedBy = 'pos-cashier',
  } = options;

  const paidTotal = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const expected = Number(orderTotal) || 0;
  if (Math.abs(paidTotal - expected) > 0.02) {
    throw new Error(`Сумма платежей (${paidTotal}) не совпадает с суммой заказа (${expected})`);
  }

  const orderRef = doc(db, COL.ORDERS, orderId);
  const checksCol = collection(db, COL.CHECKS);
  const txCol = collection(db, COL.TRANSACTIONS);
  const checkRef = doc(checksCol);
  const checkId = checkRef.id;

  const posPayments = payments.map(p => ({
    methodId: p.methodId,
    method: p.method,
    amount: Number(p.amount) || 0,
    at: p.at || new Date(),
  }));

  const result = await runTransaction(db, async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) {
      throw new Error(`Order ${orderId} not found.`);
    }

    const order = orderSnap.data();
    if (order.paymentStatus === PAYMENT_STATUS.PAID) {
      throw new Error(`Order ${orderId} is already paid.`);
    }

    const orderNumber = order.orderNumber || orderId.slice(0, 8);
    const userId = guestId || order.userId;
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const total = expected;
    const paymentParts = aggregatePaymentParts(payments);
    const fiscalData = generateFiscalData();

    /** @type {Array<{ methodId: string, amount: number, balanceAfter: number, walletId: string, walletName: string }>} */
    const walletTxMeta = [];
    let guestUserName = guestName || '';

    const walletPayments = payments.filter(p =>
      p.methodId === POS_PAYMENT_TYPE_IDS.INTERNAL
      || p.methodId === POS_PAYMENT_TYPE_IDS.DOTATION,
    );

    if (walletPayments.length && userId && !String(userId).startsWith('demo-')) {
      const userRef = doc(db, COL.USERS, userId);
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) {
        throw new Error(`User ${userId} not found.`);
      }

      const user = userSnap.data();
      guestUserName = guestUserName || user.name || '';
      const wallets = normalizeUserWallets(user);

      for (const payment of walletPayments) {
        const walletId = walletIdForPosMethod(payment.methodId);
        const wallet = wallets[walletId];
        if (!wallet) {
          throw new Error(`Кошелёк «${walletId}» недоступен для оплаты`);
        }
        const current = Number(wallet.balance) || 0;
        const amount = Number(payment.amount) || 0;
        if (amount > current + 0.001) {
          throw new Error(`Недостаточно средств на кошельке «${wallet.name || walletId}»`);
        }
        const nextBalance = Math.round((current - amount) * 100) / 100;
        wallets[walletId] = { ...wallet, balance: nextBalance };
        walletTxMeta.push({
          methodId: payment.methodId,
          amount,
          balanceAfter: nextBalance,
          walletId,
          walletName: wallet.name || walletId,
        });

        const historyRef = doc(collection(userRef, USER_SUB.WALLET_HISTORY));
        transaction.set(historyRef, createWalletHistoryDoc({
          walletId,
          walletName: wallet.name || walletId,
          type: WALLET_OP_TYPE.WITHDRAW,
          amount,
          comment: `Оплата заказа №${orderNumber}`,
          performedBy,
        }));
      }

      transaction.update(userRef, {
        wallets,
        balance: totalWalletBalance(wallets, { spendableOnly: true }),
      });
    }

    transaction.set(checkRef, {
      orderId,
      userId,
      subtotal,
      total,
      paymentParts,
      posPayments,
      fiscalData,
      source: 'pos',
      createdAt: serverTimestamp(),
    });

    const walletMetaQueue = [...walletTxMeta];

    for (const payment of payments) {
      const amount = Number(payment.amount) || 0;
      if (amount <= 0) continue;

      const txRef = doc(txCol);
      const walletId = walletIdForPosMethod(payment.methodId);
      let balanceAfter = null;
      let walletName = '';
      if (walletId) {
        const metaIdx = walletMetaQueue.findIndex(m =>
          m.methodId === payment.methodId && Math.abs(m.amount - amount) < 0.001,
        );
        if (metaIdx >= 0) {
          const [meta] = walletMetaQueue.splice(metaIdx, 1);
          balanceAfter = meta.balanceAfter;
          walletName = meta.walletName;
        } else {
          walletName = walletId === 'dotation' ? 'Дотация' : 'Личный кошелёк';
        }
      }

      const txPayload = createTransactionDoc({
        checkId,
        orderId,
        type: posPaymentTxType(payment.methodId),
        amount,
        status: TX_STATUS.SUCCESS,
        userId: userId || '',
        userName: guestUserName,
        walletId,
        walletName,
        balanceAfter,
        source: 'pos',
        comment: `Часть оплаты заказа №${orderNumber} · ${payment.method}`,
      });
      txPayload.methodId = payment.methodId;
      txPayload.methodName = payment.method;
      txPayload.typeLabel = posPaymentTypeLabel(payment.methodId, payment.method);
      txPayload.orderNumber = orderNumber;
      transaction.set(txRef, txPayload);
    }

    transaction.update(orderRef, {
      items,
      userId,
      checkId,
      paymentStatus: PAYMENT_STATUS.PAID,
      status: ORDER_STATUS.COOKING,
      paidAt: serverTimestamp(),
      posPayments,
      paymentParts,
      cashierLogin,
      posStationName,
      posPointName,
    });

    return { checkId, orderNumber };
  });

  return result;
}
