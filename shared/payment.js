/**
 * processOrderPayment — atomic Firestore transaction for order payment.
 *
 * Supports wallet-based payment via { walletId, useBalance } or legacy boolean useBalance.
 */

import {
  doc,
  collection,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase.js';
import {
  COL,
  ORDER_STATUS,
  PAYMENT_STATUS,
  TX_TYPE,
  TX_STATUS,
  USER_SUB,
  WALLET_OP_TYPE,
  createWalletHistoryDoc,
  normalizeUserWallets,
  totalWalletBalance,
} from './schema.js';
import {
  resolveOrderCategoryGroupIds,
  resolvePaymentWallet,
} from './wallets.js';

function generateFiscalData() {
  const fd = String(Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000);
  const fp = String(Math.floor(Math.random() * 900_000) + 100_000);
  return { fd, fp };
}

/**
 * @typedef {object} OrderPaymentOptions
 * @property {boolean} [useBalance=false]
 * @property {string|null} [walletId]
 * @property {Array<{ id: string, name: string }>} [categoryGroups]
 * @property {Map<string, string>|Record<string, string>} [dishCategoryById]
 * @property {string} [performedBy='order-payment']
 */

/**
 * @param {string} orderId
 * @param {boolean|OrderPaymentOptions} [options=false]
 * @returns {Promise<{ checkId: string, check: object, walletId?: string, walletName?: string }>}
 */
export async function processOrderPayment(orderId, options = false) {
  const opts = typeof options === 'boolean'
    ? { useBalance: options }
    : (options || {});

  const {
    useBalance = false,
    walletId: requestedWalletId = null,
    categoryGroups = [],
    dishCategoryById = null,
    performedBy = 'order-payment',
  } = opts;

  const orderRef = doc(db, COL.ORDERS, orderId);
  const checksCol = collection(db, COL.CHECKS);
  const txCol = collection(db, COL.TRANSACTIONS);
  const checkRef = doc(checksCol);
  const txBalanceRef = doc(txCol);
  const txCardRef = doc(txCol);
  const checkId = checkRef.id;

  const result = await runTransaction(db, async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) {
      throw new Error(`Order ${orderId} not found.`);
    }

    const order = orderSnap.data();
    if (order.paymentStatus === PAYMENT_STATUS.PAID) {
      throw new Error(`Order ${orderId} is already paid.`);
    }

    const userRef = doc(db, COL.USERS, order.userId);
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) {
      throw new Error(`User ${order.userId} not found.`);
    }

    const user = userSnap.data();
    const wallets = normalizeUserWallets(user);
    const categoryGroupIds = resolveOrderCategoryGroupIds(
      order.items,
      categoryGroups,
      dishCategoryById,
    );

    const subtotal = order.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    const total = subtotal;

    let balanceUsed = 0;
    let cardUsed = total;
    let paidWalletId = '';
    let paidWalletName = '';

    if (useBalance) {
      const resolved = resolvePaymentWallet(wallets, {
        walletId: requestedWalletId,
        categoryGroupIds,
      });

      if (!resolved) {
        throw new Error('Нет доступного кошелька для оплаты заказа');
      }

      const { walletId, wallet } = resolved;
      const walletBalance = Number(wallet.balance) || 0;
      balanceUsed = Math.min(walletBalance, total);
      cardUsed = total - balanceUsed;

      if (balanceUsed <= 0) {
        throw new Error('Недостаточно средств на кошельке');
      }

      paidWalletId = walletId;
      paidWalletName = wallet.name || walletId;

      const newWalletBalance = walletBalance - balanceUsed;
      wallets[walletId] = {
        ...wallet,
        balance: newWalletBalance,
      };

      transaction.update(userRef, {
        wallets,
        balance: totalWalletBalance(wallets, { spendableOnly: true }),
      });

      const historyRef = doc(collection(userRef, USER_SUB.WALLET_HISTORY));
      transaction.set(historyRef, createWalletHistoryDoc({
        walletId,
        walletName: paidWalletName,
        type: WALLET_OP_TYPE.WITHDRAW,
        amount: balanceUsed,
        comment: `Оплата заказа №${order.orderNumber || orderId}`,
        performedBy,
      }));
    }

    const paymentParts = { balance: balanceUsed, card: cardUsed };
    const fiscalData = generateFiscalData();

    const checkData = {
      orderId,
      userId: order.userId,
      subtotal,
      total,
      paymentParts,
      fiscalData,
      createdAt: serverTimestamp(),
      ...(paidWalletId ? { walletId: paidWalletId, walletName: paidWalletName } : {}),
    };
    transaction.set(checkRef, checkData);

    if (balanceUsed > 0) {
      transaction.set(txBalanceRef, {
        checkId,
        orderId,
        type: TX_TYPE.INTERNAL_BALANCE,
        amount: balanceUsed,
        status: TX_STATUS.SUCCESS,
        userId: order.userId,
        userName: user.name || '',
        walletId: paidWalletId,
        walletName: paidWalletName,
        balanceAfter: wallets[paidWalletId]?.balance ?? null,
        source: order.source || '',
        createdAt: serverTimestamp(),
      });
    }

    if (cardUsed > 0) {
      const cardTxRef = balanceUsed > 0 ? txCardRef : txBalanceRef;
      transaction.set(cardTxRef, {
        checkId,
        orderId,
        type: TX_TYPE.BANK_CARD,
        amount: cardUsed,
        status: TX_STATUS.SUCCESS,
        createdAt: serverTimestamp(),
      });
    }

    transaction.update(orderRef, {
      checkId,
      paymentStatus: PAYMENT_STATUS.PAID,
      status: ORDER_STATUS.COOKING,
      paidAt: serverTimestamp(),
      ...(paidWalletId ? { paidWalletId, paidWalletName } : {}),
    });

    return {
      checkId,
      check: checkData,
      walletId: paidWalletId || undefined,
      walletName: paidWalletName || undefined,
    };
  });

  return result;
}
